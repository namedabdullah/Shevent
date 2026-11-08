"""#8 Planning Assistant: POST /v1/assistant/chat.

Each turn, in order:
1. The LLM reads the chat and the server keeps the details the host actually gave (extract.py).
2. If something is still missing, a fixed question asks for it. After STUCK_AFTER host messages without a complete
   plan, or if the model's output can't be read, the host is sent to the planner form with what was understood.
3. With a complete plan the server itself calls #1 and #2 (the same code as /v1/estimate) and replies with a fixed
   sentence built from their results.
4. Optionally (llm_replies, ASSISTANT_LLM_REPLIES=1) the LLM words that reply instead, and the output checker reads
   every figure in it. Each one must appear in the facts the model was given or in the host's own messages;
   otherwise the reply is thrown away and the fixed one is sent. It's off by default: in the evaluation the 3B model's
   replies passed the figure check but still made false claims with true figures ("Rs 11.92 lakh, 60% more than
   usual" for a share below the usual price; "the lowest rates we can offer"), which no figure check can catch.
"""

import logging
import re
import time
from datetime import UTC, date, datetime, timedelta

from shevent_ml.config import CATEGORIES

from .extract import Extractor, missing
from .figures import CRORE, LAKH, figures, stated
from .llm import LLMUnavailable

log = logging.getLogger(__name__)

VERSION = "assistant-v1"
STUCK_AFTER = 4
MAX_REPLY_CHARS = 900

EVENT_LABELS = {
    "wedding_mehndi": "Mehndi / mayun / dholki",
    "wedding_baraat": "Baraat",
    "wedding_walima": "Walima",
    "engagement": "Engagement / nikah",
    "birthday": "Birthday party",
    "corporate_dinner": "Corporate dinner or gala",
    "corporate_other": "Conference / launch / office event",
    "university_gala": "University event / gala / farewell",
    "concert": "Concert / music night",
    "private_party": "Other private party",
}
CATEGORY_LABELS = {
    "venue": "Venue",
    "catering": "Catering",
    "decor": "Decor",
    "dj_sound": "DJ & Sound",
    "lighting": "Lighting",
    "photography": "Photography",
}
QUESTIONS = {
    "event_type": "what the event is (for example a mehndi, baraat, walima or birthday)",
    "guest_count": "how many guests",
    "area": "the area in Lahore",
    "event_date": "the date",
    "total_budget_pkr": "your total budget",
}
SEASONS = {
    "peak_wedding_season": "peak wedding season, when prices run higher",
    "post_eid": "the rush after Eid, when prices run higher",
    "ramadan": "Ramadan, when few events are held",
    "muharram": "Muharram, when few events are held",
    "off_peak": "the off-peak season",
}
REPLY_SYSTEM = """You are Shevent's event planning assistant in Lahore. Write a short, friendly reply to the host \
about their budget split, in plain English: two to four sentences, no lists, no markdown.

Use only the figures in FACTS, copied exactly as written there. Don't add any other number, price, percentage, \
date or vendor name, don't do any arithmetic, and don't compare amounts yourself: FACTS already says how each \
share compares with what that service usually costs. Mention the one or two biggest shares. If there is a note, \
mention it. End by suggesting they open the plan to see vendors that fit."""

URDU_SCRIPT = re.compile(r"[؀-ۿ]")
ROMAN_URDU = re.compile(
    r"\b(hai|hain|ka|ki|ke|ko|chahiye|chahye|karni|karna|krni|mein|main|liye|log|logon|mehmaan|mehman|shaadi|"
    r"shadi|kitna|kitne|taqreeban|takreeban|lagbhag|tak|aur|wala|wali)\b",
    re.I,
)


def today_in_lahore():
    return (datetime.now(UTC) + timedelta(hours=5)).date()


def detect_language(text):
    if URDU_SCRIPT.search(text):
        latin = re.sub(r"\b(rs|pkr|dha|lakh|crore)\b", "", text, flags=re.I)
        return "mixed" if re.search(r"[a-z]{3,}", latin, re.I) else "ur"
    return "roman_ur" if ROMAN_URDU.search(text) else "en"


