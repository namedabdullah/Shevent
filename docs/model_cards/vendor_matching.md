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

On 14 test events (234 candidate vendors) rated 0-3 on 11 Nov **by an AI assistant**, not the data lead:

| Ranker | NDCG@10 | Precision@5 |
|---|---|---|
| This matcher | **0.815** | **0.81** |
| Sort by rating (the planned baseline) | 0.725 | 0.73 |
| Random order (mean of 2,000 shuffles; 95% range) | 0.713 (0.663-0.764) | 0.745 (0.69-0.80) |

- The matcher ranks clearly better than chance on NDCG@10 (above every 97.5th-percentile shuffle); on Precision@5 the
  gain is marginal, because 185 of the 234 candidates were rated 2 or 3, so almost any top five is mostly usable.
- Sort by rating scores like a random order: none of the collected vendors has a rating.
- **How the ratings were made:** from the sheet's facts plus each vendor's listed services, locality, collected
  reviews and listed prices, without looking at the matcher's scores. Caterers, decorators, DJs, lighting and
  photographers were treated as travelling across Lahore, and neighbouring areas (DHA and Cantt, Model Town and Garden
  Town) as near; the matcher instead penalises any area a vendor doesn't list. Venues were judged on area, capacity
  and type. Ratings: 10 × 0, 39 × 1, 140 × 2, 45 × 3.
- **Caveat:** the ratings share some of the matcher's signals (area, capacity, price) and were made by an AI assistant
  that also worked on the matcher. Ratings by the data lead, with local knowledge of which vendors are good, would make
  this independent; `data/processed/matching_to_label.csv` is ready for them (save as `data/splits/matching_labels.csv`).

Unit tests cover capacity exclusion, sponsored separation, reasons and the new-vendor boost.

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
