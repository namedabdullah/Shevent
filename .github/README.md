# Shevent

**An AI-assisted event marketplace for Lahore.** A host describes an event (a 300-guest mehndi in Gulberg, Rs 25 lakh)
and gets a budget split, fair price ranges, matched vendors, ready-made vendor packages, a fairness check on every
quote, and a planning assistant that understands English, Roman Urdu and Urdu. Vendors get serious leads and see how
their quote compares before they send it.

NETSOL AI/ML capstone, November 2026. Built entirely on free tools and open-weight models: no paid APIs.

**Live demo:** https://shevent.vercel.app (the AI features need the team laptop running; see [Deployment](#deployment)).

## The AI features

| # | Feature | What it does | Result on held-out data |
|---|---|---|---|
| 1 | Budget Allocator | Splits the budget across venue, catering, decor, DJ & sound, lighting and photography | Share error 2.4 points vs 5.7 for a fixed split (synthetic events; no host survey collected) |
| 2 | Price Range Estimator | Low / likely / high price per category for the event | 46 real test prices: 72% MAPE vs 92% for a median lookup; the 80% range holds 91% |
| 3 | Vendor Matching | Ranks vendors with a reason for every match; sponsored listings kept separate | Not scored (the rated test set isn't rated yet) |
| 4 | Package Builder | Three complete vendor line-ups within the budget (OR-Tools CP-SAT) | Never over budget; beats a greedy baseline at tight budgets |
| 5 | Quote Fairness Checker | Green / amber / red against the typical range, plus what to ask about | Not scored (no real quotes collected) |
| 6 | Review Insights | Praise and complaints per aspect in reviews, in three languages | 150 real reviews: macro-F1 0.436 vs 0.424; finds 13 of 17 complaints vs 7 |
| 7 | Verified Portfolios | Finds reused portfolio photos, even resized, filtered, framed or mirrored | 900 planted copies: 78% found at 100% precision vs 0% for exact matching |
| 8 | Planning Assistant | Chat in English, Roman Urdu or Urdu; a local LLM reads, the server answers from #1 and #2 | 95% of holdout chats read right; 0 invented values or figures |

Every number, baseline and caveat is in the [evaluation report](../docs/evaluation_report.md). The honest summary:
the methods are built, tested and served; the data behind several of them is thin, and the app labels every amount
"AI estimate, not a vendor quote".

## Documents

| Document | What's in it |
|---|---|
| [Setup guide](../docs/setup.md) | Install, run locally, test, retrain, deploy |
| [Evaluation report](../docs/evaluation_report.md) | Every metric against its baseline, with limitations |
| [Model cards](../docs/model_cards/) | One per model: inputs, outputs, training data, results, limitations, licences |
| [Data card](../docs/data_card.md) | What was collected, how it was cleaned, synthetic data, test splits, privacy |
| [Demo script](../docs/demo_script.md) | The 12-minute live demo, step by step |

## How it fits together

```
Browser / phone ── Next.js web app (Vercel) ──┬── Supabase: sign-in, plans, vendors, inquiries, quotes, bookings
                                              └── /api/ai proxy ── FastAPI model server ── models #1-#6 (ml/artifacts)
                                                                                         └─ Ollama: Qwen2.5 3B (#8)
```

| Folder | Contents |
|---|---|
| `apps/web` | Next.js 16 web app: host and vendor journeys, the assistant, Playwright tests |
| `packages/core` | Shared TypeScript: API schemas (zod), enums, price formatting, labels, fixtures |
| `supabase` | Postgres schema, row-level security, pgTAP tests |
| `ml` | Python package `shevent_ml`: data pipeline, features, synthetic data, models #1-#6, trained artifacts |
| `server` | FastAPI model server, the planning assistant and its evaluation set |
| `scripts` | Data validator, and the demo start script (model server plus tunnel) |

## Quick start

```
pnpm install
pnpm db:start && pnpm db:reset
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
ml/.venv/Scripts/python -m pip install -e "./ml[dev]" -e "./server[dev]"
ml/.venv/Scripts/python -m uvicorn app.main:app --app-dir server --env-file server/.env.local
pnpm --filter @shevent/web build && pnpm --filter @shevent/web start
```

The [setup guide](../docs/setup.md) has the details: environment files, Ollama for the assistant, tests and retraining.
The trained models are in the repository, so nothing needs training to run the app.

## Deployment

The web app runs on Vercel and the database on Supabase, both on free tiers. The model server and the assistant's LLM
run on a team laptop: `scripts/start-demo.ps1` starts the server and a Cloudflare quick tunnel, whose address goes into
Vercel's `MODEL_SERVER_URL`. Free container hosts that fit the server (Hugging Face Docker Spaces) now need a paid plan.
Without the laptop the site still works (sign-in, plans, vendors, inquiries, quotes, bookings); the AI steps show an
error and the planner form stays available.

## Data and responsible AI

- **Real data:** 327 Lahore vendors, 402 prices and 308 reviews from public listings. The app gets public listing facts
  only (business name, category, areas): no phone numbers or addresses, and review text is never shown. Directory
  sites aren't named.
- **Synthetic data, labelled as such:** synthetic events train #1 and #2 where real prices are missing, and synthetic
  reviews train #6 (the real ones are 97% five-star). Models are scored on held-out real data only.
- **Guidance, not accusations:** quote checks say "worth asking about", never "overcharging"; review cons say "some
  reviews mention".
- **No invented figures:** the assistant's model only reads; every number in a reply comes from #1 and #2.
- **Sponsored listings** are labelled and never mixed into the ranked matches.

## Licences

No licence has been chosen for this code yet. Third-party models and libraries keep their own licences, listed in each
model card. Note that Qwen2.5 3B Instruct, the assistant's model, is under the Qwen Research License (research and
non-commercial use only).
