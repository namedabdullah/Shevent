"""#8: does the assistant keep to event planning? The topic check (assistant/scope.py) on messages written for this.

    cd server && python -m eval.assistant_scope                         # dev set, rules only (no model)
    cd server && python -m eval.assistant_scope --model                 # rules, then the local model for the rest
    cd server && python -m eval.assistant_scope --set blind2 --model    # the current blind set

Three sets, each line {"id", "turns": host messages, "in_scope", "kind"}; only the last message is judged:
- dev, assistant_scope.jsonl: 120 messages written, and labelled, before the rules, by the person who then wrote them,
  and used while writing them. Expect it to flatter the rules.
- blind1, assistant_scope_blind1.jsonl: 60 messages written by a separate writer from the scope definition only,
  without seeing the rules or the other sets. Scored once on 18 Nov (rules then model: 19/30 off-topic refused, 2/30
  on-topic wrongly refused); its failures then shaped the rules, so it is development data now.
- blind2, assistant_scope_blind2.jsonl: 60 more, written the same way after that change. This is the honest number.

Each message goes through what chat.py does: a greeting or a question about the assistant gets the hello, anything else
the topic check. Reported: off-topic messages refused, on-topic messages wrongly refused, and how each was decided.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from app.assistant.intent import detect_intent
from app.assistant.scope import in_scope, rules

HERE = Path(__file__).parent
SETS = {
    name: HERE / f"assistant_scope{suffix}.jsonl"
    for name, suffix in (("dev", ""), ("blind1", "_blind1"), ("blind2", "_blind2"))
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", choices=SETS, default="dev", help="which messages to score")
    parser.add_argument("--model", action="store_true", help="ask the local model when the rules can't tell")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    path = SETS[args.set]
    cases = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    llm = None
    if args.model:
        from app.assistant.llm import OllamaClient

        llm = OllamaClient()
    how, wrong, unsure = Counter(), [], 0
    refused = {True: 0, False: 0}
    for case in cases:
        if detect_intent(case["turns"])[0] == "greeting":
            on_topic, rule = True, "greeting"  # as in chat.py: a greeting or "what can you do" gets the hello first
        elif llm is None:
            decision, rule = rules(case["turns"])
            unsure += decision is None
            on_topic = decision != "out"  # unsure counts as answered, as without the model
        else:
            on_topic, rule = in_scope(llm, case["turns"])
        how[rule] += 1
        refused[case["in_scope"]] += not on_topic
        if on_topic != case["in_scope"]:
            wrong.append(f"{case['id']} ({case['kind']}, {rule}): expected {'in' if case['in_scope'] else 'out'}: "
                         f"{case['turns'][-1]}")  # fmt: skip
    out_total = sum(not c["in_scope"] for c in cases)
    in_total = len(cases) - out_total
    for line in wrong:
        print(line)
    print(f"\n{path.name}, {'rules then model' if llm else 'rules only'}: {len(cases)} messages")
    print(f"Off-topic refused: {refused[False]}/{out_total} ({refused[False] / out_total:.0%})")
    print(f"On-topic wrongly refused: {refused[True]}/{in_total} ({refused[True] / in_total:.0%})")
    print("Decided by: " + ", ".join(f"{rule} {n}" for rule, n in how.most_common()))
    if llm is None:
        print(f"Left to the model: {unsure}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
