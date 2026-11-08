"""#4 One-Tap Package Builder: up to three vendor bundles (cheapest, balanced, highest quality) within the budget.

    python -m shevent_ml.models.packages              # evaluate on real vendors and a synthetic pool, next to greedy
    python -m shevent_ml.models.packages --demo Q01   # the packages for one matching-set event, real vendors

Each package is one OR-Tools CP-SAT solve: exactly one vendor per category, total price within the budget. A vendor
can be chosen only if #3 kept it (it can handle the guests) and it serves the area, isn't sponsored and isn't booked
that day. Prices are the vendor's listed price, else #2's estimate for its tier. The solves differ only in what they
maximise: total #3 match score (balanced), lowest total (cheapest) or the quality part of the score (highest
quality). Each later package must differ from the earlier ones (configs/packages.yaml). The baseline picks the best
match per category within that category's share of the budget, with no look at the total.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from ortools.sat.python import cp_model

from shevent_ml.config import CATEGORIES, PROCESSED_DIR, load_config
from shevent_ml.models.matching import VendorMatcher, lakh, listed_totals
from shevent_ml.models.price_features import TIER_RANK

PACKAGE_KINDS = ["cheapest", "balanced", "highest_quality"]


class PlanEstimates:
    """#2 for the plan being packaged: every tier's estimate from one prediction, kept for the whole request rather
    than asked again for each category and vendor."""

    TIERS = [None, *TIER_RANK]

    def __init__(self, price_estimator):
        self.price_estimator = price_estimator
        self.key, self.by_tier = None, {}

    @property
    def version(self):
        return self.price_estimator.version

    def estimate_plan(self, plan, tier=None):
        key = json.dumps(plan, sort_keys=True, default=str)
        if key != self.key:
            self.key, self.by_tier = key, self.price_estimator.estimate_plan_tiers(plan, self.TIERS)
        return self.by_tier[tier if tier in TIER_RANK else None]


class PackageBuilder:
    def __init__(self, prices=None, price_estimator=None, allocator=None, settings=None, matcher_settings=None):
        """prices: data/processed/prices.parquet. price_estimator (#2) prices vendors with no listed price; without
        it they are left out. allocator (#1) only sets the category budgets #3's price fit and the baseline use."""
        self.settings = settings or load_config("packages")
        self.estimates = PlanEstimates(price_estimator) if price_estimator is not None else None
        self.matcher = VendorMatcher(matcher_settings, prices, self.estimates, allocator)

    @property
    def version(self):
        return f"packages-v1/{self.estimates.version if self.estimates else 'listed-prices-only'}"

    def pool(self, plan, category, vendors, unavailable=()):
        """The vendors the solver may pick for one category, with price, range, match score and quality."""
        v = self.matcher.score(plan, category, vendors, with_reasons=False)
        v = v[~v["sponsored"] & ~v["vendor_id"].isin(set(unavailable))]
        if self.settings["exclude_other_areas"]:
            v = v[v["location"] != self.matcher.settings["location"]["elsewhere"]]
        if v.empty:
            return v
        guests = plan["guest_count"]
        prices = self.matcher.prices
        price = v["likely_pkr"].to_numpy(dtype=float)
        low = listed_totals(prices, category, guests, v["vendor_id"], "low_pkr_adj").to_numpy(dtype=float)
        high = listed_totals(prices, category, guests, v["vendor_id"], "high_pkr_adj").to_numpy(dtype=float)
        listed = (v["price_source"] == "listed").to_numpy()
        if self.estimates is not None:
            # Vendors #3 priced from their tier, and vendors with no tier and no listed price (all vendors' range).
            for i, tier in enumerate(v["price_tier"]):
                if listed[i]:
                    continue
                estimate = self.estimates.estimate_plan(plan, tier=tier if tier in TIER_RANK else None).loc[category]
                price[i], low[i], high[i] = estimate["mid"], estimate["low"], estimate["high"]
        v = v.assign(
            price_pkr=np.round(price, -3),
            price_low=np.fmin(np.where(np.isnan(low), price, low), price),
            price_high=np.fmax(np.where(np.isnan(high), price, high), price),
            price_is_estimate=~listed,
            match=v["score"].clip(0, 1),
            quality_part=v["quality"].astype(float).fillna(self.matcher.settings["unknown"]),
        )
        v = v[v["price_pkr"].notna()].sort_values("vendor_id")
        n = self.settings["candidates_per_list"]
        keep = set(v.nlargest(n, "match").index) | set(v.nsmallest(n, "price_pkr").index)
        keep |= set(v.nlargest(n, "quality_part").index)
        return v.loc[sorted(keep, key=v.index.get_loc)].reset_index(drop=True)

    def pools(self, plan, categories, vendors, unavailable=()):
        return {c: self.pool(plan, c, vendors, unavailable) for c in categories}

    def solve(self, pools, budget, kind, previous=()):
        """One package: {category: row index in its pool}, or None if no bundle fits the budget (and differs)."""
        s = self.settings
        model = cp_model.CpModel()
        picks = {c: [model.new_bool_var(f"{c}_{i}") for i in range(len(pool))] for c, pool in pools.items()}
        for chosen in picks.values():
            model.add_exactly_one(chosen)

        def total(column, scale, rounding=np.round):
            return sum(
                int(value) * x
                for c, pool in pools.items()
                for value, x in zip(rounding(pool[column].to_numpy() * scale), picks[c], strict=True)
            )

        # Prices are whole thousands, so the budget check in thousands is exact.
        cost, match, quality = total("price_pkr", 1e-3), total("match", 1000), total("quality_part", 1000)
        model.add(cost <= int(budget // 1000))
        most = min(s["min_different"], len(pools))
        for package in previous:
            model.add(sum(picks[c][i] for c, i in package.items()) <= len(pools) - most)

        # Ties are broken lexicographically: solve for the first goal, hold it, then the next. (One weighted sum with
        # each weight above the range of the rest needs huge coefficients, and CP-SAT slows down a lot on them.)
        goals = {
            "cheapest": [(cost, "min"), (match, "max")],
            "balanced": [(match, "max"), (cost, "min")],
            "highest_quality": [(quality, "max"), (match, "max"), (cost, "min")],
        }[kind]
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = s["max_seconds_per_solve"]
        solver.parameters.num_workers = s["workers"]
        solver.parameters.random_seed = 0
        package = None
        for expression, sense in goals:
            (model.minimize if sense == "min" else model.maximize)(expression)
            if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                break
            package = {c: next(i for i, x in enumerate(chosen) if solver.value(x)) for c, chosen in picks.items()}
            reached = int(solver.objective_value)
            model.add(expression <= reached if sense == "min" else expression >= reached)
            model.clear_hints()
            for c, chosen in picks.items():
                for i, x in enumerate(chosen):
                    model.add_hint(x, i == package[c])
        return package

    def build(self, plan, categories, vendors, unavailable=()):
        """The #4 response: packages in PACKAGE_KINDS order, categories nobody can cover, and when no bundle fits the
        budget, what the cheapest one costs."""
        start = time.perf_counter()
        budget = float(plan["total_budget_pkr"])
        pools = self.pools(plan, categories, vendors, unavailable)
        unfilled = [c for c in categories if pools[c].empty]
        pools = {c: pool for c, pool in pools.items() if not pool.empty}
        solved = {}
        cheapest = sum(pool["price_pkr"].min() for pool in pools.values())
        # Over budget even at each category's cheapest vendor: no bundle fits, so skip the solver (proving it can
        # take CP-SAT its whole time limit).
        solve_start = time.perf_counter()
        if pools and cheapest <= budget:
            for kind in self.settings["solve_order"]:
                package = self.solve(pools, budget, kind, list(solved.values()))
                if package is not None:
                    solved[kind] = package
        packages = [self.describe(kind, solved[kind], pools) for kind in PACKAGE_KINDS if kind in solved]
        return {
            "budget_pkr": budget,
            "packages": packages,
            "unfilled_categories": unfilled,
            "cheapest_total_pkr": float(cheapest) if pools and not packages else None,
            "seconds": time.perf_counter() - start,
            "solve_seconds": time.perf_counter() - solve_start,
            "model_version": self.version,
        }

    @staticmethod
    def describe(kind, package, pools):
        items = []
        for c, i in package.items():
            row = pools[c].iloc[i]
            items.append(
                {
                    "vendor_id": row["vendor_id"],
                    "name": row["name"],
                    "category": c,
                    "price_pkr": float(row["price_pkr"]),
                    "price_is_estimate": bool(row["price_is_estimate"]),
                    "price_range": [float(np.round(row["price_low"], -3)), float(np.round(row["price_high"], -3))],
                    "score": round(float(row["match"]), 3),
                    "quality": float(row["quality_part"]),
                }
            )
        return {"kind": kind, "total_pkr": sum(item["price_pkr"] for item in items), "items": items}


def greedy_package(builder, plan, pools):
    """Baseline: per category, the best match within its share of the budget (else the cheapest), blind to the total."""
    items = {}
    for c, pool in pools.items():
        ranked = pool.sort_values(["match", "vendor_id"], ascending=[False, True])
        fits = ranked[ranked["price_pkr"] <= builder.matcher.category_budget(plan, c)]
        items[c] = fits.iloc[0] if not fits.empty else ranked.sort_values(["price_pkr", "vendor_id"]).iloc[0]
    return {
        "total_pkr": float(sum(row["price_pkr"] for row in items.values())),
        "score": float(np.mean([row["match"] for row in items.values()])),
    }


def mean_score(package):
    return float(np.mean([item["score"] for item in package["items"]]))


def evaluate(builder, plans, vendors, categories=CATEGORIES):
    """Exit gate (every package within budget, under 1 s) and the balanced package against the greedy baseline."""
    rows = []
    for plan in plans:
        result = builder.build(plan, categories, vendors)
        pools = {c: p for c, p in builder.pools(plan, categories, vendors).items() if not p.empty}
        greedy = greedy_package(builder, plan, pools) if pools else None
        packages = {p["kind"]: p for p in result["packages"]}
        chosen = [frozenset((i["category"], i["vendor_id"]) for i in p["items"]) for p in result["packages"]]
        rows.append(
            {
                "has_package": bool(packages),
                "packages": len(packages),
                "within_budget": all(p["total_pkr"] <= result["budget_pkr"] for p in result["packages"]),
                "distinct": len(set(chosen)) == len(chosen),
                "unfilled": len(result["unfilled_categories"]),
                "seconds": result["seconds"],
                "solve_seconds": result["solve_seconds"],
                "balanced_score": mean_score(packages["balanced"]) if "balanced" in packages else np.nan,
                "greedy_within_budget": greedy is not None and greedy["total_pkr"] <= result["budget_pkr"],
                "greedy_score": greedy["score"] if greedy else np.nan,
            }
        )
    r = pd.DataFrame(rows)
    both = r["has_package"] & r["greedy_within_budget"]
    return {
        "plans": len(r),
        "with_package": float(r["has_package"].mean()),
        "all_three": float((r["packages"] == 3).mean()),
        "packages_within_budget": float(r["within_budget"].mean()),
        "packages_distinct": float(r["distinct"].mean()),
        "plans_with_unfilled_category": float((r["unfilled"] > 0).mean()),
        "seconds_p95": float(r["seconds"].quantile(0.95)),
        "seconds_max": float(r["seconds"].max()),
        "solve_seconds_max": float(r["solve_seconds"].max()),
        "greedy_within_budget": float(r["greedy_within_budget"].mean()),
        "balanced_score": float(r["balanced_score"].mean()),
        "greedy_score": float(r["greedy_score"].mean()),
        # Like for like: plans where both found a bundle within budget.
        "balanced_score_both": float(r.loc[both, "balanced_score"].mean()) if both.any() else np.nan,
        "greedy_score_both": float(r.loc[both, "greedy_score"].mean()) if both.any() else np.nan,
    }


def matching_set_plans():
    """The distinct events of the #3 matching set (the three standard scenarios and six more)."""
    plans = {}
    for q in load_config("matching_set")["queries"]:
        plan = {k: q[k] for k in ["event_type", "area", "venue_type", "event_date", "total_budget_pkr"]}
        plans[json.dumps(plan, sort_keys=True)] = {**plan, "guest_count": q["guests"]}
    return list(plans.values())


def synthetic_plans(processed_dir, n, seed):
    events = pd.read_parquet(processed_dir / "synthetic_events.parquet").sample(n, random_state=seed)
    return [
        {
            "event_type": e.event_type,
            "guest_count": int(e.guest_count_invited),
            "area": e.area,
            "venue_type": e.venue_type,
            "event_date": str(pd.Timestamp(e.event_date).date()),
            "total_budget_pkr": float(e.total_budget_pkr),
            "preferences": [p for p in e.preferences.split("|") if p],
        }
        for e in events.itertuples()
    ]


def synthetic_pool(processed_dir, per_category, seed):
    """Synthetic vendors and their listed prices: each takes the tier, unit price and guest count of one synthetic
    event. Flat prices only hold near that guest count, so the rest of the time #2 prices the vendor by its tier."""
    rng = np.random.default_rng(seed)
    events = pd.read_parquet(processed_dir / "synthetic_events.parquet").set_index("event_id")
    services = pd.read_parquet(processed_dir / "synthetic_services.parquet")
    # Areas as often as events are held there, so most events have vendors serving them.
    areas = events["area"].value_counts(normalize=True)
    event_types = sorted(events["event_type"].unique())
    vendors, prices = [], []
    for category in CATEGORIES:
        rows = services[services["category"] == category].sample(per_category, random_state=seed)
        for i, row in enumerate(rows.itertuples(), 1):
            event = events.loc[row.event_id]
            vid = f"SYN-{category[:3].upper()}-{i:03}"
            base = str(rng.choice(areas.index, p=areas.to_numpy()))
            served = {base, *rng.choice(areas.index, size=rng.integers(0, 4), replace=False, p=areas.to_numpy())}
            cap_max = int(rng.choice([150, 300, 500, 800, 1200])) if category in ("venue", "catering") else None
            vendors.append(
                {
                    "vendor_id": vid,
                    "name": f"Synthetic {category} {i}",
                    "category": category,
                    "sub_type": "",
                    "base_area": base,
                    "areas_served": "|".join(sorted(served)),
                    "capacity_min": cap_max // 4 if cap_max else None,
                    "capacity_max": cap_max,
                    "price_tier": event["tier"],
                    "event_types": "|".join(rng.choice(event_types, size=rng.integers(3, 7), replace=False)),
                    "rating": round(float(rng.uniform(3.4, 5.0)), 1),
                    "review_count": int(rng.integers(0, 300)),
                    "years_active": int(rng.integers(1, 25)),
                }
            )
            guests = int(event["guest_count_invited"])
            flat = row.price_basis == "flat"
            prices.append(
                {
                    "vendor_id": vid,
                    "category": category,
                    "price_basis": row.price_basis,
                    "low_pkr_adj": 0.9 * row.unit_price_pkr,
                    "mid_pkr_adj": row.unit_price_pkr,
                    "high_pkr_adj": 1.15 * row.unit_price_pkr,
                    "guest_min": guests // 2 if flat else None,
                    "guest_max": guests * 2 if flat else None,
                    "is_combo": False,
                }
            )
    return pd.DataFrame(vendors), pd.DataFrame(prices)


def load_price_estimator():
    from shevent_ml.models.price_estimator import ARTIFACT_DIR, PriceEstimator

    if not (ARTIFACT_DIR / "meta.json").exists():
        print("No #2 artifact (python -m shevent_ml.models.price_estimator); using listed prices only.")
        return None
    return PriceEstimator.load()


def print_report(name, report):
    print(f"\n{name}: {report['plans']} plans")
    print(
        f"  at least one package {report['with_package']:.0%} · all three {report['all_three']:.0%} · "
        f"within budget {report['packages_within_budget']:.0%} · distinct {report['packages_distinct']:.0%} · "
        f"a category left empty {report['plans_with_unfilled_category']:.0%}"
    )
    print(
        f"  time per request: p95 {report['seconds_p95']:.3f} s, max {report['seconds_max']:.3f} s "
        f"(of which the three solves: max {report['solve_seconds_max']:.3f} s)"
    )
    print(
        f"  greedy baseline within budget {report['greedy_within_budget']:.0%}; mean match score "
        f"balanced {report['balanced_score']:.3f} vs greedy {report['greedy_score']:.3f} "
        f"(both within budget: {report['balanced_score_both']:.3f} vs {report['greedy_score_both']:.3f})"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--demo", metavar="QUERY_ID", help="show the packages for one matching-set query's event")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    settings = load_config("packages")
    estimator = load_price_estimator()
    vendors = pd.read_parquet(args.processed / "vendors.parquet")
    prices_path = args.processed / "prices.parquet"
    builder = PackageBuilder(pd.read_parquet(prices_path) if prices_path.exists() else None, estimator)

    if args.demo:
        query = next(q for q in load_config("matching_set")["queries"] if q["query_id"] == args.demo)
        plan = {k: v for k, v in query.items() if k not in ("query_id", "category", "guests")}
        plan["guest_count"] = query["guests"]
        result = builder.build(plan, CATEGORIES, vendors)
        budget = lakh(plan["total_budget_pkr"])
        print(f"{plan['event_type']}, {plan['guest_count']} guests, {plan['area']}, budget {budget}")
        for package in result["packages"]:
            print(f"\n{package['kind']}: {lakh(package['total_pkr'])}")
            for item in package["items"]:
                estimate = " (AI estimate)" if item["price_is_estimate"] else ""
                price = lakh(item["price_pkr"]) + estimate
                print(f"  {item['category']:<12} {item['name']} {price}, fit {item['score']:.2f}")
        if result["unfilled_categories"]:
            print(f"\nNo vendor that fits: {', '.join(result['unfilled_categories'])}")
        if result["cheapest_total_pkr"] is not None:
            print(f"\nNo bundle fits the budget; the cheapest costs {lakh(result['cheapest_total_pkr'])}.")
        print(f"\n{result['seconds']:.3f} s, {result['model_version']}")
        return 0

    print_report("Real vendors, matching-set events", evaluate(builder, matching_set_plans(), vendors))
    if estimator is None:
        return 0
    ev = settings["evaluation"]
    syn_vendors, syn_prices = synthetic_pool(args.processed, ev["synthetic_vendors_per_category"], ev["seed"])
    syn_builder = PackageBuilder(syn_prices, estimator)
    plans = synthetic_plans(args.processed, ev["synthetic_plans"], ev["seed"])
    print_report("Synthetic vendor pool, synthetic events", evaluate(syn_builder, plans, syn_vendors))
    share = ev["tight_budget_share"]
    tight = [{**plan, "total_budget_pkr": plan["total_budget_pkr"] * share} for plan in plans]
    print_report(f"Same events, {share:.0%} of the budget", evaluate(syn_builder, tight, syn_vendors))
    return 0


if __name__ == "__main__":
    sys.exit(main())
