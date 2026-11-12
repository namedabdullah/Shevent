"""#8 evaluation: the assistant on a fixed set of chats, scored by script (IMPLEMENTATION_PLAN §12).

    cd server && python -m eval.assistant_eval                 # all of eval/assistant_cases.jsonl
    cd server && python -m eval.assistant_eval --limit 5 --model qwen2.5:7b-instruct
    cd server && python -m eval.assistant_eval --cases holdout   # 20 chats written after the rules were tuned

Needs Ollama running with the model pulled, and the #1/#2 artifacts in ml/artifacts. Each case is a host's chat,
sent one message at a time with the assistant's own replies in between, as in the app. The last turn is scored:

- extraction: each field (event type, guests, area, date, budget, venue type) right, including left out when the
  host didn't give it; the whole plan right. "Model alone" scores the LLM's raw reading before the server's checks.
- invented values: a value in the plan the host never gave. Must be 0.
- estimate: once a complete plan is read, the host asks "Split my budget across the services." and must get #1/#2's
  split (only a request for a split runs #1).
- replies: the LLM's own reply kept, or replaced by the fixed one because the checker found a figure no tool gave.
  Every split reply is checked again here; none may contain a figure outside the tools' output and the host's words.
- advice: the LLM's advice in each final reply, checked again: no figure the host didn't write. Also how often it
  came from the model rather than the hand-written notes.
- seconds per turn.

The keyword and grounding rules were tuned on assistant_cases.jsonl, so its score is optimistic; the holdout set
was written afterwards and its extraction scored once, without changes. Writes testing/reports/assistant-eval
[-holdout].md and .json (both git-ignored, like all Markdown in this repo).
"""

# shevent_ml first: it loads the right C++ runtime before pandas or LightGBM (see shevent_ml/__init__.py).
import shevent_ml  # noqa: F401, I001

import argparse
import json
import statistics
import sys
import time
from datetime import date
from pathlib import Path

from app.assistant import Assistant, OllamaClient
from app.assistant.chat import check_reply, facts
from app.assistant.extract import REQUIRED, Extractor, _date
from app.assistant.figures import figures, parse_budget, stated
from app.services import DEFAULT_LLM, load_services
from shevent_ml.config import REPO_ROOT

CASES = {"main": Path(__file__).with_name("assistant_cases.jsonl"),
         "holdout": Path(__file__).with_name("assistant_holdout.jsonl")}  # fmt: skip
REPORT = REPO_ROOT / "testing" / "reports" / "assistant-eval"
TODAY = date(2026, 11, 8)  # the cases' expected dates are worked out from this day
FIELDS = [*REQUIRED, "venue_type"]
ASK_FOR_SPLIT = "Split my budget across the services."


class Recording(Extractor):
    """Keeps the model's raw reading of the last turn, to score the model alone."""

    def raw(self, messages, today):
        self.last = super().raw(messages, today)
        return self.last


def unchecked(raw, today):
    """The raw reading as a plan, without the server's grounding checks."""
    plan = {k: raw.get(k) for k in ("event_type", "guest_count", "area", "venue_type") if raw.get(k) is not None}
    if when := _date(raw, today):
        plan["event_date"] = when.isoformat()
    if raw.get("budget_text") and (budget := parse_budget(raw["budget_text"])):
        plan["total_budget_pkr"] = budget
    return plan


def score(plan, expected):
    right = {field: plan.get(field) == expected.get(field) for field in FIELDS}
    invented = [field for field in FIELDS if field in plan and field not in expected]
    return right, invented


def run_case(assistant, case):
    messages, seconds = [], []
    for turn in case["turns"]:
        messages.append({"role": "user", "content": turn})
        assistant.last_advice = None
        started = time.perf_counter()
        response = assistant.chat(messages)
        seconds.append(time.perf_counter() - started)
        messages.append({"role": "assistant", "content": response["reply"]})
    host = "\n".join(case["turns"])
    plan = response["extracted"]
    right, invented = score(plan, case["expected"])
    raw_right, raw_invented = score(unchecked(assistant.extractor.last, TODAY), case["expected"])
    complete = all(field in case["expected"] for field in REQUIRED)
    result = {
        "id": case["id"],
        "group": case["group"],
        "plan": plan,
        "expected": case["expected"],
        "right": right,
        "invented": invented,
        "raw_right": raw_right,
        "raw_invented": raw_invented,
        "complete": complete,
        "intent": response["intent"],
        "fallback_to_form": response["fallback_to_form"],
        "reply": response["reply"],
        "seconds": seconds,
    }
    if assistant.last_advice is not None:
        text, source = assistant.last_advice
        result["advice_from_model"] = source == "llm"
        result["advice_invented"] = sorted(v for k, v in stated(text) if (k, v) not in figures(host))
    if complete:
        result["estimated"] = False
    if complete and all(field in plan for field in REQUIRED):
        started = time.perf_counter()
        split = assistant.chat([*messages, {"role": "user", "content": ASK_FOR_SPLIT}])
        result["split_seconds"] = time.perf_counter() - started
        result["estimated"] = split.get("estimate") is not None
        if split.get("estimate"):
            allowed = figures(facts(split["extracted"], split["estimate"])) | figures(host)
            result["reply_problem"] = check_reply(split["reply"], allowed)
            if assistant.llm_replies:
                result["llm_reply_kept"] = not split["reply"].startswith("Here is a budget split for")
    return result


