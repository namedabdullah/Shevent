# Shevent Setup

How to run Shevent on a fresh machine, test it, and deploy it for free. Commands are for PowerShell on Windows; on
macOS or Linux use `ml/.venv/bin/python` where it says `ml\.venv\Scripts\python`.

## What's in the repo

| Folder | What it is |
|---|---|
| `apps/web` | Next.js web app (host and vendor sides) |
| `packages/core` | Shared TypeScript: schemas, enums, formatting, labels, fixtures |
| `supabase` | Database migrations, RLS policies, pgTAP tests, demo seed |
| `ml` | Python package `shevent_ml`: data pipeline, features, models #1-#7. Trained models in `ml/artifacts` |
| `server` | FastAPI model server: `/v1/estimate`, `/recommend`, `/packages`, `/quote-check`, `/reviews/insights`, `/portfolio/check`, `/feedback`, `/assistant/chat` |
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

Clone to a short path such as `D:\Projects\Shevent`: PyTorch's header files are deep, and under a long folder path pip
fails with "No such file or directory" unless Windows long paths are enabled. (Checked on a fresh clone, 16 Nov.)

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
| Assistant question types (no Ollama) | `cd server; ..\ml\.venv\Scripts\python -m eval.question_types` |
| Assistant staying on topic | `cd server; ..\ml\.venv\Scripts\python -m eval.assistant_scope --set blind2 --model` (drop `--model` to run without Ollama) |

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

Every AI feature on the live site (the budget split and prices, the home page planner, matches, packages, quote
checks, review summaries, the photo check and the assistant) goes through this laptop. If the site says "The estimate
service is still unavailable" or "Model server is unreachable", the laptop, the server or the tunnel is off, or Vercel
still holds an old address:

1. Run `scripts\start-demo.ps1` and wait for the green `MODEL_SERVER_URL=https://<words>.trycloudflare.com` line and
   "The address answers /health from outside". Asking for a tunnel sometimes times out on a slow connection; the
   script retries up to 5 times. Ollama is only needed for the assistant: without it, everything else still works.
2. In Vercel, open the project's Settings → Environment Variables, set `MODEL_SERVER_URL` to that address (only the
   address, without `MODEL_SERVER_URL=` or spaces), then go to Deployments and choose Redeploy on the latest one.
   Changed variables only apply to new deployments.
3. Try the budget planner on the home page, or create a plan.

Keep the window open and the laptop awake (no sleep) for as long as the site should work.

`server/Dockerfile` builds the model server image (`docker build -f server/Dockerfile -t shevent-server .`) for any host
that runs containers with more than 512 MB of memory (PyTorch, LightGBM and OR-Tools don't fit in less).

## Sign-in email (SMTP)

Shevent's `signInWithOtp` action asks Supabase Auth to send the email. Configure SMTP in Supabase;
the web app and AI server do not need SMTP credentials or another mail-sending library.

### Hosted Supabase

1. In your SMTP provider, verify the sender address/domain and apply the DNS records it requires.
2. In your Supabase project, open **Authentication → Email → SMTP Settings**, enable custom SMTP,
   and enter the provider's host, TLS port, username and SMTP password/API key. Set the sender name
   to **Shevent** and sender address to the verified address. Use the provider's SMTP credentials.
3. Under **Authentication → URL Configuration**, set Site URL to `https://shevent.vercel.app`
   (or your actual production domain). Allow the callback
   `https://shevent.vercel.app/api/auth/callback**` so the `?next=...` query is accepted.
   Add localhost callback URLs separately only when using the hosted project for local development.
4. Under **Authentication → Email → Templates**, copy
   `supabase/templates/confirmation.html` into **Confirm signup**, with subject
   **Welcome to Shevent — confirm your email**. Copy `supabase/templates/magic_link.html`
   into **Magic Link**, with subject **Your Shevent sign-in link**.
   Keep `{{ .ConfirmationURL }}` intact: Supabase builds the verification link and passes the
   code to the existing `/api/auth/callback` handler. First-time and returning users can receive
   different template types.
5. Disable click tracking/link rewriting in the email provider. In Supabase Auth rate limits,
   choose an email limit within your provider's quota; retain a per-recipient resend cooldown.
6. Test with an address you control using the steps below.

These are hosted Auth settings: `pnpm db:push` and a Vercel redeploy do not configure SMTP or
upload these templates. Enter secrets directly in Supabase; keep them out of GitHub,
`NEXT_PUBLIC_*` variables, and chat.

### Local development

The default config still delivers to Mailpit at `http://127.0.0.1:54324`, with both branded
templates loaded from the repository. No SMTP account is needed.

To deliberately test real delivery locally, copy `supabase/.env.example` to `supabase/.env`,
fill in the values, uncomment the `auth.email.smtp` block in `supabase/config.toml`, and set
its port to the provider's TLS port. Restart with `pnpm exec supabase stop` and `pnpm db:start`.
Local custom SMTP also uses `auth.rate_limit.email_sent`, currently 2 per hour: adjust this
for your test quota if needed, and use a sensible `auth.email.max_frequency` such as `"60s"`
when sending real email. Re-comment the SMTP block and restart to return to Mailpit.
The local SMTP opt-in edits should stay local.

### Verify delivery and sign-in

- Request a link from `/sign-in` with a new test address. Check the branded email, click the
  link in the same browser, and confirm a signed-in page loads.
- Sign out, request another link for the same address, and repeat to cover returning users.
- Start from a protected page and confirm the link returns to the intended page.
- Reusing the link should show the existing sign-in error. Request a fresh link to recover.
- If sending fails, inspect Supabase Auth logs and the provider delivery logs. Check sender
  verification, credentials, rate limits, spam, callback allowlists and disabled click tracking.

References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[local templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).

## Licences

Every model's and dataset's licence is in its card in `docs/model_cards/` and in `docs/data_card.md`. The assistant's
model, Qwen2.5 3B Instruct, is for research and non-commercial use only.
