# Shevent Setup

How to run Shevent on a fresh machine, test it, and deploy it for free. Commands are for PowerShell on Windows; on
macOS or Linux use `ml/.venv/bin/python` where it says `ml\.venv\Scripts\python`.

## What's in the repo

| Folder | What it is |
|---|---|
| `apps/web` | Next.js web app (host and vendor sides) |
| `packages/core` | Shared TypeScript: schemas, enums, formatting, labels, fixtures |
| `supabase` | Database migrations, RLS policies, pgTAP tests, demo seed |
| `ml` | Python package `shevent_ml`: data pipeline, features, models #1-#5, image and review tooling. Trained models in `ml/artifacts` |
| `server` | FastAPI model server: `/v1/estimate`, `/recommend`, `/packages`, `/quote-check`, `/feedback`, `/assistant/chat` |
| `scripts` | `start-demo.ps1` (model server plus tunnel for the deployed site), `validate_data.py` |

## 1. Install the tools

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 or newer | Web app |
| pnpm | 10 (`corepack enable`) | JavaScript packages |
| Python | 3.12 (not 3.13) | Models and server |
| Docker Desktop | any recent | Local Supabase (and the optional Docker server image) |
| Ollama | any recent | The assistant's language model |
| cloudflared | any recent | Only to expose the model server to the deployed site |

The Supabase CLI comes with `pnpm install`. A 16 GB machine runs everything, but close other heavy apps, and use
`next start` rather than `next dev`.

## 2. Install the code

```
git clone https://github.com/namedabdullah/Shevent.git
cd Shevent
pnpm install
python -m venv ml\.venv
ml\.venv\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
ml\.venv\Scripts\python -m pip install -e ".\ml[dev]" -e ".\server[dev]"
ollama pull qwen2.5:3b-instruct
```

The first `pip install` line gets the CPU build of PyTorch (the default one bundles CUDA and is several GB). The trained
models are in `ml/artifacts`, so nothing needs training.

## 3. Start the database

```
pnpm db:start
pnpm db:reset
```

Docker must be running. `db:reset` applies the migrations and loads the fictional demo vendors from
`supabase/seed.sql`. The 327 collected vendors are not in git; after importing the data folder (section 7), run
`ml\.venv\Scripts\python -m shevent_ml.data.app_seed` and `pnpm db:reset` again to load them too.

`pnpm exec supabase status` prints the local API URL and the publishable key used below.

## 4. Configure

Copy each example file to `.env.local` next to it (both are git-ignored):

- **`server/.env.example` → `server/.env.local`:** set `SUPABASE_URL=http://127.0.0.1:54321` and `SUPABASE_KEY` to the
  local publishable key. The Ollama settings can stay as they are.
- **`apps/web/.env.example` → `apps/web/.env.local`:** set `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` the same way. Keep `NEXT_PUBLIC_API_FIXTURES=true` to run the web app on sample
  numbers without the model server, or set it to `false` and `MODEL_SERVER_URL=http://localhost:8000` to use the real
  models.

## 5. Run

Model server (with Ollama running):

```
ml\.venv\Scripts\python -m uvicorn app.main:app --app-dir server --env-file server\.env.local
```

`http://localhost:8000/health` lists the loaded models; `/docs` has the interactive API.

Web app, in a second terminal:

```
pnpm --filter @shevent/web build
pnpm --filter @shevent/web start
```

Open `http://localhost:3000`. Sign-in uses a magic link: locally, the email arrives in Mailpit at
`http://127.0.0.1:54324`. A vendor account starts at `/vendor/onboarding`.

## 6. Test

| What | Command |
|---|---|
| Shared code and web unit tests | `pnpm test` |
| Types and lint | `pnpm typecheck` and `pnpm lint` |
| Database (RLS, functions) | `pnpm db:test` |
| ML package | `ml\.venv\Scripts\python -m pytest ml` |
| Model server, API contracts, assistant | `ml\.venv\Scripts\python -m pytest server/tests` |
| Python lint | `ml\.venv\Scripts\python -m ruff check ml server` |
| Browser journeys (5 browser profiles) | `pnpm --filter @shevent/web exec playwright install`, then `pnpm --filter @shevent/web test:e2e` with the database running and the web app built with `NEXT_PUBLIC_API_FIXTURES=true` |
| Assistant evaluation (needs Ollama) | `cd server; ..\ml\.venv\Scripts\python -m eval.assistant_eval --cases holdout` |

## 7. Retrain (optional)

With the data lead's dataset folder (`shevent_dataset`, from the team's drive):

```
ml\.venv\Scripts\python -m shevent_ml.data.import_dataset <path to shevent_dataset>
ml\.venv\Scripts\python scripts\validate_data.py data\raw
ml\.venv\Scripts\python -m shevent_ml.data.build
ml\.venv\Scripts\python -m shevent_ml.data.split
ml\.venv\Scripts\python -m shevent_ml.synthetic.generate --fit-prices
ml\.venv\Scripts\python -m shevent_ml.models.price_estimator
ml\.venv\Scripts\python -m shevent_ml.models.budget_allocator
```

The import writes `data/raw` in the template format; `data/splits/test_split.json` is created once per dataset and
then kept (`--force` only before any model has been scored on it).

Add `--mlflow` to log the runs (`docker compose up -d mlflow`, UI at `http://127.0.0.1:5000`). Results go into
`docs/evaluation_report.md` and the model cards.

## 8. Deploy for free

The live demo is `https://shevent.vercel.app`.

| Part | Where | Notes |
|---|---|---|
| Web app | Vercel Hobby | Import the repo with root directory `apps/web` (as a single Next.js project, not "Services"). Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_FIXTURES=false`, `MODEL_SERVER_URL`, `NEXT_PUBLIC_AUTH_GOOGLE=false` |
| Database and sign-in | Supabase free | `pnpm db:push` applies the migrations; load the collected vendors by pasting `supabase/seeds/collected_vendors.sql` into the SQL Editor. Under Authentication → URL Configuration, set the Site URL and add `<site>/**` to the redirect URLs |
| Model server and assistant | The team laptop | `powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1` starts the server and a Cloudflare quick tunnel and prints the address for `MODEL_SERVER_URL`. The address changes on every start: update it in Vercel and redeploy. Hugging Face Docker Spaces now need a paid plan, so they aren't used |

`server/Dockerfile` builds the model server image (`docker build -f server/Dockerfile -t shevent-server .`) for any host
that runs containers with more than 512 MB of memory (PyTorch, LightGBM and OR-Tools don't fit in less).

## Licences

Every model's and dataset's licence is in its card in `docs/model_cards/` and in `docs/data_card.md`. The assistant's
model, Qwen2.5 3B Instruct, is for research and non-commercial use only.
