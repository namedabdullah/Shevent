"""#1 Budget Allocator: how to split an event budget across venue, catering, decor, DJ & sound and lighting.

    python -m shevent_ml.models.budget_allocator            # train, score, save to ml/artifacts/budget_allocator/
    python -m shevent_ml.models.budget_allocator --mlflow   # also log the run to MLflow

A feed-forward network with a softmax output (shares always add up to 1), trained with KL divergence on synthetic
events and the training half of the host survey. Scores that count come from the survey's test half, next to both
baselines: the fixed planner split and per-category regressors with normalised outputs.

After the model, guardrails make sure no category falls below the cheapest realistic price for the event (#2); if
even those minimums don't fit, the host is told the budget is too low and by how much. Explanations are exact
Shapley values over seven input groups (event type, area, venue, date, guests, budget, preferences).
"""

import argparse
import hashlib
import itertools
import json
import math
import sys
from pathlib import Path

import lightgbm as lgb
import mlflow
import numpy as np
import pandas as pd
import torch
from torch import nn

from shevent_ml.config import PROCESSED_DIR, REFERENCE_DIR, REPO_ROOT, SEED, load_config
from shevent_ml.data.survey import is_survey_test
from shevent_ml.eval.baselines import CATEGORIES, FixedPlannerSplit
from shevent_ml.eval.metrics import kl_divergence, share_mae
from shevent_ml.features.calendar import SEASONS, calendar_features
from shevent_ml.features.events import PREFERENCES, VENUE_TYPES
from shevent_ml.models.price_features import AREAS, EVENT_TYPES
from shevent_ml.tracking import set_seed, training_run

ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts" / "budget_allocator"
SHARES = [f"share_{c}" for c in CATEGORIES]
LABELS = {"venue": "Venue", "catering": "Catering", "decor": "Decor", "dj_sound": "DJ & sound", "lighting": "Lighting"}
EVENT_LABELS = dict(
    pd.read_csv(REFERENCE_DIR / "vocab.csv", dtype=str).query("field == 'event_type'")[["value", "description"]].values
)
GROUP_NAMES = {
    "event_type": "the event type",
    "area": "the area",
    "venue_type": "the venue",
    "date": "the date",
    "guests": "the guest count",
    "budget": "the budget",
    "preferences": "your preferences",
}


class Encoder:
    """Plan columns -> a float matrix: one-hot event type, area, venue and season; standardised numbers.

    Expects event_type, guest_count, area, venue_type, event_date, total_budget_pkr, and optionally preferences
    ('a|b' or a list) and is_weekend (otherwise taken from the date). Unknown values are all-zero one-hots; missing
    numbers become the training mean.
    """

    ONE_HOT = {"event_type": EVENT_TYPES, "area": AREAS, "venue_type": VENUE_TYPES, "season": SEASONS}
    NUMERIC = [
        "log_guests",
        "log_budget",
        "log_budget_per_guest",
        "month_sin",
        "month_cos",
        "is_weekend",
        *[f"pref_{p}" for p in PREFERENCES],
    ]
    GROUPS = {
        "event_type": ["event_type"],
        "area": ["area"],
        "venue_type": ["venue_type"],
        "date": ["season", "month_sin", "month_cos", "is_weekend"],
        "guests": ["log_guests"],
        "budget": ["log_budget", "log_budget_per_guest"],
        "preferences": [f"pref_{p}" for p in PREFERENCES],
    }

    def __init__(self, mean=None, std=None):
        self.mean, self.std = mean, std
        self.columns = [f"{name}={v}" for name, values in self.ONE_HOT.items() for v in values] + self.NUMERIC

    def _numbers(self, plans):
        guests = pd.to_numeric(plans["guest_count"], errors="coerce")
        budget = pd.to_numeric(plans["total_budget_pkr"], errors="coerce")
        calendar = calendar_features(plans["event_date"])
        month = calendar["month"].astype(float)
        weekend = plans["is_weekend"] if "is_weekend" in plans else calendar["is_weekend"]
        chosen = (plans["preferences"] if "preferences" in plans else pd.Series(None, index=plans.index)).map(
            lambda p: (
                set(p.split("|")) if isinstance(p, str) else set(p) if isinstance(p, list | tuple | set) else set()
            )
        )
        numbers = pd.DataFrame(
            {
                "log_guests": np.log1p(guests),
                "log_budget": np.log1p(budget),
                "log_budget_per_guest": np.log1p(budget / guests.where(guests > 0)),
                "month_sin": np.sin(2 * np.pi * month / 12),
                "month_cos": np.cos(2 * np.pi * month / 12),
                "is_weekend": pd.to_numeric(weekend, errors="coerce").astype(float),
                **{f"pref_{p}": chosen.map(lambda s, p=p: float(p in s)) for p in PREFERENCES},
            },
            index=plans.index,
        )
        return numbers, calendar["season"].astype(object)

    def fit(self, plans):
        numbers, _ = self._numbers(plans)
        self.mean = numbers.mean().fillna(0).to_dict()
        self.std = numbers.std().replace(0, 1).fillna(1).to_dict()
        return self

    def transform(self, plans):
        numbers, season = self._numbers(plans)
        source = {**{name: plans[name] for name in ["event_type", "area", "venue_type"]}, "season": season}
        blocks = [
            np.column_stack([(source[name] == v).to_numpy(dtype=np.float32) for v in values])
            for name, values in self.ONE_HOT.items()
        ]
        scaled = (numbers.fillna(pd.Series(self.mean)) - pd.Series(self.mean)) / pd.Series(self.std)
        blocks.append(scaled[self.NUMERIC].to_numpy(dtype=np.float32))
        return np.hstack(blocks)

    def group_columns(self):
        """Matrix column indices for each explanation group."""
        index = {}
        for i, column in enumerate(self.columns):
            index.setdefault(column.split("=")[0], []).append(i)
        return {group: sum((index[f] for f in features), []) for group, features in self.GROUPS.items()}


