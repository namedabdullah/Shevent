# Model Card: #3 Vendor Matching v1

| | |
|---|---|
| Version | `match-v1/<#2 version>` (the `model_version` of `/v1/recommend`) |
| Code | `ml/shevent_ml/models/matching.py`, weights in `ml/configs/matching.yaml` |
| Served by | `POST /v1/recommend`; its scores also drive #4 |
| Owner | ML lead |

## What it does

Ranks one category's vendors for an event plan and gives factual reasons for each match ("serves Gulberg", "within
your catering budget"). Sponsored vendors come back in their own, labelled list and never mix into the ranking.

## Inputs and outputs

- **In:** the event plan, a category, that category's budget (from #1), and the vendor listings (from Supabase, or the
  demo fixtures without it).
- **Out:** matches with a 0-1 score, #2's price range, reasons and a "new vendor" flag; a separate sponsored list.

## Model

Not trained: a hand-weighted content score, chosen because there were no interaction logs to learn from.

| Part | Weight | Scored by |
|---|---|---|
| Price fit | 0.30 | Likely price (listed, else #2 for the tier) against the category budget: full fit up to the budget, zero at 60% over, 0.8 when far cheaper. A hall that sells the hall with a per-head menu has no listed venue price (its listed rent is an extra), so #2 prices it |
| Location | 0.25 | 1.0 serves the area, 0.5 unknown, 0.1 elsewhere |
| Capacity | 0.15 | Over the vendor's maximum: excluded; under its minimum: 0.3 |
| Experience | 0.10 | Has done this event type |
| Quality | 0.20 | Rating, shrunk toward the mean when it rests on few reviews |

A part the listing doesn't tell us scores 0.5. Vendors with fewer than 5 reviews get +0.03 so new vendors are seen,
which is too small to lift a poor fit above a good one.

## Evaluation

**Not scored yet.** The test set (12 queries × 20 candidates, `data/splits/matching_candidates.csv`) needs rebuilding
on the 327 vendors of dataset v2 (`python -m shevent_ml.eval.matching_set`), then rating 0-3 by the data lead. Then NDCG@10 and Precision@5 are compared with sort-by-rating. Unit tests cover capacity
exclusion, sponsored separation, reasons and the new-vendor boost.

## Limitations

- The weights are judgement, not learned.
- Of the 327 collected vendors, 197 list event types and 29 a capacity; none has a tier or a rating (the 308 collected
  reviews aren't used: 97% are 5 stars). Ranking rests mostly on area, price and event type. Lighting has 3 vendors.
- The next version (after the capstone) is a hybrid recommender trained on views, saves, inquiries and bookings.

## Licences

pandas and NumPy (BSD-3-Clause). Vendor listings: public business information only, no personal contacts.

## Reproduce

```
cd ml && python -m shevent_ml.models.matching          # score on the rated set, next to sort-by-rating
cd ml && python -m shevent_ml.models.matching --demo Q02
```
