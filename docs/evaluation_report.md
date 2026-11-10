# Shevent Evaluation Report

**As of 10 Nov 2026 (dataset v2).** Covers every AI feature in the capstone scope. Each model has a card in
[`docs/model_cards/`](model_cards/); the data behind them is described in the [data card](data_card.md).

## Summary

| # | Feature | Status | Headline result | Beats its baseline on real held-out data? |
|---|---|---|---|---|
| 1 | Budget Allocator | Built, served | Share MAE 2.4 points on synthetic held-out events (fixed planner split 5.7) | **Not tested:** no host has reported a real split yet |
| 2 | Price Range Estimator | Built, served | 46 real test prices: MAPE 72% (median lookup 92%); the 80% range holds 91% (median lookup 76%) | **Yes** on error; its range is wider than it needs to be |
| 3 | Vendor Matching | Built, served | Not scored: the hand-rated matching set has no ratings yet | **Not tested** |
| 4 | Package Builder | Built, served | Every package within budget; at 70% of the budget 68% of synthetic events get one (greedy 63%) | Synthetic only (it's an optimiser; the guarantees are tested) |
| 5 | Quote Fairness Checker | Built, served | Synthetic: a doubled price flagged 87% of the time when the tier is known (measured with #2 v1) | **Not tested:** no scenario quotes collected |
| 6 | Review Insights | Labelling tools only | 308 reviews collected but unlabelled; 97% are 5 stars and 3% Roman Urdu or mixed | No model trained |
| 7 | Verified Portfolios | Image pipeline only | 542 image links collected; the images aren't downloaded, so the duplicate test hasn't run | No model trained |
| 8 | AI Planning Assistant | Built, served | Holdout chats: whole plan right 95% (model alone 80%); 0 invented values; 0 invented figures in replies | Yes, on its own chat sets (the baseline is the model without the server's checks) |

**The one-line verdict:** the path from event details to a priced plan, matched vendors, packages, quote checks and a
chat assistant is built, tested and served. Dataset v2 gives the price model real data to learn from: 175 real training
prices and 46 held out, against 22 and 12 before. It now beats the median lookup on real prices and its ranges hold
real prices. The budget split still learns from synthetic events, because no host survey or planner interviews were
collected, so the app keeps labelling every amount "AI estimate, not a vendor quote".

## Data available

| Source | Target (collection guide) | v1 (28 Oct) | v2 (10 Nov) |
|---|---|---|---|
| Vendors | 120 | 156 | **327** |
| Price observations | 300 | 34 | **402** (221 standalone; 181 are hall menus or bundles) |
| Scenario quotes | 25 | 0 | 0 |
| Host survey answers | 40 | 0 | 0 |
| Planner interviews | 3 | 0 | 0 |
| Reviews | 300 | 0 | **308** |
| Portfolio images | 500 | 0 | **542** links |

Dataset v2: `dataset_hash 4c2131a11b22`, imported from the data lead's folder with
`python -m shevent_ml.data.import_dataset`. Test split: 36 vendors (about 20% of the priced vendors in each category),
all their prices held out, in `data/splits/test_split.json`. Synthetic events: `synthetic_hash f52dafdf8047`, with
catering, decor, DJ & sound and photography base prices fitted from the real training prices. The other effects
(`event_mix`, `price_effects`, `demand`) are still placeholders.

**Rule kept throughout:** train on synthetic plus real data, score only on held-out real data. Fixed on 10 Nov: the
generator's `--fit-prices` used to fit base prices from every real price, test prices included, so the held-out prices
leaked into the training data. It now uses training prices only (with a test).

**Venue prices need care.** Lahore halls mostly sell a per-head menu that includes the hall. Their listed hall rents
(median about Rs 50,000) are extras, often waived above a guest count, and the menus with the hall are about Rs 400 a
head above food-only catering. So:
- the generator keeps its configured venue price instead of fitting it to those rents (`fit_skip` in
  `ml/configs/synthetic.yaml`);
- a hall that sells the hall with a menu gets no listed venue price in matches and packages; #2 prices it instead.

Fitting venue to the rents would have put a whole venue at about 4% of an event's budget.

## #1 Budget Allocator

Synthetic held-out events (1,948 rows), lower is better:

| Model | Share MAE | KL divergence |
|---|---|---|
| Network (`alloc-v1-52d3ae4d`) | 2.44 points | 0.0199 |
| Per-category regressors, normalised | 2.42 points | 0.0198 |
| Fixed planner split | 5.73 points | 0.0933 |

Per category (network vs. planner split, in share points): venue 3.7 vs 6.4, catering 4.2 vs 12.2, decor 3.5 vs 5.3,
DJ & sound 0.5 vs 4.7, lighting 1.4 vs 1.8, photography 1.3 vs 3.9.

- The network more than halves the planner split's error but only **ties** the per-category regressors. On this data
  its advantages are structural: shares always add to 100%, and exact Shapley explanations over seven input groups.
- The synthetic events now carry real base prices for four categories, so the split for a 300-guest, Rs 25 lakh mehndi
  is catering 45%, venue 22%, decor 19%, lighting 6%, photography 5%, DJ & sound 2%.
- The planner split is a placeholder until the interviews come in, so the comparison with it is weak.
- Guardrails (no category below the cheapest realistic price from #2; "budget too low" with the shortfall) are unit
  tested.

## #2 Price Range Estimator

| Rows | Model | MAPE | Pinball loss 10% / 50% / 90% (PKR) | 80% range holds |
|---|---|---|---|---|
| 46 real test prices | `cost-v1-800e791d` | **72%** | **11,374 / 39,902** / 47,972 | 91% |
| 46 real test prices | Median lookup | 92% | 13,127 / 43,159 / **39,914** | 76% |
| 5,979 synthetic held-out | `cost-v1-800e791d` | 39% | 8,073 / 23,755 / 17,093 | 95% |

By category on the real test prices:

| Category | Prices | MAPE | Range holds |
|---|---|---|---|
| Catering (per head) | 5 | 24% | 100% |
| Venue (hall rent) | 14 | 37% | 86% |
| Decor | 17 | 93% | 94% |
| Photography | 7 | 109% | 100% |
| DJ & sound | 3 | 111% | 67% |

- The model beats the median lookup on MAPE and on the low and middle quantiles.
- **The range is now calibrated on 44 real prices** (v1 used synthetic ones, so its range held only 42% of real
  prices). It holds 91%, above the 75-85% target: wider than it needs to be, which is the safe side for a price
  guide. The median lookup's range has the right width (76%) but sits in the wrong place, hence its larger errors.
- Catering and venue are close. Decor, photography and DJ & sound vary from a basic setup to a full one, and the
  listings rarely say which, so a single estimate misses by about as much as the price itself.
- Lighting has no real prices at all; its ranges come from the configured base price.

## #3 Vendor Matching

Not scored. The matching set (12 queries × 20 candidates) has no relevance ratings yet. The candidates file isn't on
this machine: rebuild it on the 327 vendors with `python -m shevent_ml.eval.matching_set`, then rate. Once rated,
`python -m shevent_ml.models.matching` reports NDCG@10 and Precision@5 next to sort-by-rating.

What is tested: vendors over capacity are excluded, sponsored vendors never enter the ranking, every match has factual
reasons, the new-vendor boost is bounded, and a hall's add-on rent isn't treated as its price. Dataset v2 adds event
types for 197 vendors and capacities for 29. Tiers and ratings are still missing, so the ranking rests mostly on area,
price and event type.

## #4 Package Builder

| Measure | CP-SAT | Greedy per category |
|---|---|---|
| 9 events on the real vendors: three packages, all within budget, no empty category | 100% | |
| Synthetic events, full budget: a package within budget | 88% | 86% |
| Synthetic events at 70% of the budget: a package within budget | **68%** | 63% |
| Mean match score at 70% of the budget | **0.868** | 0.815 |
| Packages over budget | 0 | (not guaranteed) |
| Three packages distinct | Always | n/a |

Time per request: 95th percentile 0.37 s on the synthetic pool and 0.60 s on the real vendors. One synthetic request
took 2.1 s to solve, over the 1 s target. On the real vendors, photography now has 37 vendors, so a full line-up is
possible. With no vendor ratings, "highest quality" is still close to "balanced".

## #5 Quote Fairness Checker

Synthetic quotes only, measured with #2 v1. With the vendor's tier known, a doubled price is flagged 87% of the time
(39% across all tiers, whose range is about 5× wide); typical prices are green about 90% of the time either way. With
#2 v2's wider ranges, fewer quotes will be flagged. For the demo's lighting quote (300 guests, Gulberg, December), the
typical range is Rs 30,200 to Rs 3.6 lakh: Rs 3 lakh is green, Rs 4 lakh yellow, Rs 5 lakh red.

The labelling sheet and the scoring (level accuracy, quadratic weighted kappa, checklist precision and recall, against
the median-lookup rule, "always green" and "ask about every item") are ready, waiting for scenario quotes and the data
lead's labels. The checklist rules are hand-written keywords and cue words, English plus a few Roman Urdu words. All
wording in the apps is guidance, never an accusation.

## #6 Review Insights and #7 Verified Portfolios

Neither model was trained.

- **#6:** 308 reviews were collected, all from one directory, and none are labelled. 298 are 5 stars and 10 are 3 stars
  or less; 10 are Roman Urdu or mixed (3%, against the 30% the test set needs). A sentiment model trained on this would
  learn that every review is positive. Ready to use: the six-aspect label schema, Ollama label drafting (Qwen2.5 7B, JSON
  schema, few-shot in three languages), the Label Studio setup and the 150-review test-set rule.
- **#7:** 542 portfolio image links were collected, and the data lead marked file names that appear in more than one
  vendor's gallery (possible reused photos). The images themselves aren't downloaded. Ready to use: MD5, pHash, dHash
  and OpenCLIP ViT-B/32 embeddings per image, the planted-duplicate test set and the scoring against MD5 exact matching.

Neither has an endpoint (`/v1/reviews/insights`, `/v1/portfolio/check`).

## #8 AI Planning Assistant

Qwen2.5 3B Instruct (Q4_K_M) on Ollama, laptop GPU. The model reads the chat into a strict JSON schema; the server
keeps only values the host actually wrote, runs #1 and #2 and writes the reply from their results. Measured on 8 Nov;
the extraction doesn't depend on the dataset, and only the reply's amounts change with #1 and #2 v2.

| Measure | Tuning set (51 chats) | Holdout (20 chats) |
|---|---|---|
| Whole plan right, assistant | 100% | **95%** |
| Whole plan right, model alone | 82% | 80% |
| Values the host never gave, assistant | 0 | **0** |
| Values the host never gave, model alone | 14 | 5 |
| Estimate produced when the plan was complete | 100% | 100% |
| Final replies with a figure no tool gave | 0 | **0** |
| Seconds per turn, median / max | 1.8 / 2.5 | |

- The chats are English, messy English, multi-message corrections, Roman Urdu, Urdu script and off-topic messages.
- The grounding rules were tuned on the first set, so its 100% is optimistic. The holdout was written afterwards and
  scored once; its one miss is "90 mehmaanon ke sath" (guests not read, so the assistant asks for them).
- **LLM-written replies are off.** With them on (`ASSISTANT_LLM_REPLIES=1`), the output checker kept 92-97% of replies,
  every one with only tool or host figures, but reading them showed false claims built from true figures ("Rs 11.92
  lakh, 60% more than usual" for a share *below* the usual range). A figure check can't catch that, so the server
  writes the replies.
- Reproduce: `cd server && python -m eval.assistant_eval [--cases holdout] [--llm-replies]`; the reports go to
  `testing/reports/assistant-eval*.md`.

## Software tests (10 Nov)

| Suite | Result |
|---|---|
| `ml/` pytest | 155 passed |
| `server/` pytest (API, contracts, assistant) | 81 passed |
| `packages/core` Vitest | 194 passed (8 Nov) |
| `apps/web` lint and typecheck | clean |
| Playwright (5 browser profiles, fixtures) | Last full run: 340 tests passed, 10 by-design skips |

## Limitations that matter for the demo

1. **Splits are not learned from real hosts.** #1 learns synthetic events whose base prices are now real for four
   categories, but whose season, area and event-type effects are still placeholders.
2. **Price ranges are honest but wide.** They hold 91% of real prices; for decor, photography and DJ & sound a single
   estimate is often far off, because listings rarely say what a package includes.
3. **Venue and catering overlap in Lahore.** Most halls sell food and hall together; the app splits them into two
   categories, and prices halls that do this from #2 rather than from their listed rent.
4. **#3, #5, #6 and #7 have no real-data score**, because their test labels or inputs were never collected.
5. **Lighting has 3 vendors and no prices**, so its matches are weak and its range is configured, not learned.
6. **Free hosting and a laptop LLM:** cold starts are slow; the assistant needs the laptop with Ollama running and
   reachable.

## What would change these numbers most

1. The three planner interviews and the host survey: they replace the generator's placeholder effects and give #1 a
   real test.
2. Rate the 240 matching candidates (about an hour), which unlocks #3's real score.
3. Scenario quotes, which unlock #5's score and #2's second real test set.
4. Package contents for decor and photography (what's included), which would let #2 tell a basic setup from a full one.
