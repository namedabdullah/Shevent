# Model Card: #8 AI Planning Assistant

| | |
|---|---|
| Version | `assistant-v1/qwen2.5:3b-instruct` (plus #1/#2 versions once it has estimated) |
| Code | `server/app/assistant/` (`extract.py`, `figures.py`, `chat.py`, `llm.py`) |
| Served by | `POST /v1/assistant/chat`; the web app's `/assistant` page |
| Owner | ML lead |

## What it does

Lets a host describe an event in their own words, in English, Roman Urdu, Urdu or a mix, and get the same budget split
as the planner form. It asks for what is missing and hands over to the form when it can't follow.

## Inputs and outputs

- **In:** the conversation so far (up to 40 messages; the API is stateless).
- **Out:** the reply, the host's language, the plan understood so far, the details still missing, #1/#2's estimate once
  the plan is complete, and whether to send the host to the planner form.

## Method

| Step | Who does it |
|---|---|
| Read the chat into a strict JSON schema (event type, guests, area, venue, date and budget as written) | LLM, via Ollama structured output, temperature 0, fixed seed |
| Keep only values the host actually wrote: guest count, budget and date must appear in their messages; area, event and venue type must be named | Server |
| Ask for what is missing; after 4 host messages without a complete plan, or unreadable model output, hand over to the form with what was understood | Server |
| Run #1 and #2 (the `/v1/estimate` code) | Server |
| Write the reply from the results: biggest shares, how each compares with #2's usual range, season, #1's first warning | Server (fixed sentence) |

**LLM-written replies** are behind `ASSISTANT_LLM_REPLIES=1` and off by default. When on, an output checker rejects any
reply containing a figure (lakh, crore, k, %, Urdu digits) not in the tool results or the host's messages, any link,
code or echoed prompt text, and the fixed reply is sent instead.

**Base model:** Qwen2.5 3B Instruct, Q4_K_M GGUF (1.9 GB), run locally by Ollama on the laptop GPU and kept loaded for
30 minutes. The 7B didn't fit next to the rest of the stack on the 16 GB dev laptop.

## Evaluation

`server/eval/`: 51 tuning chats and 20 holdout chats written after tuning, scored by script on the last turn.

| Measure | Tuning | Holdout |
|---|---|---|
| Whole plan right | 100% (model alone 82%) | 95% (model alone 80%) |
| Values the host never gave | 0 (model alone 14) | 0 (model alone 5) |
| Estimate when the plan was complete | 100% | 100% |
| Replies with a figure no tool gave | 0 | 0 |
| Seconds per turn | 1.7 median, 3.1 max | 1.8 median, 2.4 max |

With LLM-written replies, the checker kept 92-97% of them, but manual reading found false claims made with true
figures (a share below the usual range called "60% more than usual"). That is why the server writes the replies.

**Re-run on 11 Nov (final models):** the same results, after one fix. On the first re-run one tuning chat
("Concert ... with Rs 1.5 crore") lost its budget: the model returned "Rs 1,500,000", converting the amount and getting
it wrong by ten. The server rightly refused a figure the host never wrote, but then asked for a budget the host had
given. It now takes the host's own amount in that case (one with a unit, or after Rs / PKR / budget; never a per-head
price), and only when the model's figure is missing or refused. The holdout was scored again after this change:
95%, the same one miss. GPU inference isn't perfectly repeatable even at temperature 0, so a borderline chat can flip
between runs.

## Limitations

- The 3B model misses some phrasings ("90 mehmaanon ke sath" in the holdout); the host is then asked again.
- Event and venue types depend on keyword lists, so unlisted words aren't understood.
- Needs Ollama reachable from the model server. When it isn't, the endpoint answers 503 and the web app offers the
  form.
- A cold model load took 3 minutes once on a memory-starved laptop; the server now loads it at startup.
- Replies are English only (the app is English-only), whatever language the host writes in.

## Licences

| Component | Licence |
|---|---|
| **Qwen2.5-3B-Instruct** | **Qwen Research License**: research and non-commercial use only. Fine for the capstone; for commercial use switch to Qwen2.5 1.5B or 7B (Apache-2.0) or get a commercial licence from Alibaba Cloud |
| Ollama | MIT |
| FastAPI, httpx | MIT / BSD-3-Clause |
| Evaluation chats | Written by this project; no personal names |

## Reproduce

```
ollama pull qwen2.5:3b-instruct
cd server && python -m eval.assistant_eval                 # tuning set
cd server && python -m eval.assistant_eval --cases holdout
cd server && python -m eval.assistant_eval --llm-replies   # model-written replies with the checker
```
