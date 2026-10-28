"""#3 Vendor Matching v1: rank a category's vendors for an event plan, with a reason for every match.

    python -m shevent_ml.models.matching              # score on the hand-rated matching set, next to sort-by-rating
    python -m shevent_ml.models.matching --demo Q02   # show the matches for one matching-set query

A content-based fit score: a weighted mean of price fit (the vendor's likely price against this category's share of
the budget, from #1 and #2), location, capacity, event-type experience and quality (configs/matching.yaml). Parts a
listing doesn't tell us score a neutral value. Vendors over capacity are left out. New vendors get a small boost so
they are seen. Sponsored vendors never mix into the ranking: they come back in their own, labelled list.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, load_config
from shevent_ml.eval.baselines import rank_by_rating
from shevent_ml.eval.matching_set import CANDIDATES_FILE, LABELS_FILE, load_labels, score_ranker
from shevent_ml.features.vendors import shrunk_rating

PARTS = ["price", "location", "capacity", "experience", "quality"]
EVENT_NAMES = {
    "wedding_mehndi": "mehndi",
    "wedding_baraat": "baraat",
    "wedding_walima": "walima",
    "engagement": "engagement",
    "birthday": "birthday",
    "corporate_dinner": "corporate",
    "corporate_other": "corporate",
    "university_gala": "university",
    "concert": "concert",
    "private_party": "private party",
}


def lakh(pkr):
    return f"Rs {pkr / 100_000:.1f} lakh" if pkr >= 100_000 else f"Rs {pkr:,.0f}"


def price_fit(ratio, settings):
    """price / budget -> 0..1. NaN (no price known) gives NaN; the caller scores it as unknown."""
    p = settings["price"]
    ratio = np.asarray(ratio, dtype=float)
    over = np.clip((ratio - p["full_fit_up_to"]) / (p["zero_at"] - p["full_fit_up_to"]), 0, 1)
    score = np.where(ratio <= p["full_fit_up_to"], 1.0, 1.0 - over)
    return np.where(ratio < p["much_cheaper_below"], p["much_cheaper_score"], score)


def listed_prices(prices, category, guests=None):
    """Each vendor's median standalone listed price in this category, by price basis (from prices.parquet).

    With guests, a price whose guest range doesn't cover the event is left out (a hall charge for 100-199 guests
    says nothing about a 500-guest walima).
    """
    if prices is None or prices.empty:
        return pd.DataFrame(columns=["per_head", "flat"], dtype=float)
    rows = prices[(prices["category"] == category) & ~prices["is_combo"].fillna(False).astype(bool)]
    if guests is not None:
        low, high = pd.to_numeric(rows["guest_min"], errors="coerce"), pd.to_numeric(rows["guest_max"], errors="coerce")
        rows = rows[(low.isna() | (low <= guests)) & (high.isna() | (high >= guests))]
    return rows.pivot_table(index="vendor_id", columns="price_basis", values="mid_pkr_adj", aggfunc="median")


class VendorMatcher:
    def __init__(self, settings=None, prices=None, price_estimator=None, allocator=None):
        """prices: data/processed/prices.parquet. price_estimator (#2) prices vendors with a tier but no listed
        price. allocator (#1) gives the category budget; without it, the configured fallback shares do."""
        self.settings = settings or load_config("matching")
        self.prices = prices
        self.price_estimator = price_estimator
        self.allocator = allocator

    def category_budget(self, plan, category):
        if self.allocator is not None:
            return self.allocator.allocate(plan)["allocation"][category]["pkr"]
        return plan["total_budget_pkr"] * self.settings["fallback_shares"][category]

    def likely_prices(self, plan, category, vendors):
        """Each vendor's likely total for this event: its listed price (per head x guests), else #2 for its tier."""
        guests = plan["guest_count"]
        listed = listed_prices(self.prices, category, guests).reindex(vendors["vendor_id"]).astype(float)
        per_head = listed.get("per_head", pd.Series(np.nan, index=listed.index)) * guests
        total = per_head.fillna(listed.get("flat", pd.Series(np.nan, index=listed.index)))
        source = pd.Series(np.where(total.notna(), "listed", ""), index=total.index)
        if self.price_estimator is not None:
            for tier in ["budget", "mid", "premium"]:
                needs = total.isna() & (vendors.set_index("vendor_id")["price_tier"] == tier).reindex(total.index)
                if needs.any():
                    estimate = self.price_estimator.estimate_plan(plan, tier=tier).loc[category, "mid"]
                    total[needs] = estimate
                    source[needs] = "estimated"
        return total.to_numpy(dtype=float), source.to_numpy()

    def score(self, plan, category, vendors):
        """The candidates of this category with each part's score, the fit score, reasons and sponsored flag."""
        s = self.settings
        v = vendors[vendors["category"] == category].copy()
        guests = plan["guest_count"]
        budget = self.category_budget(plan, category)

        likely, source = self.likely_prices(plan, category, v)
        v["likely_pkr"], v["price_source"] = likely, source
        v["price"] = price_fit(likely / budget, s)

        served = pd.Series(
            [
                set(a.split("|")) | {b}
                for a, b in zip(v["areas_served"].fillna(""), v["base_area"].fillna(""), strict=True)
            ],
            index=v.index,
        )
        known_area = served.map(lambda areas: bool(areas - {"", "Other"}))
        in_area = served.map(lambda areas: plan["area"] in areas)
        v["location"] = np.where(
            in_area,
            s["location"]["serves_area"],
            np.where(known_area, s["location"]["elsewhere"], s["location"]["area_unknown"]),
        )

        cap_min = pd.to_numeric(v["capacity_min"], errors="coerce")
        cap_max = pd.to_numeric(v["capacity_max"], errors="coerce")
        v["over_capacity"] = cap_max.notna() & (guests > cap_max)
        v["capacity"] = np.where(
            cap_min.notna() & (guests < cap_min),
            s["capacity"]["under_minimum"],
            np.where(cap_max.notna() | cap_min.notna(), 1.0, np.nan),
        )

        event_types = v["event_types"].fillna("").str.split("|").map(lambda t: set(t) - {""})
        v["experience"] = event_types.map(lambda t: (1.0 if plan["event_type"] in t else 0.3) if t else np.nan)

        rating = pd.to_numeric(v["rating"], errors="coerce")
        reviews = pd.to_numeric(v["review_count"], errors="coerce")
        shrunk = shrunk_rating(rating, reviews, v["category"]).where(rating.notna())
        v["rating_shrunk"] = shrunk
        v["quality"] = ((shrunk - 3) / 2).clip(0, 1)

        weights = pd.Series(s["weights"])
        parts = v[PARTS].astype(float).fillna(s["unknown"])
        v["fit"] = parts.mul(weights).sum(axis=1) / weights.sum()
        # Only a known, low review count marks a new vendor: research listings without review counts aren't new.
        new = reviews.notna() & (reviews < s["new_vendor"]["max_reviews"])
        v["new_vendor"] = new
        v["score"] = v["fit"] + np.where(new, s["new_vendor"]["boost"], 0.0)
        v["sponsored"] = v["sponsored"].eq(True) if "sponsored" in v else False
        v["reasons"] = [self.reasons(plan, category, budget, row) for row in v.to_dict("records")]
        exclude = v["over_capacity"] if s["capacity"]["exclude_over_capacity"] else False
        return v[~exclude]

    def reasons(self, plan, category, budget, row):
        """Plain sentences about what is known: fits first, then cautions."""
        good, caution = [], []
        if not np.isnan(row["likely_pkr"]):
            ratio = row["likely_pkr"] / budget
            what = "Listed price" if row["price_source"] == "listed" else "Typical price for its tier"
            amount = lakh(row["likely_pkr"])
            if ratio <= self.settings["price"]["full_fit_up_to"]:
                good.append(f"{what} (about {amount}) fits your {lakh(budget)} {category.replace('_', ' ')} budget")
            else:
                caution.append(f"{what} (about {amount}) is {ratio - 1:.0%} over your {lakh(budget)} budget")
        if row["location"] == self.settings["location"]["serves_area"]:
            good.append(f"Serves {plan['area']}")
        elif row["location"] == self.settings["location"]["elsewhere"]:
            caution.append(f"Based in {row['base_area']}, not listed for {plan['area']}")
        if row["capacity"] == 1.0:
            good.append(f"Handles {plan['guest_count']} guests")
        elif row["capacity"] == self.settings["capacity"]["under_minimum"]:
            caution.append(f"Usually takes events of {int(float(row['capacity_min']))}+ guests")
        if row["experience"] == 1.0:
            good.append(f"Does {EVENT_NAMES.get(plan['event_type'], plan['event_type'])} events")
        if not np.isnan(row["rating_shrunk"]):
            good.append(f"Rated {float(row['rating']):.1f} from {int(float(row['review_count'] or 0))} reviews")
        if row["new_vendor"]:
            good.append("New on Shevent")
        if not good and not caution:
            caution.append("Few details listed yet: ask about price, capacity and the date")
        return good + caution

    def recommend(self, plan, category, vendors, k=10):
        """{'matches': top k organic vendors, 'sponsored': sponsored vendors, ranked the same way but separate}."""
        scored = self.score(plan, category, vendors).sort_values(["score", "vendor_id"], ascending=[False, True])
        columns = ["vendor_id", "name", "score", "likely_pkr", "price_source", "reasons", *PARTS]

        def as_list(rows):
            return [
                {
                    **row,
                    "score": round(row["score"], 3),
                    "likely_pkr": None if np.isnan(row["likely_pkr"]) else round(row["likely_pkr"], -3),
                }
                for row in rows[columns].to_dict("records")
            ]

        return {
            "matches": as_list(scored[~scored["sponsored"]].head(k)),
            "sponsored": as_list(scored[scored["sponsored"]].head(3)),
            "category_budget_pkr": round(self.category_budget(plan, category), -3),
        }

    def rank(self, query, candidates):
        """For the matching set: query (a matching_set.yaml query) -> candidates in this matcher's order."""
        plan = {**query, "guest_count": query["guests"]}
        scored = self.score(plan, query["category"], candidates)
        return scored.sort_values(["score", "vendor_id"], ascending=[False, True])


def evaluate(matcher, labels, vendors, queries):
    return {
        "matcher": score_ranker(matcher.rank, labels, vendors, queries),
        "sort_by_rating": score_ranker(lambda q, c: rank_by_rating(c), labels, vendors, queries),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--demo", metavar="QUERY_ID", help="show the matches for one matching-set query")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    vendors = pd.read_parquet(args.processed / "vendors.parquet")
    prices_path = args.processed / "prices.parquet"
    matcher = VendorMatcher(prices=pd.read_parquet(prices_path) if prices_path.exists() else None)
    queries = load_config("matching_set")["queries"]
    if args.demo:
        query = next(q for q in queries if q["query_id"] == args.demo)
        plan = {**query, "guest_count": query["guests"]}
        result = matcher.recommend(plan, query["category"], vendors)
        print(
            f"{query['category']} for {query['event_type']}, {query['guests']} guests, {query['area']}; "
            f"category budget about {lakh(result['category_budget_pkr'])}"
        )
        for i, match in enumerate(result["matches"], 1):
            print(f"{i:>2}. {match['name']} ({match['vendor_id']}) fit {match['score']:.2f}")
            print("    " + "; ".join(match["reasons"]))
        return 0
    if not LABELS_FILE.exists():
        print(f"No ratings yet ({LABELS_FILE}). Run python -m shevent_ml.eval.matching_set, have the sheet rated,")
        print("then rerun this. Meanwhile, --demo Q01 shows what the matcher returns.")
        return 1
    report = evaluate(matcher, load_labels(LABELS_FILE, CANDIDATES_FILE), vendors, queries)
    for name, scores in report.items():
        print(
            f"  {name:<16} NDCG@10 {scores['ndcg@10']:.3f}  Precision@5 {scores['precision@5']:.2f}  "
            f"({scores['queries']} queries)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
