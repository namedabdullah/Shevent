"""#8 Planning Assistant: POST /v1/assistant/chat.

Each turn, in order:
1. The LLM reads the chat and the server keeps the details the host actually gave (extract.py).
2. Rules read what the host is asking for (intent.py): typical prices, vendor suggestions, a check on a quote,
   a budget split, or advice. Only a request to split the budget runs #1; the others use #2, #3 and #5.
3. If that answer needs a detail the host hasn't given (vendors need the area, prices the event and guest count), a
   fixed question asks for it. A budget split still hands over to the planner form after STUCK_AFTER host messages.
4. The server writes every sentence with a figure, from the models' results. The LLM adds advice (guide.py): it is
   asked for no numbers, and any sentence of its with a figure that isn't the host's own is dropped.
5. Optionally (llm_replies, ASSISTANT_LLM_REPLIES=1) the LLM words the budget-split reply too, and the output checker
   reads every figure in it. Each one must appear in the facts the model was given or in the host's own messages;
   otherwise the reply is thrown away and the fixed one is sent. It's off by default: in the evaluation the 3B
   model's replies passed the figure check but still made false claims with true figures ("Rs 11.92 lakh, 60% more
   than usual" for a share below the usual price), which no figure check can catch.
"""

import logging
import re
import time
from datetime import UTC, date, datetime, timedelta

from shevent_ml.config import CATEGORIES

from .extract import REQUIRED, Extractor, transcript
from .figures import CRORE, LAKH, figures, stated
from .guide import guidance, notes_for
from .intent import categories_named, chosen_services, detect_intent, is_thanks, quoted_amount
from .llm import LLMUnavailable

log = logging.getLogger(__name__)

VERSION = "assistant-v2"
STUCK_AFTER = 4
MAX_REPLY_CHARS = 900
SUGGESTIONS = 3
# A plan without a date is priced for one about this far ahead (the reply says the date would sharpen it).
DEFAULT_DAYS_AHEAD = 90

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
VENDOR_WORDS = {
    "venue": "venues",
    "catering": "caterers",
    "decor": "decorators",
    "dj_sound": "DJ and sound providers",
    "lighting": "lighting providers",
    "photography": "photographers",
}
QUESTIONS = {
    "event_type": "what the event is (for example a mehndi, baraat, walima or birthday)",
    "guest_count": "how many guests",
    "area": "the area in Lahore",
    "event_date": "the date",
    "total_budget_pkr": "your total budget",
    "category": "which service (venue, catering, decor, DJ & sound, lighting or photography)",
    "quote": "the price you were quoted (for example Rs 2,800 per head, or Rs 6 lakh in total)",
}
WHY = {
    "budget_split": "To work out your budget split",
    "prices": "To estimate typical prices",
    "vendors": "To suggest vendors that fit",
    "quote_check": "To check that quote",
}
NEEDS = {
    "budget_split": REQUIRED,
    "prices": ["event_type", "guest_count"],
    "vendors": ["category", "event_type", "guest_count", "area"],
    "quote_check": ["category", "quote", "event_type", "guest_count"],
}
SEASONS = {
    "peak_wedding_season": "peak wedding season, when prices run higher",
    "post_eid": "the rush after Eid, when prices run higher",
    "ramadan": "Ramadan, when few events are held",
    "muharram": "Muharram, when few events are held",
    "off_peak": "the off-peak season",
}
QUOTE_LEVELS = {
    "green": "looks fair: it's within the usual range for this event",
    "yellow": "is on the high side",
    "red": "is well above what this usually costs",
}
UNITS = {"per_head": " per head", "per_event": " in total"}
HELLO = (
    "Hello! I can help you plan your event in Lahore: typical prices for each service, vendors that fit your event, "
    "whether a quote you received is fair, or how to split your budget across the services you need. What are you "
    "planning?"
)
WELCOME = "You're welcome! Ask me anything else about your event."
OFFER = "I can also suggest vendors, check a quote you've received, or split your budget across the services you need."
REPLY_SYSTEM = """You are Shevent's event planning assistant in Lahore. Write a short, friendly reply to the host \
about their budget split, in plain English: two to four sentences, no lists, no markdown.

Use only the figures in FACTS, copied exactly as written there. Don't add any other number, price, percentage, \
date or vendor name, don't do any arithmetic, and don't compare amounts yourself: FACTS already says how each \
share compares with what that service usually costs. Mention the one or two biggest shares. If there is a note, \
mention it. End by suggesting they open the plan to see vendors that fit."""

