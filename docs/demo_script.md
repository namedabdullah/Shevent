# Shevent Demo Script

The product overview's §06 journey, run live on **https://shevent.vercel.app**: one host plans a 300-guest mehndi in
Gulberg on Saturday 19 December with a budget of Rs 25 lakh, and a lighting vendor quotes for it. About 12 minutes.

Every figure below comes from the dataset v2 models (`alloc-v1-52d3ae4d`, `cost-v1-511086e1`) and the 327 collected
vendors, as of 10 Nov 2026. The live site shows them once the model server has been restarted with those models and the
vendor seed has been loaded. The assistant runs at temperature 0 with a fixed seed, so the same messages give the same
replies. If a figure differs on the day, the models or vendors changed; say what's on screen, not what's written
here.

## Setup

### The day before

- [ ] **Two accounts**, both signed in once already, so no magic-link email is needed during the demo:
  - **Host:** your own email, in your normal browser.
  - **Vendor:** a second address, in a private window or a second browser. A Gmail plus address works
    (`yourname+vendor@gmail.com`) and arrives in the same inbox.
- [ ] **The demo lighting vendor's listing.** Signed in as the vendor, open `/vendor/onboarding`:
  - Business name: `Gulberg Lights Demo` (never a real business's name)
  - What do you provide?: Lighting · Where are you based?: Gulberg · Areas you serve: Gulberg and DHA
  - What's usually included: `Fairy lights, Generator fuel`
  - Click **Create my listing**. The model server reads new listings every 5 minutes, so do this at least 5 minutes
    before the host reaches the lighting matches.
- [ ] One full rehearsal on the live site (log it at the end of this file).
- [ ] The backup video is recorded (see [Fallbacks](#fallbacks)).

### 30 minutes before

- [ ] Laptop plugged in; **Settings → System → Power** set to never sleep while plugged in.
- [ ] Ollama running: `http://127.0.0.1:11434` says "Ollama is running".
- [ ] In PowerShell at the repo root: `powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1`. Leave the
  window open.
- [ ] **If the printed address differs from Vercel's `MODEL_SERVER_URL`**, update it in Vercel (Settings →
  Environment Variables), then Deployments → latest → **Redeploy**, and wait for it to finish (about 2 minutes).
- [ ] Warm up the whole chain: as the host, open **Assistant** and send `hi`. A reply within a few seconds means
  Vercel, the tunnel, the model server and Ollama all work and the model is loaded. Reload the page to clear it.
- [ ] Vendor window: `/vendor/inquiries` open. Host window: the home page. Close other tabs and apps; turn off
  notifications.
- [ ] Phone on the same Wi-Fi or mobile data, with `shevent.vercel.app` open, if you'll show it on a phone.

## The run

Each step: what to **do**, what the audience **sees**, and what to **say**.

### 1. The assistant (#8): about 2 minutes

**Do:** host window → **Assistant**. Type `mehndi karni hai 300 log, Gulberg mein, budget 25 lakh` and press Enter.

**Sees:** "Got it: a mehndi / mayun / dholki for 300 guests in Gulberg with a budget of Rs 25 lakh. To work out your
budget split I still need the date."

**Do:** type `19 December, marquee mein` and press Enter.

**Sees:** "Here is a budget split for a mehndi / mayun / dholki for 300 guests in Gulberg on Sat, 19 Dec 2026 with a
budget of Rs 25 lakh. Catering gets Rs 11.31 lakh (45%), within what this usually costs; Venue gets Rs 5.53 lakh (22%),
within what this usually costs. It falls in peak wedding season, when prices run higher." and the split table.

**Say:**
- The host writes in Roman Urdu, the way people actually text. A small open-weight model, Qwen2.5 3B, runs on this
  laptop for free; no paid API.
- The model only *reads* the message. The server keeps a value only if the host actually wrote it, and every number in
  the reply comes from the budget and price models. On the evaluation set it never invented a value; the model on its
  own made up 19.
- It asked only for what was missing: the date.

**Do:** click **Save as a plan**. The planner opens filled in. Click **Get my budget split**.

### 2. The budget split (#1) and price ranges (#2): about 2 minutes

**Sees:** "Mehndi / mayun / dholki in Gulberg", the six-way split, each category with the host's budget next to a
typical low-high range and the label "AI estimate, not a vendor quote". Under **Why this split**: "Venue share is below a
typical event's (22% vs 26%), mainly because of the event type" and "Decor share is above a typical event's (19% vs
16%), mainly because of the event type".

| Category | Budget | Typical range |
|---|---|---|
| Catering | Rs 11.31 lakh | Rs 4.51-22.32 lakh |
| Venue | Rs 5.53 lakh | Rs 1.48-13.03 lakh |
| Decor | Rs 4.83 lakh | Rs 91,000-11.35 lakh |
| Lighting | Rs 1.46 lakh | Rs 30,000-3.6 lakh |
| Photography | Rs 1.33 lakh | Rs 24,000-3.27 lakh |
| DJ & sound | Rs 54,000 | Rs 14,000-1.27 lakh |

**Say:**
- #1 is a small neural network whose shares always add to 100%, with guardrails so no category drops below a
  realistic minimum. The explanations are exact Shapley values, not guesses.
- #2 gives a range, not a single number: three LightGBM quantile models, calibrated to hold 80% of prices.
- The ranges come from 402 real Lahore prices the team collected. On 46 prices held out from training, the range held
  91% of them (the target is 80%), and the likely price beat a simple median lookup (72% error against 92%).
- **Be honest here:** the ranges are wide, because decor and photography listings rarely say what a package includes,
  and the split still learns from synthetic events: no host survey or planner interviews were collected. The label on
  every amount says "AI estimate, not a vendor quote".

### 3. Packages (#4): about 1 minute

**Do:** on the plan, click **Compare ready-made vendor packages**.

**Sees:** Cheapest (about Rs 5.28 lakh), Balanced and Highest quality (about Rs 15.56 lakh each), all within Rs 25
lakh, each with a vendor in all six categories and price ranges. Items marked as estimates are vendors without a listed
price, priced by #2.

**Say:**
- One tap gives three complete line-ups. Each is an exact constraint solve (Google OR-Tools): one vendor per category,
  total within budget, vendors that serve the area and can take 300 guests. Each solve takes under half a second.
- Balanced and highest quality cost the same today because no vendor ratings have been collected yet, so "quality"
  can't separate them.
- A price the vendor listed is shown as theirs only when we trust it: a hall whose rent is an extra to its menu, or a
  vague directory range, is priced by the model instead.

### 4. Matches (#3) and the inquiry: about 1.5 minutes

**Do:** back to the plan → **Lighting**.

**Sees:** **Best matches**, with Gulberg Lights Demo first because it serves Gulberg, and the reasons on each card
("New on Shevent", "Based in Cantt, not listed for Gulberg").

**Say:**
- Matching scores price fit, area, capacity, experience and quality, and every match says why. Sponsored vendors, when
  there are any, appear in their own labelled list and never mix into the ranking.
- *Planned, not built:* review insights (#6) and portfolio checks (#7). They're designed and their pipelines exist, but
  no reviews or photos were collected, so there's nothing to train on.

**Do:** **Send inquiry** on Gulberg Lights Demo. In the chat type `Salam, are you free on 19 December?` and **Send**.

### 5. The vendor's quote with a live fairness preview (#5): about 2 minutes

**Do:** switch to the vendor window → **Inquiries** (refresh) → open the new mehndi inquiry.

**Sees:** the event, date, guest count and the host's message, **but no budget**.

**Say:** the vendor never sees the host's budget, so it can't anchor the quote.

**Do:** **Your price** `4 lakh`, **Price is** per event, **Included** `Fairy lights, Generator fuel`. Wait for the
preview.

**Sees:** in **What the host will see**: "Above the typical range (11% above)", typical Rs 30,200-3.6 lakh, and "Ask
the vendor about: Setup and teardown, Transport".

**Say:**
- The vendor sees exactly what the host will see before sending. Wording is guidance, never an accusation.
- To show it moving, change the price: `3 lakh` turns it green (within the range), `5 lakh` red (well above). Set it
  back to `4 lakh`.

**Do:** **Send quote**.

### 6. The host checks the quote and books: about 1.5 minutes

**Do:** host window, on the inquiry.

**Sees:** the quote with "Above the typical range (11% above)", the range, "Ask the vendor about: Setup and teardown,
Transport", "AI estimate, not a vendor quote" and "Payment is simulated: no money is charged."

**Do:** host types `Is setup and teardown after midnight included?`. Vendor window: reply
`Yes, setup and teardown are included.` (it appears live on the host side). Host clicks **Book for Rs 400,000**.

**Sees:** the booking page, "Simulated: no money was charged". The vendor's inquiry now says "The host booked this
quote".

### 7. Feedback: about 1 minute

**Do:** back to the plan → **Mark the event as completed** → **Tell us how it went**. Enter Lighting `4 lakh`,
Catering `11 lakh`, guests `280`, a rating, then **Send feedback**.

**Sees:** "Thank you. Your feedback helps make the estimates more accurate."

**Say:** actual spend per category is saved for retraining the split, the price ranges and matching. That's how the
synthetic data gets replaced by real data after launch.

### Close: 30 seconds

Weeks of WhatsApp messages became one session: the host knows what each part should cost, gets ready-made line-ups and
a quote with a clear label and questions to ask; the vendor gets a serious lead. Everything runs on free tiers and an
open-weight model on this laptop.

## If asked

| Question | Answer |
|---|---|
| How good are the price ranges? | They hold real prices: 91% of 46 held-out real prices fall in the range (target 80%), and the likely price beats a median lookup (72% error against 92%). They're wide, especially for decor and photography, whose listings rarely say what's included. See `docs/evaluation_report.md` |
| Can the assistant make up prices? | No. The model only reads; the server keeps only what the host wrote and writes the reply from the models' output. 0 invented values or figures on 71 test chats |
| Why not let the LLM write the reply? | We tried. Every figure passed the check, but it still made false claims with true figures ("60% more than usual" for an amount below the usual range). So the server writes it |
| What does it cost to run? | Nothing: Vercel Hobby, Supabase free, the model server and Ollama on a laptop through a free Cloudflare tunnel |
| Is it in Urdu? | The host can write English, Roman Urdu, Urdu or a mix; the app answers in English |
| What happens without the laptop? | The site, sign-in, plans, vendors, inquiries and bookings still work; the AI steps show an error and the planner form stays available |

## Fallbacks

| Problem | Do this |
|---|---|
| Assistant slow on the first message (model loading) | Keep talking through step 1; it loads once. If it fails, use the planner: `/plan/new` with the same details |
| Assistant says it can't help, or answers 503 | Use the planner form (step 1's second half): it gives the same split |
| Budget split says "We couldn't work out your budget split yet" | Check the PowerShell window. If it stopped, restart the script, update `MODEL_SERVER_URL` in Vercel and redeploy (about 3 minutes); meanwhile play the backup video |
| The demo vendor isn't in the lighting matches | Listings refresh every 5 minutes: show another category, then come back |
| A message doesn't appear in the other window | Refresh the page |
| Internet down | Play the backup video |

**Backup video:** record one full clean run of this script, steps 1-7, with Windows' recorder (Win+Alt+R in Xbox Game
Bar) or OBS (free). Keep it on the laptop and on a USB stick.

**Fully local fallback (not yet rehearsed):** `docker compose up -d model-server` runs the model server locally
(`docker-compose.yml`, pointed at a local Supabase), and the web app runs with `pnpm --filter web start`. On the 16 GB
laptop this is close to its memory limit with Ollama loaded; rehearse it before relying on it.

## Rehearsal log

| Date | Who | Steps 1-7 clean? | Total time | Problems and fixes |
|---|---|---|---|---|
| | | | | |
| | | | | |

## After the demo

The demo's plans, inquiry, quote and booking stay in the hosted database under your two accounts, and Gulberg Lights
Demo stays listed. To remove the listing, delete its row in Supabase → Table Editor → `vendors`; its inquiries, quotes and
bookings are deleted with it.
