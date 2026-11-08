# Model Card: #2 Price Range Estimator

| | |
|---|---|
| Version | `cost-v1-97907a1e` (`ml/artifacts/price_estimator/`) |
| Code | `ml/shevent_ml/models/price_estimator.py`, `price_features.py`, settings in `ml/configs/price_estimator.yaml` |
| Served by | `POST /v1/estimate`; also used by #1's guardrails, #3's price fit, #4's missing prices and #5 |
| Owner | ML lead |

## What it does

Gives the low / likely / high price of a vendor category for an event: the range shown on every budget share, match
card and package item, and the yardstick for the quote checker.

## Inputs and outputs

- **In:** category, price basis (per head or one price for the event), area, event type, venue type, season, vendor
  tier (when known), log guests, hours, month, weekend, preferences.
- **Out:** low, likely and high price in PKR (10%, 50%, 90% quantiles, calibrated).

## Model

Three LightGBM quantile models (α = 0.1, 0.5, 0.9) on log price: 400 rounds, learning rate 0.05, 31 leaves. The tier
is hidden on half the synthetic rows so the model also works without it. The 10-90% range is then calibrated with
conformalized quantile regression (Romano et al., 2019): the range is widened or narrowed by a margin (0.0199 on the
log scale in this version) so it holds 80% of prices the models didn't train on.

## Training data

Synthetic events (`synthetic_hash 9a2fd6c24dd6`, placeholder effects) plus the real training prices from dataset v1
(`dataset_hash b8264320b0bf`: 34 cleaned prices, inflation-adjusted to October 2026). Real rows weigh 5× synthetic ones.
**Calibration used 6,021 synthetic rows**, because there were fewer than the 30 real prices calibration needs.

## Evaluation

| Rows | Model | MAPE | Pinball 10/50/90% (PKR) | Range holds |
|---|---|---|---|---|
| 12 real test prices | This model | 0.83 | 7,138 / 24,693 / 35,670 | 42% |
| 12 real test prices | Median lookup | 0.87 | 7,655 / 27,035 / 45,583 | 33% |
| 5,979 synthetic held-out | This model | 0.39 | 8,406 / 27,124 / 16,992 | 81% |

It beats the median lookup on every measure, but 12 prices is a small test. The scenario-quote test set is empty (no
quotes collected).

## Limitations

- **The range is too narrow on real prices** (42% against a target of 80%), because it was calibrated on synthetic
  prices that vary less than real Lahore prices. This is the system's biggest weakness: every range in the app inherits
  it.
- 34 real prices across 6 categories and 30 areas leave most combinations with no real data.
- Prices are adjusted with a fallback 5% yearly inflation rate where PBS CPI figures aren't in the config.
- Outputs are estimates, labelled "AI estimate, not a vendor quote" with the range always shown.

## Licences

| Component | Licence |
|---|---|
| LightGBM | MIT |
| pandas, NumPy | BSD-3-Clause |
| Real prices | Public listings and vendor-stated prices, collected per each platform's terms |

## Reproduce

```
cd ml && python -m shevent_ml.models.price_estimator [--mlflow]
```
