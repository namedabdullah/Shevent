# Model Card: #5 Quote Fairness Checker

| | |
|---|---|
| Version | `quote-v1/<#2 version>` (the `model_version` of `/v1/quote-check`) |
| Code | `ml/shevent_ml/models/quote_checker.py`, settings in `ml/configs/quote_checker.yaml`, checklist in `data/reference/quote_checklist.csv` |
| Served by | `POST /v1/quote-check`; the vendor sees a preview before sending a quote |
| Owner | ML lead |

## What it does

Tells a host how a vendor's quote compares with typical prices for the same event, and what to ask the vendor about.

## Inputs and outputs

- **In:** the event (without the host's budget), category, quoted amount and its unit (per head, per event, per hour,
  ...), hours, inclusions, exclusions, notes and the vendor's tier if known.
- **Out:** a level (green, yellow, red), the typical range in the quote's unit, how far above or below it the quote is,
  "ask about" items, "charged extra" items, and whether it was compared within the vendor's tier.

## Method

- **Price:** #2's calibrated range for the same event, converted into the quote's unit. Inside or below the range is
  green, up to 25% above the top is yellow, beyond that red. With the tier known, the comparison is within the tier.
- **Checklist:** per category, the items vendors often charge extra for (generator fuel, transport, setup and
  teardown, overtime, tax, permits, ...). Hand-written keywords and cue words, English plus a few Roman Urdu words,
  sort each into "included", "ask about" or "charged extra".
- **Wording:** guidance, never an accusation ("worth asking about", not "overcharging"); fixed in
  `packages/core/labels`.

## Evaluation

**Synthetic only, measured with #2 v1.** Within the tier, a doubled price is flagged 87% of the time (39% across all
tiers, where the range is about 5× wide). Typical prices are green about 90% of the time. #2 v2's ranges are wider
(they hold 91% of real prices), so fewer quotes will be flagged.

**Real test not run:** no scenario quotes were collected. Ready to run: `--sheet` writes a blind labelling sheet; the
data lead labels level and missing items; scoring reports level accuracy and quadratic weighted kappa against the
median-lookup rule and "always green", and checklist precision and recall against "ask about every item".

## Limitations

- Inherits #2's ranges, which since v2 are calibrated on real prices but wide, so it errs towards green.
- Keyword rules miss phrasings they don't list, especially in Urdu script.
- A green label means "within typical prices", not that the vendor is good.

## Licences

No third-party model. The checklist and rules are this project's own.

## Reproduce

```
cd ml && python -m shevent_ml.models.quote_checker --demo
cd ml && python -m shevent_ml.models.quote_checker          # once data/splits/quote_labels.csv exists
```