class SplitNet(nn.Module):
    def __init__(self, n_in, hidden, dropout, n_out=5):
        super().__init__()
        layers, width = [], n_in
        for size in hidden:
            layers += [nn.Linear(width, size), nn.ReLU(), nn.Dropout(dropout)]
            width = size
        layers.append(nn.Linear(width, n_out))
        self.layers = nn.Sequential(*layers)

    def forward(self, x):
        return self.layers(x)  # logits; softmax gives the shares


def weighted_kl(logits, target, weight):
    """Mean over rows of weight x KL(target || softmax(logits))."""
    log_p = torch.log_softmax(logits, dim=1)
    log_t = torch.log(target.clamp_min(1e-12))
    return (weight * (target * (log_t - log_p)).sum(dim=1)).sum() / weight.sum()


def apply_guardrails(shares, budget, minimums):
    """Rupees per category with every category at or above its minimum, plus what changed.

    Categories the model under-funds are raised to their minimum; the rest of the budget is shared among the others
    in the model's proportions, repeating until nothing is under its minimum. If the minimums alone exceed the
    budget, the result is the minimums and budget_too_low is True.
    """
    minimums = {c: float(minimums.get(c, 0.0)) for c in shares}
    needed = sum(minimums.values())
    if budget < needed:
        return {"amounts": minimums, "raised": [], "budget_too_low": True, "minimum_budget_pkr": needed}
    fixed = {}
    while True:
        free = [c for c in shares if c not in fixed]
        remaining = budget - sum(fixed.values())
        weight = sum(shares[c] for c in free)
        amounts = {c: remaining * shares[c] / weight for c in free}
        under = [c for c in free if amounts[c] < minimums[c]]
        if not under:
            break
        fixed.update({c: minimums[c] for c in under})
    return {
        "amounts": {**amounts, **fixed},
        "raised": sorted(fixed),
        "budget_too_low": False,
        "minimum_budget_pkr": needed,
    }


