# Shevent Data Card

**Status (8 Nov 2026):** dataset v1 was built on 28 Oct (`dataset_hash b8264320b0bf`) from the vendor workbook: 156
vendors and 34 cleaned prices, 12 of them held out for test. No scenario quotes, survey answers, planner interviews,
reviews or portfolio images were collected, and every synthetic-data assumption is still a placeholder (see
[Synthetic events](#synthetic-events)). What this means for each model is in the
[evaluation report](evaluation_report.md).

| Source | Target | Collected |
|---|---|---|
| Vendors | 120 | 156 |
| Price observations | 300 | 34 after cleaning |
| Scenario quotes | 25 | 0 |
| Host survey answers | 40 | 0 |
| Planner interviews | 3 | 0 |
| Reviews | 300 | 0 |
| Portfolio images | 500 | 0 |

`data/splits/test_split.json`, which names the held-out vendors, isn't in the repository: rebuild it with
`python -m shevent_ml.data.split` (same seed, same dataset) and commit it.

## Real data

Collected by the team in Lahore following `data/DATA_COLLECTION_GUIDE.md`: vendors, vendor prices, quotes for
three standard scenarios, host survey answers, planner interviews, reviews and portfolio images.

| Table (`data/processed/`) | Built from | Used by |
|---|---|---|
| `vendors`, `vendor_areas` | `vendors.csv` | #3 matching |
| `prices` | `price_observations.csv` | #2 price ranges, synthetic base prices |
| `quotes` | `scenario_quotes.csv` (always test) | #2 and #5 evaluation |
| `reviews` | `reviews.csv` | #6 review insights |
| `media` | `portfolio_media.csv` | #7 portfolios |

**Cleaning** (`python -m shevent_ml.data.build`):

- Area names are mapped to the reference list.
- Every price is put on one basis: per head, or one price for the event. Hourly prices are multiplied by the hours.
- Prices are adjusted for inflation into October 2026 rupees, using PBS CPI where the config has it and a fallback annual rate where it doesn't.
- Duplicates are removed, and phone numbers are scrubbed from review text.
- Dropped rows are counted by reason in `manifest.json`, together with the `dataset_hash` that every training run logs.

**Test split** (`python -m shevent_ml.data.split`):

- About 20% of vendors in each category are held out, with all their prices. Scenario quotes are always test.
- The vendor IDs are committed in `data/splits/test_split.json`, and the split is never regenerated without `--force`.
- Caveat: a scenario-quote vendor's own rate-card prices may be in training.

**Privacy:** there are no phone numbers or personal names in any table. Contacts live only in the private sheet,
which is never exported. Interviews record the person's role, not their name.

## Synthetic events

Real prices are scarce and carry no event date, guest count or season, and few hosts will report a full budget
split. Synthetic events let the #1 and #2 models see those effects.

**Rule:** train on synthetic and real data, but evaluate only on held-out real data.

`python -m shevent_ml.synthetic.generate` writes `synthetic_events.parquet` (one row per event, with spend and share
per category) and `synthetic_services.parquet` (each category's unit price). `synthetic_manifest.json` records the
seed, the full settings, and which base prices were fitted from real data (`--fit-prices`).

**How an event is made:**

1. Draw an event type, price tier, area and venue type.
2. Draw a guest list from a log-normal, and the share of invited guests who come.
3. Draw a date weighted by demand. Weddings are rare in Ramadan and Muharram and peak after Eid and in wedding
   season; corporate events are mostly on weekdays. Seasons come from the Umm al-Qura Hijri calendar via
   `hijridate`; Pakistan's moon sighting can differ by a day.
4. Draw preferences (decor-heavy, premium food, live dhol).
5. Price each category: the base price for its tier, times the multipliers for season, weekend, area, venue type,
   guest count (for one-price categories), event type and preferences, times log-normal noise.
6. Set the planned budget to the spend less a sampled overspend. The tier is never shown to the models.

**Every number is in `ml/configs/synthetic.yaml`.** Each group has a `sources` entry that is `placeholder` until
it's replaced with collected figures:

| Config group | Replace with |
|---|---|
| `base_prices.catering` | Interview Q6 (per-head range by tier) · real prices via `--fit-prices` |
| `base_prices.dj_sound`, `.lighting`, `.photography` | Interview Q7 · real prices |
| `base_prices.venue`, `.decor` | Real prices (`--fit-prices`) |
| `season_price`, `wedding_demand` | Interview Q8 (peak months and %), Q9 (Ramadan, Muharram, after Eid) |
| `weekend_price`, `weekend_demand` | Interview Q10 |
| `area_price` | Interview Q12 |
| `event_types.*.attendance` | Interview Q14 · survey Q6–7 |
| `event_types.*` weight, guests, venues | Survey Q1, Q4, Q6 |
| `overspend` | Survey Q21 |
| `event_types.*.category_price`, `preferences` | Interview Q3–5 splits: tune them until the generator's mean split per event type (printed after each run) is close to the interviews |

The #1 baseline's fixed split (`ml/configs/baselines.yaml`) comes from the same interview answers (Q3–5).

**Limitations:**

- The generator only contains the effects written into the config. A model trained on it learns those effects,
  so they must come from interviews and real prices, not from guesses, before the results mean anything.
- Effects are multiplicative and independent: for example, the area premium is the same in every season.
- Synthetic budgets assume hosts spend at least their plan. Underspending isn't modelled.

## Portfolio images (#7)

Public portfolio photos are saved as `data/images/<vendor_id>/<vendor_id>_NN.jpg`, one `portfolio_media` row each.
The folder is git-ignored.

- `python -m shevent_ml.images.build` gives each image an MD5, a pHash, a dHash and an OpenCLIP ViT-B/32 embedding
  (LAION-2B weights), in `image_index.parquet` and `image_embeddings.npy`. Missing or unreadable files are listed
  with the reason.
- `python -m shevent_ml.images.planted` builds the **planted-duplicate test set**. It makes altered copies of 100
  collected photos: crop, resize, heavy JPEG, colour filter, grayscale, watermark, white border, mirror, and a
  "repost" that combines crop, filter and watermark. The chosen originals are fixed in
  `data/splits/planted_duplicates.csv`.
- `python -m shevent_ml.images.duplicates` scores the duplicate finders on that set: MD5 exact match (the baseline),
  pHash distance and CLIP similarity.
  - Recall is measured per transform.
  - Precision counts only flagged pairs that involve a planted copy, since only those have a known answer.
    Byte-identical collected files count as the same photo.
  - Other flagged pairs of collected photos, which may be real reposts, go to `duplicate_candidates.csv` for review
    against the pairs the team noted.

## Review aspect labels (#6)

- Each review is labelled on six aspects: punctuality, food quality, sound quality, staff behaviour, value for money
  and hidden charges. Each label is positive, negative, mixed or not mentioned (`ml/configs/reviews.yaml`).
- **Test set:** 150 reviews, at least 30% of them Roman Urdu, Urdu or mixed, fixed in
  `data/splits/review_test_ids.csv`. They are labelled by hand from scratch, with no LLM draft shown, so the labeller
  isn't anchored by the model.
- **Training labels:** first drafted by `qwen2.5:7b-instruct`, running locally in Ollama with temperature 0, a JSON
  schema and few-shot examples in English, Roman Urdu and Urdu. Then corrected in Label Studio. Each draft records
  the model and the prompt version.

## Matching relevance set (#3)

- 12 test queries, each an event plus a vendor category: the three standard scenarios for two categories each, and
  six more events (`ml/configs/matching_set.yaml`).
- Each query has 20 candidate vendors: up to 60% from vendors serving the event's area, the rest from anywhere.
  They are fixed in `data/splits/matching_candidates.csv`.
- The data lead rates each candidate 0–3 in `data/splits/matching_labels.csv`. Rankers re-rank the same candidates
  and are scored with NDCG@10 and Precision@5. The baseline is sort by rating.

## Quote fairness labels (#5)

- Every scenario quote (S1–S3) is a test row. `python -m shevent_ml.models.quote_checker --sheet` writes
  `data/processed/quotes_to_label.csv`: each quote with what the vendor was asked, and no model output, so the labels
  don't lean on the checker.
- The data lead gives each quote a **level** from experience (green: a normal price for what's offered; yellow:
  somewhat high; red: much too high) and lists the checklist items the price leaves out (**not_included**, item ids
  from `data/reference/quote_checklist.csv`). Saved as `data/splits/quote_labels.csv`.
- Scores: level accuracy and quadratic weighted kappa against the labels, next to the same rule on the median-lookup
  range and "always green"; checklist precision and recall, next to "ask about every item". Quotes are compared within
  their vendor's tier, as in the app.
- The checklist (`quote_checklist.csv`) is shared by the model server and the apps. Its keywords and cue words
  (`ml/configs/quote_checker.yaml`) are hand-written, not learned: English plus a few Roman Urdu words.

## In the app

`python -m shevent_ml.data.app_seed` turns `vendors.parquet` into `supabase/seeds/collected_vendors.sql` (git-ignored) for `public.vendors`.

- **What's in it:** public listing facts only: business name, category, type, base area and areas served. No phone numbers, addresses or people's names.
- **IDs:** each id is a UUID derived from the research `vendor_id`, so reloading updates rows in place, and the model server can match `prices.parquet` to app vendors.
- **Status:** listings start unverified, unclaimed and without consent to an indexable profile. Reloading never changes a listing its owner has claimed.

## Licences

| Item | Licence |
|---|---|
| `hijridate` (Umm al-Qura calendar) | MIT |
| `imagehash` | BSD-2-Clause |
| Qwen2.5-7B-Instruct (label drafts, via Ollama) | Apache 2.0 |
| Qwen2.5-3B-Instruct (#8 assistant, via Ollama) | Qwen Research License: research and non-commercial use only |
| #8 evaluation chats (`server/eval/*.jsonl`) | Written by the team; no personal names |
| Label Studio Community Edition | Apache 2.0 |
| OpenCLIP code / ViT-B-32 `laion2b_s34b_b79k` weights | MIT / MIT (trained on LAION-2B; check the model card before any commercial use) |
| Collected public data | Public posts and listings only, per each platform's terms (see the collection guide) |