URDU_SCRIPT = re.compile(r"[؀-ۿ]")
ROMAN_URDU = re.compile(
    r"\b(hai|hain|ka|ki|ke|ko|chahiye|chahye|karni|karna|krni|mein|main|liye|log|logon|mehmaan|mehman|shaadi|"
    r"shadi|kitna|kitne|taqreeban|takreeban|lagbhag|tak|aur|wala|wali|batao|achha|acha)\b",
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


def format_range(low, high):
    """'Rs 4.5 lakh to Rs 7.5 lakh', or one amount when both ends are the same (a vendor's single listed price)."""
    if round(low) == round(high):
        return format_pkr(low)
    return f"{format_pkr(low)} to {format_pkr(high)}"


def rounded(pkr):
    """Three significant figures, for prices in a sentence: Rs 49,797 -> Rs 49,800."""
    return float(f"{pkr:.3g}")


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
    """What the budget-split reply may say, as lines of text. The checker allows exactly the figures in here."""
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


def services_text(categories):
    return and_list([CATEGORY_LABELS[c].lower() for c in categories])


def template_reply(plan, estimate):
    """The budget-split reply from the tools' results alone: the two biggest shares, how each compares with the
    usual price, the season and #1's first warning."""
    shares = "; ".join(
        f"{CATEGORY_LABELS[c]} gets {format_pkr(i['pkr'])} ({round(i['share'] * 100)}%), {compared(i)}"
        for c, i in ranked(estimate)[:2]
    )
    chosen = [c for c in CATEGORIES if c in estimate["allocation"]]
    only = f", split between {services_text(chosen)}" if len(chosen) < len(CATEGORIES) else ""
    parts = [f"Here is a budget split for {describe(plan)}{only}.", f"{shares}."]
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


def with_defaults(plan, today):
    """The plan the price models need: a missing area is priced for Lahore as a whole, a missing date for one a few
    months ahead. The replies say so."""
    full = {**plan, "area": plan.get("area", "Other")}
    full.setdefault("event_date", (today + timedelta(days=DEFAULT_DAYS_AHEAD)).isoformat())
    return full


def caveats(plan):
    """What the price estimate assumed for details the host hasn't given."""
    missing = [word for field, word in [("area", "the area"), ("event_date", "the date")] if field not in plan]
    if not missing:
        return ""
    return f" Tell me {and_list(missing)} for a closer estimate."


def per_head(low, high, guests):
    step = 50 if high / guests < 5000 else 100
    return f"about {format_range(round(low / guests / step) * step, round(high / guests / step) * step)} per head"


class Assistant:
    def __init__(self, llm, services, extractor=None, llm_replies=False, today=today_in_lahore):
        self.llm, self.services = llm, services
        self.extractor = extractor or Extractor(llm)
        self.llm_replies = llm_replies
        self.today = today
        self.rejected = 0  # budget-split replies the checker threw away since startup (shown in the logs)
        self.last_advice = None  # (text, source) of the latest advice, for the evaluation

    @property
    def version(self):
        return f"{VERSION}/{self.llm.version}"

    def chat(self, messages):
        """One assistant turn for the whole conversation so far (the API is stateless)."""
        started = time.perf_counter()
        host = [m["content"] for m in messages if m["role"] == "user"]
        latest = host[-1] if host else ""
        intent, cue = detect_intent(host)
        base = {"language": detect_language(latest), "intent": intent, "model_version": self.version,
                "estimate": None, "recommendations": None, "fallback_to_form": False}  # fmt: skip

        if intent == "greeting" and len(host) == 1:
            return {**base, "reply": WELCOME if is_thanks(latest) else HELLO, "extracted": {}, "missing": []}
        try:
            plan, dropped = self.extractor.extract(messages, self.today())
        except (ValueError, KeyError, TypeError) as error:
            log.warning("Extraction failed, sending the host to the form: %s", error)
            return {**base, "reply": "I couldn't read that properly. The planner form will ask for your event "
                    "details instead.", "extracted": {}, "missing": list(QUESTIONS)[:5],
                    "fallback_to_form": True}  # fmt: skip
        if dropped:
            log.info("Dropped values the host didn't write: %s", dropped)

        # The message that asked the question, and anything said since, decide the services it is about.
        asked = "\n".join(host[cue:]) if cue is not None else latest
        if intent == "budget_split" and (services := chosen_services(asked)):
            plan["categories"] = services
        # topics count a venue type ("suggest a marquee") as the venue; services only count services named outright,
        # so "how much will a mehndi in a marquee cost" is about the whole event.
        named = categories_named(latest, venue_types=False) or categories_named(asked, venue_types=False)
        context = {"host": host, "latest": latest, "asked": asked, "messages": messages, "services": named,
                   "topics": named or categories_named(latest) or categories_named(asked)}  # fmt: skip
        handler = getattr(self, f"_{intent}")
        result = handler(plan, context)
        log.info("Assistant turn (%s) in %.1f s", intent, time.perf_counter() - started)
        return {**base, "extracted": plan, "missing": [], **result}

    # Each handler returns the reply and whatever else the response carries for that kind of question.

    def _greeting(self, plan, context):
        return {"reply": WELCOME if is_thanks(context["latest"]) else HELLO}

    def _ask(self, intent, need, plan, host):
        """The fixed question for details still missing. A budget split hands over to the form when stuck."""
        asked = and_list([QUESTIONS[field] for field in need])
        plan_fields = [f for f in need if f in REQUIRED]
        if intent == "budget_split" and len(host) >= STUCK_AFTER:
            reply = (f"I still need {asked}. The planner form will ask for it, with what I understood "
                     "already filled in.")  # fmt: skip
            return {"reply": reply, "missing": plan_fields, "fallback_to_form": True}
        known = {k: v for k, v in plan.items() if k in REQUIRED}
        understood = f"Got it: {describe(known)}. " if known else ""
        example = ""
        if intent == "budget_split" and not known:
            example = ' For example: "Split 25 lakh for a mehndi for 300 guests in Gulberg on 19 December."'
        return {"reply": f"{understood}{WHY[intent]} I still need {asked}.{example}", "missing": need}

    def _missing(self, intent, plan, extra=()):
        return [f for f in NEEDS[intent] if f not in plan and f not in extra]

    def _advise(self, context, plan, topic=None, label=None):
        """The LLM's checked advice for the latest message (or the hand-written notes)."""
        text, source = guidance(
            self.llm,
            context["latest"],
            "\n".join(context["host"]),
            describe(plan) if plan else "",
            topic,
            label,
            transcript(context["messages"][-6:-1], limit=5, max_chars=300),
        )
        if source == "notes":
            log.info("Advice from the hand-written notes")
        self.last_advice = (text, source)
        return text

    def _budget_split(self, plan, context):
        need = self._missing("budget_split", plan)
        if need:
            return self._ask("budget_split", need, plan, context["host"])
        estimate = self.services.estimate(plan)
        reply = self.write_reply(plan, estimate, context["host"])
        return {"reply": reply, "estimate": estimate, "model_version": f"{self.version}+{estimate['model_version']}"}

    def _prices(self, plan, context):
        need = self._missing("prices", plan)
        if need:
            return self._ask("prices", need, plan, context["host"])
        topics = context["services"] or plan.get("categories") or CATEGORIES
        ranges = self.services.price_ranges(with_defaults(plan, self.today()), topics)
        lines = []
        for category, (low, likely, high) in ranges.items():
            line = f"- {CATEGORY_LABELS[category]}: usually about {format_pkr(likely)} ({format_range(low, high)})"
            if category == "catering":
                line += f", {per_head(low, high, plan['guest_count'])}"
            lines.append(line)
        reply = (f"Typical prices for {describe(plan)}, for the whole event (AI estimates, not vendor quotes):\n"
                 + "\n".join(lines) + ("\n" + caveats(plan).strip() if caveats(plan) else ""))  # fmt: skip
        topic = topics[0] if len(topics) == 1 else None
        advice = self._advise(context, plan, topic, CATEGORY_LABELS[topic] if topic else None)
        version = f"{self.version}+{self.services.price_estimator.version}"
        return {"reply": f"{reply}\n\n{advice}", "model_version": version}

    def _vendors(self, plan, context):
        topics = context["topics"]
        need = self._missing("vendors", plan, extra=["category"] if topics else [])
        if need:
            return self._ask("vendors", need, plan, context["host"])
        category = topics[0]
        full = with_defaults(plan, self.today())
        given_budget = "total_budget_pkr" in plan
        if given_budget and self.services.allocator is not None:
            budget = self.services._category_budgets(full, plan.get("categories")).get(category)
        else:
            budget = None
        if budget is None:  # no budget given: judge price against the usual top of the range, and don't mention it
            budget = self.services.price_ranges(full, [category])[category][2]
        result = self.services.recommend(full, category, round(budget), limit=SUGGESTIONS)
        matches = result["matches"]
        if not given_budget:
            for match in matches:
                match["reasons"] = [r for r in match["reasons"] if "budget" not in r] or [
                    "Few details listed yet: ask about price, capacity and the date"
                ]
        if not matches:
            reply = f"I couldn't find {VENDOR_WORDS[category]} listed for {plan['area']} yet."
        else:
            lines = [
                f"{i}. {m['name']} ({m['base_area']}): {m['reasons'][0]}; likely "
                f"{format_range(*(rounded(p) for p in m['price_range']))}."
                for i, m in enumerate(matches, 1)
            ]
            reply = (f"Here are {VENDOR_WORDS[category]} that fit {describe(plan)}, best match first:\n"
                     + "\n".join(lines) + "\nRanked by fit; sponsored listings are never mixed in. Prices are "
                     "estimates unless the vendor lists them.")  # fmt: skip
        advice = self._advise(context, plan, category, CATEGORY_LABELS[category])
        return {
            "reply": f"{reply}\n\n{advice}",
            "recommendations": {"category": category, "matches": matches} if matches else None,
            "model_version": f"{self.version}+{result['model_version']}",
        }

    def _quote_check(self, plan, context):
        topics = context["topics"]
        quote = quoted_amount(context["latest"]) or quoted_amount(context["asked"])
        extra = (["category"] if topics else []) + (["quote"] if quote else [])
        need = self._missing("quote_check", plan, extra=extra)
        if need:
            return self._ask("quote_check", need, plan, context["host"])
        category, (amount, unit) = topics[0], quote
        full = with_defaults(plan, self.today())
        spec = {k: v for k, v in full.items() if k not in ("total_budget_pkr", "categories")}
        try:
            result = self.services.quote_check(
                {"plan": spec, "category": category, "quoted_pkr": amount, "unit": unit, "inclusions": []}
            )
        except Exception as error:  # noqa: BLE001 - no range for this service: say so instead of failing the chat
            log.warning("Quote check failed: %s", error)
            return {"reply": f"I can't price {CATEGORY_LABELS[category].lower()} for this event yet, so I can't "
                    "check that quote. The planner's quote check needs a full plan."}  # fmt: skip
        low, high = result["typical_range"]
        quoted = f"{format_pkr(amount)}{UNITS[unit]} for {CATEGORY_LABELS[category].lower()}"
        usual = f"{format_range(low, high)}{UNITS[unit]}"
        if result["level"] == "green" and result["percent_below_low"] is not None:
            verdict = f"{quoted} is below the usual range for this event ({usual}): check what it leaves out."
        elif result["level"] == "green":
            verdict = f"{quoted} {QUOTE_LEVELS['green']} ({usual})."
        else:
            verdict = (f"{quoted} {QUOTE_LEVELS[result['level']]}: about {result['percent_above_high']}% above the "
                       f"usual top end ({usual}).")  # fmt: skip
        if result["level"] == "red":
            verdict += " Worth asking what's included before you agree."
        if result["ask_about"]:
            verdict += f" Worth asking whether it includes {and_list([a.lower() for a in result['ask_about'][:4]])}."
        verdict += caveats(plan)
        # Hand-written tips rather than the model's: on quotes the 3B model drifted to other services.
        tips = "\n".join(f"- {line}" for line in [*notes_for("quote"), *notes_for(category)[:1]])
        return {"reply": f"{verdict}\n\n{tips}", "model_version": f"{self.version}+{result['model_version']}"}

    def _advice(self, plan, context):
        topics = context["topics"]
        described = len([f for f in REQUIRED if f in plan]) >= 2 and not context["services"]
        if not described:
            topic = topics[0] if topics else None
            return {"reply": self._advise(context, plan, topic, CATEGORY_LABELS[topic] if topic else None)}
        # The host described their event without asking anything in particular: how to approach it, what the
        # biggest services usually cost, and what else the assistant can do.
        parts = [f"Here's how I'd approach {describe(plan)}."]
        parts.append(self._advise(context, plan, None, "planning this event"))
        version = self.version
        if "event_type" in plan and "guest_count" in plan:
            main = [c for c in ("venue", "catering") if c in (plan.get("categories") or CATEGORIES)] or ["catering"]
            ranges = self.services.price_ranges(with_defaults(plan, self.today()), main)
            usual = "; ".join(
                f"{CATEGORY_LABELS[c].lower()} usually about {format_pkr(mid)} ({format_range(lo, hi)})"
                for c, (lo, mid, hi) in ranges.items()
            )
            parts.append(f"What the biggest services cost for this event (AI estimates): {usual}." + caveats(plan))
            version += f"+{self.services.price_estimator.version}"
        parts.append(OFFER)
        return {"reply": "\n\n".join(parts), "model_version": version}

    def write_reply(self, plan, estimate, host):
        """The LLM's budget-split reply if it passes the checker, else the fixed one."""
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
