"""#8: how well the rules read what the host is asking for (assistant/intent.py), on questions written for this.

    cd server && python -m eval.question_types

Each case is a chat's host messages, the question type the answer should take (budget_split, quote_check, vendors,
prices, advice, greeting) and the service it is about (or null). No LLM is involved: the rules alone decide which
model answers. The 30 questions were written after the rules, by the same person, and scored once.
"""

import json
import sys
from pathlib import Path

from app.assistant.intent import categories_named, detect_intent

CASES = Path(__file__).with_name("assistant_questions.jsonl")


def topic(host, cue):
    """The service the answer would be about, as the assistant picks it (the latest message first)."""
    asked = "\n".join(host[cue:]) if cue is not None else host[-1]
    named = categories_named(host[-1], venue_types=False) or categories_named(asked, venue_types=False)
    found = named or categories_named(host[-1]) or categories_named(asked)
    return found[0] if found else None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    cases = [json.loads(line) for line in CASES.read_text(encoding="utf-8").splitlines() if line.strip()]
    right_intent = right_service = 0
    for case in cases:
        intent, cue = detect_intent(case["turns"])
        service = topic(case["turns"], cue)
        ok_intent, ok_service = intent == case["intent"], service == case["service"]
        right_intent += ok_intent
        right_service += ok_service
        if not (ok_intent and ok_service):
            print(f"{case['id']}: got {intent} / {service}, expected {case['intent']} / {case['service']}")
    n = len(cases)
    print(f"Question type right: {right_intent}/{n} ({right_intent / n:.0%}); service right: {right_service}/{n} "
          f"({right_service / n:.0%})")  # fmt: skip
    return 0


if __name__ == "__main__":
    sys.exit(main())
