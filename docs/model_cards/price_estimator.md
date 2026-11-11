# Model Card: #2 Price Range Estimator

| | |
|---|---|
| Version | `cost-v1-3c697b36` (`ml/artifacts/price_estimator/`), trained 10 Nov on dataset v2 |
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

Synthetic events (`synthetic_hash f52dafdf8047`) plus the real training prices from dataset v2 (`dataset_hash
a2d4e5518db3`: 402 prices from 327 vendors, inflation-adjusted to October 2026). Hall menus and bundled packages are left
out, which leaves 221 standalone prices: 175 for training and 46 held out with their 36 vendors. Real rows weigh 5×
synthetic ones. The synthetic events' base prices for catering, decor, DJ & sound and photography are the medians of
the real training prices; venue and lighting keep configured prices (venue because listed hall rents are extras to a
per-head menu, lighting because there are no prices). **Calibration used 44 real prices** from a quarter of the training
vendors, held out of the fit.

## Evaluation

| Rows | Model | MAPE | Pinball 10/50/90% (PKR) | Range holds |
|---|---|---|---|---|
| 46 real test prices | This model | 72% | 11,374 / 39,902 / 47,972 | 91% |
| 46 real test prices | Median lookup | 92% | 13,127 / 43,159 / 39,914 | 76% |
| 5,979 synthetic held-out | This model | 39% | 8,073 / 23,755 / 17,093 | 95% |

It beats the median lookup on MAPE and the low and middle quantiles; its range is wider than the 80% target (the
lookup's has the right width but is centred badly). By category: catering 24% MAPE (5 prices), venue 37% (14), decor
93% (17), photography 109% (7), DJ & sound 111% (3). The scenario-quote test set is empty (no quotes collected). v1, on
34 prices, had MAPE 83% and a range that held only 42% of 12 real test prices.

## Limitations

- **The range is wide**: it holds 91% of real prices against an 80% target. That's the safe side for a price guide,
  but a host sees a broad low-high spread, especially for decor and photography.
- Decor, photography and DJ & sound listings rarely say what a package includes, so one estimate can miss by the size of
  the price itself.
- Lighting has no real prices; venue's synthetic base price is configured, not fitted.
- 221 standalone prices across 6 categories and 30 areas still leave many combinations with no real data.
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
