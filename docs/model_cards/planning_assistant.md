# Model Card: #8 AI Planning Assistant

| | |
|---|---|
| Version | `assistant-v2/qwen2.5:3b-instruct` (plus the versions of the models an answer used) |
| Code | `server/app/assistant/` (`intent.py`, `extract.py`, `guide.py`, `figures.py`, `chat.py`, `llm.py`) |
| Served by | `POST /v1/assistant/chat`; the web app's `/assistant` page |
| Owner | ML lead |

## What it does

Answers a host's questions about their event in their own words, in English, Roman Urdu, Urdu or a mix:

| The host asks | The answer comes from |
|---|---|
| What a service, or the whole event, usually costs | #2's ranges, with a per-head figure for catering |
| For vendors ("koi achha caterer batao") | #3's top three matches, never sponsored listings, shown as cards |
| Whether a price they were quoted is fair | #5's check against the usual range, and what to ask about |
| How to split the budget | #1 and #2, over all services or only the ones named ("no DJ") |
| How to plan, what to ask a vendor, which venue suits winter | The LLM's advice, figure-free, from hand-written notes |
| Describes the event without a question | Advice on approaching it, typical venue and catering costs, and what else it can do |

Until 12 Nov (v1) every complete plan was answered with the budget split. The team found that wrong: the split is a
separate feature, and the assistant should answer what was asked. Only a request to split the budget runs #1 now.

## Inputs and outputs

- **In:** the conversation so far (up to 40 messages; the API is stateless).
- **Out:** the reply, the host's language, the question type (`intent`), the plan understood so far, the details this
  answer still needs, #1/#2's estimate (budget questions only), #3's matches (vendor questions only), and whether to
  send the host to the planner form.

## Method

| Step | Who does it |
|---|---|
| Read the chat into a strict JSON schema (event type, guests, area, venue, date and budget as written) | LLM, via Ollama structured output, temperature 0, fixed seed |
| Keep only values the host actually wrote: guest count, budget and date must appear in their messages; area, event and venue type must be named | Server |
| Decide the question type and the service it's about from cue words in three languages; a message without a cue continues the question before it ("300 guests, DHA" answers "suggest a caterer") | Server rules (`intent.py`) |
| Ask only for what that answer needs: vendors need the service, event, guests and area; prices the event and guests; a split all five plan details. A split still hands over to the form after 4 host messages without them | Server |
| Run the model the question needs (#1, #2, #3 or #5) and write every sentence with a figure from its results | Server |
| Add advice: 2-4 sentences or points. Asked for no numbers; any sentence with a figure the host didn't write, a link or prompt text is dropped; if nothing is left, the hand-written notes are used | LLM, checked by the server (`guide.py`) |

The question type is read by rules, not the LLM, because it decides which model answers: a 3B model's guess could
send a price question to the budget splitter. Quote checks use the hand-written tips rather than the LLM's: on quotes
the model drifted to other services. When the model re-reads the chat, the assistant's own earlier replies are cut to
their first line; long advice in the transcript made it lose details the host had given.

**LLM-written split replies** are behind `ASSISTANT_LLM_REPLIES=1` and off by default. When on, an output checker
rejects any reply containing a figure (lakh, crore, k, %, Urdu digits) not in the tool results or the host's messages,
any link, code or echoed prompt text, and the fixed reply is sent instead.

**Base model:** Qwen2.5 3B Instruct, Q4_K_M GGUF (1.9 GB), run locally by Ollama on the laptop GPU and kept loaded for
30 minutes. The 7B didn't fit next to the rest of the stack on the 16 GB dev laptop.

## Evaluation

`server/eval/`: 51 tuning chats and 20 holdout chats, scored by script on the last turn. A complete plan is then
followed by "Split my budget across the services." to check the split. Re-run on 12 Nov for v2.

| Measure | Tuning | Holdout |
|---|---|---|
| Whole plan right | 100% (model alone 82%) | 95% (model alone 80%) |
| Values the host never gave | 0 (model alone 17) | 0 (model alone 5) |
| Split produced when asked for one | 100% | 100% |
| Split replies with a figure no tool gave | 0 | 0 |
| Advice written by the model (rest: notes) | 49 of 49 | 20 of 20 |
| Advice with a figure the host didn't write | 0 | 0 |
| Seconds per turn, median / max | 5.3 / 8.2 | 4.9 / 6.8 |

- **Question types** (`python -m eval.question_types`): 30 questions written for this after the rules, in all three
  languages, scored once: question type right for 29 (97%), service right for 28 (93%). The misses: "thank you so
  much" read as a question rather than thanks; "a farmhouse wedding" and "a marquee or a hotel" read as about the
  venue rather than the whole event.
- **Holdout scored twice for v2.** On the first v2 run one chat ("music night at a farmhouse in DHA for 250 people")
  got no split when asked: the model, re-reading a transcript with the assistant's long advice in it, lost the guests
  and date. Cutting earlier replies to their first line fixed it; both sets were then run again (results above). The
  one holdout miss is unchanged from v1: "90 mehmaanon ke sath" (guests not read, so they're asked for).
- **Turns are slower than v1** (about 5 s against 2 s): most answers now make a second model call to write advice.
- **Not measured:** whether the advice is good. About 20 replies were read by hand during development; it is
  limited by a 3B model (it once called a marquee better for a winter walima, so a note on heating was added).

## Limitations

- The 3B model misses some phrasings ("90 mehmaanon ke sath" in the holdout); the host is then asked again.
- Question types, services, event and venue types depend on word lists, so unlisted words aren't understood.
- The advice is general guidance from a small model, not checked facts, and is in English only (the app is
  English-only), whatever language the host writes in.
- A price question without an area or date is priced for Lahore as a whole, a few months ahead, and says so.
- Needs Ollama reachable from the model server. When it isn't, the endpoint answers 503 and the web app offers the
  form. A cold model load took 3 minutes once on a memory-starved laptop; the server now loads it at startup.

## Licences

| Component | Licence |
|---|---|
| **Qwen2.5-3B-Instruct** | **Qwen Research License**: research and non-commercial use only. Fine for the capstone; for commercial use switch to Qwen2.5 1.5B or 7B (Apache-2.0) or get a commercial licence from Alibaba Cloud |
| Ollama | MIT |
| FastAPI, httpx | MIT / BSD-3-Clause |
| Evaluation chats, questions and planning notes | Written by this project; no personal names |

## Reproduce

```
ollama pull qwen2.5:3b-instruct
cd server && python -m eval.assistant_eval                 # tuning set
cd server && python -m eval.assistant_eval --cases holdout
cd server && python -m eval.question_types                 # question types, no LLM
cd server && python -m eval.assistant_eval --llm-replies   # model-written split replies with the checker
```