def summarize(results):
    def share(values):
        values = list(values)
        return round(sum(values) / len(values), 3) if values else None

    turns = [s for r in results for s in r["seconds"]]
    groups = sorted({r["group"] for r in results})
    with_estimate = [r for r in results if "reply_problem" in r]
    with_advice = [r for r in results if "advice_invented" in r]
    return {
        "cases": len(results),
        "field_accuracy": {f: share(r["right"][f] for r in results) for f in FIELDS},
        "plan_accuracy": share(all(r["right"].values()) for r in results),
        "plan_accuracy_model_alone": share(all(r["raw_right"].values()) for r in results),
        "field_accuracy_model_alone": share(v for r in results for v in r["raw_right"].values()),
        "invented_values": sum(len(r["invented"]) for r in results),
        "invented_values_model_alone": sum(len(r["raw_invented"]) for r in results),
        "estimate_when_asked": share(r["estimated"] for r in results if r["complete"]),
        "final_intents": {i: sum(r["intent"] == i for r in results) for i in sorted({r["intent"] for r in results})},
        "advice_replies": len(with_advice),
        "advice_from_model": share(r["advice_from_model"] for r in with_advice),
        "advice_with_invented_figures": sum(bool(r["advice_invented"]) for r in with_advice),
        "llm_replies_kept": share(r["llm_reply_kept"] for r in with_estimate if "llm_reply_kept" in r),
        "replies_with_invented_figures": sum(r["reply_problem"] is not None for r in with_estimate),
        "fallback_to_form": sum(r["fallback_to_form"] for r in results),
        "seconds_per_turn": {
            "median": round(statistics.median(turns), 2),
            "p90": round(sorted(turns)[int(0.9 * (len(turns) - 1))], 2),
            "max": round(max(turns), 2),
        },
        "plan_accuracy_by_group": {
            g: share(all(r["right"].values()) for r in results if r["group"] == g) for g in groups
        },
    }


def markdown(summary, results, model, cases_file):
    pct = lambda v: "n/a" if v is None else f"{v:.0%}"  # noqa: E731
    lines = [
        "# #8 Planning Assistant evaluation",
        "",
        f"Model `{model}` on Ollama, {summary['cases']} chats from `server/eval/{cases_file}` "
        f"(dates relative to {TODAY:%d %b %Y}). Written by `python -m eval.assistant_eval`.",
        "",
        "| Measure | Result |",
        "|---|---|",
        f"| Whole plan right (assistant) | {pct(summary['plan_accuracy'])} |",
        f"| Whole plan right (model alone, before the server's checks) | {pct(summary['plan_accuracy_model_alone'])} |",
        f"| Values the host never gave (assistant) | {summary['invented_values']} |",
        f"| Values the host never gave (model alone) | {summary['invented_values_model_alone']} |",
        f"| Split produced when asked for one (plan complete) | {pct(summary['estimate_when_asked'])} |",
        f"| Final replies by question type | {summary['final_intents']} |",
        f"| Advice written by the model, of {summary['advice_replies']} (the rest: hand-written notes) | "
        f"{pct(summary['advice_from_model'])} |",
        f"| Advice with a figure the host didn't write | {summary['advice_with_invented_figures']} |",
        f"| LLM replies kept by the output checker | {pct(summary['llm_replies_kept'])} |",
        f"| Final replies with a figure no tool gave | {summary['replies_with_invented_figures']} |",
        f"| Sent to the planner form | {summary['fallback_to_form']} |",
        f"| Seconds per turn (median / p90 / max) | {summary['seconds_per_turn']['median']} / "
        f"{summary['seconds_per_turn']['p90']} / {summary['seconds_per_turn']['max']} |",
        "",
        "Field accuracy: "
        + ", ".join(f"{field} {pct(value)}" for field, value in summary["field_accuracy"].items())
        + ".",
        "",
        "Whole plan right by group: "
        + ", ".join(f"{group} {pct(value)}" for group, value in summary["plan_accuracy_by_group"].items())
        + ".",
        "",
        "## Misses",
        "",
        "| Case | Field | Expected | Got |",
        "|---|---|---|---|",
    ]
    for r in results:
        for field in FIELDS:
            if not r["right"][field]:
                lines.append(f"| {r['id']} | {field} | {r['expected'].get(field, '—')} | {r['plan'].get(field, '—')} |")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=DEFAULT_LLM)
    parser.add_argument("--url", default="http://127.0.0.1:11434")
    parser.add_argument("--cases", choices=list(CASES), default="main")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--llm-replies", action="store_true", help="the model words the replies (off by default)")
    parser.add_argument("--no-report", action="store_true", help="print only, don't write testing/reports")
    args = parser.parse_args()

    services = load_services({"OLLAMA_MODEL": ""})
    llm = OllamaClient(args.url, args.model, timeout=180)
    assistant = Assistant(llm, services, extractor=Recording(llm), llm_replies=args.llm_replies, today=lambda: TODAY)
    path = CASES[args.cases]
    cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = []
    for case in cases[: args.limit]:
        result = run_case(assistant, case)
        misses = [f for f in FIELDS if not result["right"][f]]
        outcome = f"missed {', '.join(misses)}" if misses else "ok"
        print(f"{case['id']:<12} {sum(result['seconds']):5.1f}s  {outcome}")
        results.append(result)
    summary = summarize(results)
    print(json.dumps(summary, indent=2))
    if not args.no_report:
        report = REPORT.with_name(REPORT.name + ("" if args.cases == "main" else f"-{args.cases}"))
        report.parent.mkdir(parents=True, exist_ok=True)
        report.with_suffix(".md").write_text(markdown(summary, results, args.model, path.name), encoding="utf-8")
        report.with_suffix(".json").write_text(
            json.dumps({"model": args.model, "summary": summary, "results": results}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"Report: {report.with_suffix('.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