class BudgetAllocator:
    def __init__(self, settings=None):
        self.settings = settings or load_config("budget_allocator")
        self.encoder = Encoder()
        self.net = None
        self.reference = None  # the mean training input, the "typical event" explanations compare against
        self.version = None

    def fit(self, plans, shares, weight=None, log=print):
        set_seed(SEED)
        s = self.settings
        self.encoder.fit(plans)
        X = torch.tensor(self.encoder.transform(plans))
        y = torch.tensor(shares.to_numpy(dtype=np.float32))
        w = torch.tensor(np.ones(len(X), np.float32) if weight is None else np.asarray(weight, np.float32))
        self.reference = X.mean(dim=0).numpy()
        self.net = SplitNet(X.shape[1], s["hidden"], s["dropout"])
        optimiser = torch.optim.Adam(self.net.parameters(), lr=s["learning_rate"], weight_decay=s["weight_decay"])
        generator = torch.Generator().manual_seed(SEED)
        for epoch in range(s["epochs"]):
            self.net.train()
            order = torch.randperm(len(X), generator=generator)
            total = 0.0
            for start in range(0, len(X), s["batch_size"]):
                batch = order[start : start + s["batch_size"]]
                loss = weighted_kl(self.net(X[batch]), y[batch], w[batch])
                optimiser.zero_grad()
                loss.backward()
                optimiser.step()
                total += loss.item() * len(batch)
            if (epoch + 1) % 10 == 0:
                log(f"  epoch {epoch + 1}: KL {total / len(X):.4f}")
        self.net.eval()
        return self

    def _shares(self, matrix):
        with torch.no_grad():
            return torch.softmax(self.net(torch.tensor(matrix, dtype=torch.float32)), dim=1).numpy()

    def predict(self, plans):
        """One share column per category; each row sums to 1."""
        return pd.DataFrame(self._shares(self.encoder.transform(plans)), columns=CATEGORIES, index=plans.index)

    def shapley(self, plan):
        """(groups, categories) contributions in share points of each input group, against the typical event.

        Exact: every subset of the seven groups is evaluated once (128 rows), mixing this plan's values with the
        typical event's, and each group gets its Shapley-weighted average marginal effect.
        """
        x = self.encoder.transform(pd.DataFrame([plan]))[0]
        groups = self.encoder.group_columns()
        names = list(groups)
        n = len(names)
        masks = np.array(list(itertools.product([0, 1], repeat=n)), dtype=bool)
        rows = np.tile(self.reference, (len(masks), 1))
        for g, name in enumerate(names):
            rows[np.ix_(masks[:, g], groups[name])] = x[groups[name]]
        values = self._shares(rows)
        index = {tuple(m): i for i, m in enumerate(masks)}
        phi = np.zeros((n, len(CATEGORIES)))
        for g in range(n):
            for mask in masks[~masks[:, g]]:
                size = int(mask.sum())
                weight = math.factorial(size) * math.factorial(n - size - 1) / math.factorial(n)
                with_g = mask.copy()
                with_g[g] = True
                phi[g] += weight * (values[index[tuple(with_g)]] - values[index[tuple(mask)]])
        return pd.DataFrame(phi * 100, index=names, columns=CATEGORIES)

    def explain(self, plan, shares, skip=()):
        """Sentences for categories whose share differs from the typical event's, naming the biggest reason.

        Categories in skip (changed by the guardrails, so the model's share isn't what the host sees) are left out.
        """
        typical = self._shares(self.reference[None, :])[0]
        phi = self.shapley(plan)
        sentences = []
        for i, category in enumerate(CATEGORIES):
            gap = 100 * (shares[category] - typical[i])
            if category in skip or abs(gap) < self.settings["explain_min_points"]:
                continue
            pushes = phi[category] * np.sign(gap)
            group = pushes.idxmax()
            value = {
                "event_type": EVENT_LABELS.get(plan.get("event_type"), plan.get("event_type")),
                "area": plan.get("area"),
                "venue_type": plan.get("venue_type"),
                "date": plan.get("event_date"),
            }.get(group)
            reason = GROUP_NAMES[group] + (f" ({value})" if value else "")
            direction = "above" if gap > 0 else "below"
            sentences.append(
                f"{LABELS[category]} share is {direction} a typical event's "
                f"({100 * shares[category]:.0f}% vs {100 * typical[i]:.0f}%), mainly because of {reason}"
            )
        return sentences

    def allocate(self, plan, minimums=None):
        """The split for one plan, in shares and rupees, after guardrails, with warnings and explanations.

        minimums: rupees per category (from #2, see price_minimums); without them no guardrails are applied.
        """
        shares = self.predict(pd.DataFrame([plan])).iloc[0].to_dict()
        budget = float(plan["total_budget_pkr"])
        guarded = apply_guardrails(shares, budget, minimums or {})
        amounts = guarded["amounts"]
        total = sum(amounts.values())
        warnings = []
        if guarded["budget_too_low"]:
            warnings.append(
                f"The budget is too low for this event: the cheapest realistic total is about "
                f"Rs {guarded['minimum_budget_pkr']:,.0f}, Rs {guarded['minimum_budget_pkr'] - budget:,.0f} more."
            )
        for category in guarded["raised"]:
            warnings.append(f"{LABELS[category]} was raised to its minimum of about Rs {amounts[category]:,.0f}.")
        return {
            "allocation": {c: {"share": amounts[c] / total, "pkr": round(amounts[c], -3)} for c in CATEGORIES},
            "budget_too_low": guarded["budget_too_low"],
            "minimum_budget_pkr": round(guarded["minimum_budget_pkr"], -3),
            "warnings": warnings,
            # Explanations describe the model's split, so none where the guardrails replaced it.
            "explanations": [] if guarded["budget_too_low"] else self.explain(plan, shares, guarded["raised"]),
            "model_version": self.version,
        }

    def save(self, path=ARTIFACT_DIR, report=None):
        path.mkdir(parents=True, exist_ok=True)
        torch.save(self.net.state_dict(), path / "model.pt")
        meta = {
            "version": self.version,
            "settings": self.settings,
            "mean": self.encoder.mean,
            "std": self.encoder.std,
            "reference": self.reference.tolist(),
            "report": report,
        }
        (path / "meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

    @classmethod
    def load(cls, path=ARTIFACT_DIR):
        meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
        model = cls(meta["settings"])
        model.encoder = Encoder(meta["mean"], meta["std"])
        model.reference = np.array(meta["reference"], dtype=np.float32)
        model.net = SplitNet(len(model.encoder.columns), model.settings["hidden"], model.settings["dropout"])
        model.net.load_state_dict(torch.load(path / "model.pt", weights_only=True))
        model.net.eval()
        model.version = meta["version"]
        return model


def price_minimums(price_estimator, plan, settings=None):
    """The guardrail minimums: #2's low price for each guarded category, for a vendor of the configured tier."""
    guard = (settings or load_config("budget_allocator"))["guardrails"]
    low = price_estimator.estimate_plan(plan, tier=guard["tier"])["low"]
    return {c: float(low[c]) for c in guard["categories"]}


class PerCategoryRegressors:
    """Second #1 baseline: one LightGBM regressor per category share, outputs clipped and renormalised."""

    def fit(self, plans, shares):
        self.encoder = Encoder().fit(plans)
        X = self.encoder.transform(plans)
        params = {"objective": "regression", "learning_rate": 0.05, "num_leaves": 31, "verbose": -1, "seed": SEED}
        self.boosters = {c: lgb.train(params, lgb.Dataset(X, shares[f"share_{c}"]), 200) for c in CATEGORIES}
        return self

    def predict(self, plans):
        X = self.encoder.transform(plans)
        raw = pd.DataFrame({c: self.boosters[c].predict(X) for c in CATEGORIES}, index=plans.index).clip(lower=1e-4)
        return raw.div(raw.sum(axis=1), axis=0)


def synthetic_plans(events):
    return events.rename(columns={"guest_count_invited": "guest_count"}).assign(
        is_weekend=events["is_weekend"].astype(float)
    )


def survey_plans(survey):
    """Survey responses with a full split, as plans. Saturday and Sunday count as the weekend."""
    usable = survey[survey["has_split"] & survey["event_type"].notna()].copy()
    usable = usable.rename(columns={"guests_invited": "guest_count"})
    usable["is_weekend"] = usable["day"].map({"Saturday": 1.0, "Sunday": 1.0, "Friday": 0.0})
    usable.loc[usable["day"].str.startswith("Weekday", na=False), "is_weekend"] = 0.0
    return usable


def score(predicted, true):
    mae = share_mae(true.set_axis(CATEGORIES, axis=1), predicted)
    return {
        "rows": int(len(true)),
        "share_mae": float(mae.mean()),
        "kl": kl_divergence(true.set_axis(CATEGORIES, axis=1), predicted),
        **{f"mae_{c}": float(v) for c, v in mae.items()},
    }


def train(processed_dir=PROCESSED_DIR, settings=None, log=print):
    """Trains the allocator and both baselines, and scores all three. Returns (model, report)."""
    settings = settings or load_config("budget_allocator")
    rng = np.random.default_rng(SEED)
    events = pd.read_parquet(processed_dir / "synthetic_events.parquet")
    synthetic_manifest = json.loads((processed_dir / "synthetic_manifest.json").read_text(encoding="utf-8"))
    synthetic = synthetic_plans(events)
    held = rng.random(len(synthetic)) < settings["synthetic_holdout"]

    parts = [(synthetic[~held], np.ones((~held).sum()))]
    survey_test = None
    survey_path = processed_dir / "survey.parquet"
    if survey_path.exists():
        survey = survey_plans(pd.read_parquet(survey_path))
        test = is_survey_test(survey["response_id"]).to_numpy()
        parts.append((survey[~test], np.full((~test).sum(), settings["real_weight"])))
        survey_test = survey[test]
    plans = pd.concat([p[0] for p in parts], ignore_index=True)
    weight = np.concatenate([p[1] for p in parts])

    model = BudgetAllocator(settings).fit(plans, plans[SHARES], weight, log=log)
    regressors = PerCategoryRegressors().fit(plans, plans[SHARES])
    planner = FixedPlannerSplit.from_config()

    report = {"baseline_planner_source": planner.source}
    subsets = {"synthetic_check": synthetic[held]}
    if survey_test is not None and len(survey_test):
        subsets["survey_test"] = survey_test
    for name, rows in subsets.items():
        report[name] = {
            "model": score(model.predict(rows), rows[SHARES]),
            "planner_split": score(planner.predict(rows), rows[SHARES]),
            "per_category_regressors": score(regressors.predict(rows), rows[SHARES]),
        }
    dataset = (
        json.loads((processed_dir / "manifest.json").read_text())["dataset_hash"] if survey_test is not None else "none"
    )
    report.update(
        dataset_hash=dataset,
        synthetic_hash=synthetic_manifest["synthetic_hash"],
        synthetic_sources=synthetic_manifest["sources"],
    )
    digest = hashlib.sha256(json.dumps([settings, dataset, report["synthetic_hash"]], default=str).encode())
    model.version = f"alloc-v1-{digest.hexdigest()[:8]}"
    return model, report


def print_report(report, log=print):
    log(f"  {'':<44} {'rows':>6} {'share MAE':>10} {'KL':>8}")
    for subset in ["survey_test", "synthetic_check"]:
        if subset not in report:
            continue
        for name, s in report[subset].items():
            log(f"  {subset + ' / ' + name:<44} {s['rows']:>6} {100 * s['share_mae']:>9.2f}pt {s['kl']:>8.4f}")
    if "survey_test" not in report:
        log("  No survey splits yet: only the synthetic check, which proves the code works, not that the model")
        log("  knows how Lahore hosts split budgets.")
    if report["baseline_planner_source"] == "placeholder":
        log("  The planner-split baseline still uses placeholder shares (configs/baselines.yaml).")
    placeholders = [k for k, v in report["synthetic_sources"].items() if v == "placeholder"]
    if placeholders:
        log(f"  Synthetic data still uses placeholder assumptions: {', '.join(placeholders)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--out", type=Path, default=ARTIFACT_DIR, help="where to save the model")
    parser.add_argument("--mlflow", action="store_true", help="log the run to MLflow")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    model, report = train(args.processed)
    model.save(args.out, report)
    print(f"Budget allocator {model.version} saved to {args.out}")
    print_report(report)
    if args.mlflow:
        with training_run("budget_allocator", report["dataset_hash"], {"model_version": model.version}):
            for subset in ["survey_test", "synthetic_check"]:
                for name, scores in report.get(subset, {}).items():
                    mlflow.log_metrics({f"{subset}.{name}.{k}": v for k, v in scores.items()})
            mlflow.set_tag("synthetic_hash", report["synthetic_hash"])
            mlflow.log_artifacts(str(args.out), "budget_allocator")
    return 0


if __name__ == "__main__":
    sys.exit(main())