def _trim(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def format_pkr(value):
    """Same text as packages/core formatPkrCompact: Rs 85,000 · Rs 25 lakh · Rs 1.25 crore."""
    if value >= CRORE or round(value / LAKH, 2) >= 100:
        return f"Rs {_trim(value / CRORE)} crore"
    if round(value) >= LAKH:
        return f"Rs {_trim(value / LAKH)} lakh"
    return f"Rs {round(value):,}"


def _date_text(day):
    return f"{day.strftime('%a')}, {day.day} {day.strftime('%b')} {day.year}"


def describe(plan):
    """'a mehndi / mayun / dholki for 300 guests in Gulberg on Sat, 19 Dec 2026 with a budget of Rs 25 lakh'"""
    parts = [f"a {EVENT_LABELS[plan['event_type']].lower()}" if "event_type" in plan else "an event"]
    if "guest_count" in plan:
        parts.append(f"for {plan['guest_count']} guests")
    if "area" in plan:
        parts.append(f"in {plan['area']}")
    if "event_date" in plan:
        parts.append(f"on {_date_text(date.fromisoformat(plan['event_date']))}")
    if "total_budget_pkr" in plan:
        parts.append(f"with a budget of {format_pkr(plan['total_budget_pkr'])}")
    return " ".join(parts)


def and_list(items):
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def ranked(estimate):
    items = [(c, estimate["allocation"][c]) for c in CATEGORIES if c in estimate["allocation"]]
    return sorted(items, key=lambda item: -item[1]["share"])


def compared(item):
    """How a share compares with #2's usual price range, worked out here: a 3B model gets these comparisons wrong
    (it called Rs 20 lakh "more than" a Rs 10-31 lakh range), and the checker checks figures, not claims."""
    low, high = item["range"]
    if item["pkr"] < low:
        return "less than this usually costs"
    if item["pkr"] > high:
        return "more than this usually costs"
    return "within what this usually costs"


def facts(plan, estimate):
    """What the reply may say, as lines of text. The checker allows exactly the figures in here."""
    lines = [f"Event: {describe(plan)}", "Budget split, largest first:"]
    for category, item in ranked(estimate):
        lines.append(
            f"- {CATEGORY_LABELS[category]}: {format_pkr(item['pkr'])} ({round(item['share'] * 100)}%), "
            f"{compared(item)}"
        )
    if estimate.get("season_factor") in SEASONS:
        lines.append(f"Season: {SEASONS[estimate['season_factor']]}")
    lines += [f"Note: {warning}" for warning in estimate.get("warnings", [])]
    return "\n".join(lines)


def template_reply(plan, estimate):
    """The reply from the tools' results alone: the two biggest shares, how each compares with the usual price, the
    season and #1's first warning."""
    shares = "; ".join(
        f"{CATEGORY_LABELS[c]} gets {format_pkr(i['pkr'])} ({round(i['share'] * 100)}%), {compared(i)}"
        for c, i in ranked(estimate)[:2]
    )
    parts = [f"Here is a budget split for {describe(plan)}.", f"{shares}."]
    if estimate.get("season_factor") in SEASONS:
        parts.append(f"It falls in {SEASONS[estimate['season_factor']]}.")
    if estimate.get("warnings"):
        parts.append(estimate["warnings"][0])
    parts.append("Open it as a plan to see vendors that fit.")
    return " ".join(parts)


def check_reply(reply, allowed):
    """None if the reply is fine, else why it was rejected. Every figure the reply states must be one of `allowed`
    (the figures in the facts and in the host's messages)."""
    if not reply or len(reply) > MAX_REPLY_CHARS:
        return "empty or too long"
    if re.search(r"https?://|www\.|```", reply):
        return "link or code"
    # Small models echo the prompt ("FACTS:", "Season: ...") or add a second paragraph of filler.
    if "\n\n" in reply.strip() or re.search(r"\b(FACTS|Season|Note)\s*:", reply):
        return "prompt text or extra paragraph"
    invented = sorted(value for kind, value in stated(reply) if (kind, value) not in allowed)
    return f"figures not from a tool: {invented}" if invented else None


class Assistant:
    def __init__(self, llm, services, extractor=None, llm_replies=False, today=today_in_lahore):
        self.llm, self.services = llm, services
        self.extractor = extractor or Extractor(llm)
        self.llm_replies = llm_replies
        self.today = today
        self.rejected = 0  # replies the checker threw away since startup (shown in the logs)

    @property
    def version(self):
        return f"{VERSION}/{self.llm.version}"

    def chat(self, messages):
        """One assistant turn for the whole conversation so far (the API is stateless)."""
        started = time.perf_counter()
        host = [m["content"] for m in messages if m["role"] == "user"]
        base = {"language": detect_language(host[-1] if host else ""), "model_version": self.version}
        try:
            plan, dropped = self.extractor.extract(messages, self.today())
        except (ValueError, KeyError, TypeError) as error:
            log.warning("Extraction failed, sending the host to the form: %s", error)
            return {**base, "reply": "I couldn't read that properly. The planner form will ask for your event "
                    "details instead.", "extracted": {}, "missing": list(QUESTIONS), "estimate": None,
                    "fallback_to_form": True}  # fmt: skip
        if dropped:
            log.info("Dropped values the host didn't write: %s", dropped)
        need = missing(plan)
        base.update(extracted=plan, missing=need)

        if need:
            asked = and_list([QUESTIONS[field] for field in need])
            if len(host) >= STUCK_AFTER:
                reply = (f"I still need {asked}. The planner form will ask for it, with what I understood "
                         "already filled in.")  # fmt: skip
                return {**base, "reply": reply, "estimate": None, "fallback_to_form": True}
            understood = f"Got it: {describe(plan)}. " if plan else ""
            example = "" if plan else ' For example: "Mehndi for 300 guests in Gulberg on 19 December, around 25 lakh."'
            reply = f"{understood}To work out your budget split I still need {asked}.{example}"
            return {**base, "reply": reply, "estimate": None, "fallback_to_form": False}

        estimate = self.services.estimate(plan)
        reply = self.write_reply(plan, estimate, host)
        log.info("Assistant turn in %.1f s", time.perf_counter() - started)
        return {
            **base,
            "reply": reply,
            "estimate": estimate,
            "fallback_to_form": False,
            "model_version": f"{self.version}+{estimate['model_version']}",
        }

    def write_reply(self, plan, estimate, host):
        """The LLM's reply if it passes the checker, else the fixed one."""
        if not self.llm_replies:
            return template_reply(plan, estimate)
        known = facts(plan, estimate)
        prompt = [
            {"role": "system", "content": REPLY_SYSTEM},
            {"role": "user", "content": f"FACTS:\n{known}\n\nWrite the reply."},
        ]
        try:
            reply = self.llm.chat(prompt, max_tokens=220).replace("**", "")
        except LLMUnavailable as error:
            log.warning("No reply from the model, using the fixed one: %s", error)
            return template_reply(plan, estimate)
        problem = check_reply(reply, figures(known) | figures("\n".join(host)))
        if problem:
            self.rejected += 1
            log.warning("Reply rejected (%s), using the fixed one: %r", problem, reply)
            return template_reply(plan, estimate)
        return reply
