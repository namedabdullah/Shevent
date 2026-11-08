# Model Card: #4 One-Tap Package Builder

| | |
|---|---|
| Version | `packages-v1/<#2 version>` (the `model_version` of `/v1/packages`) |
| Code | `ml/shevent_ml/models/packages.py`, settings in `ml/configs/packages.yaml` |
| Served by | `POST /v1/packages` |
| Owner | ML lead |

## What it does

Builds up to three vendor bundles for an event (cheapest, balanced, highest quality), one vendor per requested
category, each within the host's total budget.

## Inputs and outputs

- **In:** the event plan with its budget, the categories wanted, and vendors already booked that day.
- **Out:** up to three packages, each with its total and per vendor the price, whether that price is #2's estimate,
  its range and the #3 score; categories no vendor could fill; the cheapest possible total.

## Method

An optimiser, not a learned model: one OR-Tools CP-SAT solve per package.

- **Constraints:** exactly one vendor per category; total within budget; the vendor is kept by #3 (can handle the
  guests), serves the area, isn't sponsored and isn't booked that day; each package differs from the ones before it.
- **Objectives:** balanced maximises the total #3 score, cheapest minimises the total, highest quality maximises the
  quality part of the score. Ties are broken one goal at a time; a single weighted objective was about 50× slower.
- **Prices:** the vendor's listed price, else #2's estimate for its tier, flagged as an estimate.
- **Baseline:** greedy, the best match per category within that category's share of the budget.

## Evaluation (synthetic)

200 synthetic events, 60 synthetic vendors per category:

| Measure | CP-SAT | Greedy |
|---|---|---|
| A package within budget, at 70% of the budget | 69% of events | 64% |
| Mean match score | 0.869 | 0.813 |
| Over budget | Never | Possible |
| Slowest solve | 0.46 s | |

The guarantees (within budget, distinct, available, serves the area, capacity) are unit tested.

## Limitations

- Package quality is only as good as #3's scores and #2's estimated prices.
- On the collected vendors, photography can't be filled, and with no ratings "highest quality" is close to
  "balanced".
- Availability is only what the app knows (bookings in Shevent), not vendors' real calendars.

## Licences

| Component | Licence |
|---|---|
| OR-Tools | Apache-2.0 |
| pandas, NumPy | BSD-3-Clause |

## Reproduce

```
cd ml && python -m shevent_ml.models.packages             # synthetic pool and real vendors, next to greedy
cd ml && python -m shevent_ml.models.packages --demo Q01
```
