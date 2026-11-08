# Shevent Evaluation Report

**As of 8 Nov 2026.** Covers every AI feature in the capstone scope. Each model has a card in
[`docs/model_cards/`](model_cards/); the data behind them is described in the [data card](data_card.md).

## Summary

| # | Feature | Status | Headline result | Beats its baseline on real held-out data? |
|---|---|---|---|---|
| 1 | Budget Allocator | Built, served | Share MAE 0.025 on synthetic held-out events (fixed planner split 0.050) | **Not tested:** no host has reported a real split yet |
| 2 | Price Range Estimator | Built, served | 12 real test prices: MAPE 0.83 (median lookup 0.87), range holds 42% (median lookup 33%; target 80%) | Slightly, on 12 prices; the range is far too narrow on real prices |
| 3 | Vendor Matching | Built, served | Not scored: the hand-rated matching set is waiting for its ratings | **Not tested** |
| 4 | Package Builder | Built, served | Synthetic: every package within budget; 69% of events get one at 70% of budget (greedy 64%); slowest solve 0.46 s | Synthetic only (it's an optimiser; the guarantees are tested) |
| 5 | Quote Fairness Checker | Built, served | Synthetic: a doubled price flagged 87% of the time when the tier is known; typical prices green ~90% | **Not tested:** no scenario quotes collected |
| 6 | Review Insights | Labelling tools only | No reviews collected, so no model was trained | No |
| 7 | Verified Portfolios | Image pipeline only | No portfolio images collected, so the planted-duplicate test hasn't run | No |
| 8 | AI Planning Assistant | Built, served | Holdout chats: whole plan right 95% (model alone 80%); 0 invented values; 0 invented figures in replies | Yes, on its own chat sets (the baseline is the model without the server's checks) |

**The one-line verdict:** the plumbing from event details to a priced plan, matched vendors, packages, quote checks and
a chat assistant is built, tested and served. The data behind the prices and splits is not there yet: 34 real prices,
no quotes, no reviews, no images, no host survey and every synthetic-data effect still a placeholder. So the price and
split numbers the app shows are demonstrations of the method, not market figures, and the app says so ("AI estimate,
not a vendor quote", "Sample numbers").

## Data available

| Source | Target (collection guide) | Collected |
|---|---|---|
| Vendors | 120 | **156** |
| Price observations | 300 | **34** (after cleaning; 12 held out for test) |
| Scenario quotes | 25 | 0 |
| Host survey answers | 40 | 0 |
| Planner interviews | 3 | 0 |
| Reviews | 300 | 0 |
| Portfolio images | 500 | 0 |

Dataset v1: `dataset_hash b8264320b0bf`, built 28 Oct. Synthetic events: `synthetic_hash 9a2fd6c24dd6`, with every
config group (`event_mix`, `base_prices`, `price_effects`, `demand`) still marked `placeholder`.

**Rule kept throughout:** train on synthetic plus real data, score only on held-out real data. Where no real held-out
data exists, the synthetic score is shown and labelled as such; it only shows the model learns the effects written
into the generator.

**Reproducibility gap:** `data/splits/test_split.json`, which named the 12 held-out prices, isn't in the repository on
this machine. `python -m shevent_ml.data.split` rebuilds it from the same seed and dataset; commit it this time.

## #1 Budget Allocator

Synthetic held-out events (1,948 rows), lower is better:

| Model | Share MAE | KL divergence |
|---|---|---|
| Network (`alloc-v1-41889f86`) | 0.0254 | 0.0213 |
| Per-category regressors, normalised | 0.0252 | 0.0212 |
| Fixed planner split | 0.0505 | 0.0678 |

Per category (network vs. planner split): venue 0.034 vs 0.077, catering 0.041 vs 0.107, decor 0.034 vs 0.050,
DJ & sound 0.012 vs 0.022, lighting 0.013 vs 0.019, photography 0.018 vs 0.028.

- The network halves the planner split's error but only **ties** the per-category regressors. On this data the
  network's advantages are structural: shares always add to 100%, and exact Shapley explanations over seven input
  groups.
- The planner split is itself a placeholder until the interviews come in, so the comparison with it is weak.
- Guardrails (no category below the cheapest realistic price from #2; "budget too low" with the shortfall) are unit
  tested. A crash on plans without a venue type was found by the #8 evaluation and fixed on 8 Nov, with a regression
  test.

## #2 Price Range Estimator

| Rows | Model | MAPE | Pinball loss 10% / 50% / 90% (PKR) | 10-90% range holds |
|---|---|---|---|---|
| 12 real test prices | `cost-v1-97907a1e` | **0.83** | 7,138 / 24,693 / 35,670 | **42%** |
| 12 real test prices | Median lookup | 0.87 | 7,655 / 27,035 / 45,583 | 33% |
| 5,979 synthetic held-out | `cost-v1-97907a1e` | 0.39 | 8,406 / 27,124 / 16,992 | 81% |

- The model beats the median lookup on every measure, but on 12 prices that is weak evidence.
- **The range is calibrated on synthetic prices** (6,021 rows; there were too few real ones for the 30-row minimum), so
  it holds 81% on synthetic data and only 42% on real prices. Real Lahore prices vary more than the placeholder
  generator assumes. This is the most important limitation in the system: every range in the app is narrower than it
  should be.
- Fix, in order: collect more real prices (the cheapest improvement), replace the generator's placeholder effects with
  interview figures, then calibrate on real prices once there are 30 or more.

## #3 Vendor Matching

Not scored. The matching set is built: 12 queries × 20 candidates, written by `python -m shevent_ml.eval.matching_set`.
The candidates are waiting for the data lead's 0-3 relevance ratings. Once rated, `python -m shevent_ml.models.matching`
reports NDCG@10 and Precision@5 next to sort-by-rating.

What is tested: vendors over capacity are excluded, sponsored vendors never enter the ranking, every match has
factual reasons, and the new-vendor boost is bounded. On the collected vendors, no ratings, capacities, tiers or event
types were gathered, so the ranking rests mostly on area and price.

## #4 Package Builder

On 200 synthetic events with a synthetic pool of 60 vendors per category:

| Measure | CP-SAT | Greedy per category |
|---|---|---|
| Package within budget, at 70% of the budget | **69%** of events | 64% |
| Mean match score | **0.869** | 0.813 |
| Packages over budget | 0 | (not guaranteed) |
| Three packages distinct | Always | n/a |
| Slowest of the three solves | 0.46 s | |

The whole `/v1/packages` request takes about 1 s on the dev laptop, mostly #3's pandas scoring. On the collected
vendors, photography has no vendors, so it is reported in `unfilled_categories`. With no vendor ratings, "highest
quality" is close to "balanced".

## #5 Quote Fairness Checker

Synthetic quotes only. With the vendor's tier known, a doubled price is flagged 87% of the time (39% across all
tiers, whose range is about 5× wide); typical prices are green about 90% of the time either way. The labelling sheet
and the scoring (level accuracy, quadratic weighted kappa, checklist precision and recall, against the median-lookup
rule, "always green" and "ask about every item") are ready, waiting for scenario quotes and the data lead's labels.

The checklist rules are hand-written keywords and cue words, English plus a few Roman Urdu words. All wording in the
apps is guidance, never an accusation.

## #6 Review Insights and #7 Verified Portfolios

Neither model was trained: no reviews or portfolio images were collected. What exists:

- **#6:** the six-aspect label schema, Ollama label drafting (Qwen2.5 7B, JSON schema, few-shot in three languages),
  the Label Studio setup and the 150-review test-set rule (labelled blind, at least 30% Roman Urdu, Urdu or mixed).
- **#7:** MD5, pHash, dHash and OpenCLIP ViT-B/32 embeddings per image, the planted-duplicate test set (nine
  transforms of 100 photos) and the scoring against MD5 exact matching.

Both run end to end as soon as the data exists. Neither has an endpoint yet (`/v1/reviews/insights`,
`/v1/portfolio/check`).

## #8 AI Planning Assistant

Qwen2.5 3B Instruct (Q4_K_M) on Ollama, laptop GPU. The model reads the chat into a strict JSON schema; the server
keeps only values the host actually wrote, runs #1 and #2 and writes the reply from their results.

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

## Software tests (8 Nov)

| Suite | Result |
|---|---|
| `ml/` pytest | 151 passed |
| `server/` pytest (API, contracts, assistant) | 80 passed |
| `packages/core` Vitest | 194 passed |
| `apps/web` lint and typecheck | clean |
| Playwright (5 browser profiles, fixtures) | Last full run: 340 tests passed, 10 by-design skips |

## Limitations that matter for the demo

1. **Prices are not market prices yet.** 34 real prices and a placeholder generator. The ranges are too narrow on real
   prices (42% coverage against a target of 80%).
2. **Splits are not learned from real hosts.** #1 learns the generator's placeholder effects.
3. **#3, #5, #6 and #7 have no real-data score**, because their test labels or inputs were never collected.
4. **The assistant only understands what its keyword lists and the 3B model cover.** Unusual phrasings go to the
   planner form, which is always available.
5. **Free hosting and a laptop LLM:** cold starts are slow; the assistant needs the laptop with Ollama running and
   reachable.

## What would change these numbers most

1. Collect the missing real prices and the three planner interviews, then re-run the generator with `--fit-prices` and
   retrain #1 and #2.
2. Rate the 240 matching candidates (about an hour), which unlocks #3's real score.
3. Collect the scenario quotes, which unlock #5's score and #2's second real test set.
