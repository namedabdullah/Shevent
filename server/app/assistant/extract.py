"""#8 step 1: the LLM reads the chat and fills in the event details; the server keeps only what the host wrote.

The model's output is constrained to a JSON schema (Ollama structured outputs), so it can't wander off into prose.
It copies the date and budget as the host wrote them, and the server parses those itself: a 3B model is good at
spotting "25 lakh" in Roman Urdu but not at multiplying it out. Every value is then checked against the host's own
messages, so a guessed guest count, area, date or budget is dropped and asked for instead.
"""

import re
from datetime import date, timedelta

from shevent_ml.data.load import load_reference
from shevent_ml.models.price_features import AREAS, CATEGORICAL, EVENT_TYPES

from .figures import FIGURE, figures, normalize, parse_budget, parse_date

REQUIRED = ["event_type", "guest_count", "area", "event_date", "total_budget_pkr"]
# What marks a bare number as money, and a price as per head (see _stated_budget).
MONEY_CUE = re.compile(r"\b(?:rs\.?|pkr|rupees?|budget(?: is| of)?)\s*$", re.I)
PER_HEAD = re.compile(r"\s*(?:per|/|a|fi)\s*(?:head|person|guest|plate|banda)\b|\s*each\b", re.I)
PLACES = [a for a in AREAS if a != "Other"]
VENUE_TYPES = [v for v in CATEGORICAL["venue_type"] if v != "other"]
MAX_DAYS_AHEAD = 3 * 365
# Words a host uses for each type, as in packages/core/fixtures/assistant.ts. A type the model gives counts only if
# one of its words is in the host's messages; small models otherwise copy the type from the prompt's example.
# Most specific first, so "corporate dinner" is found before "corporate".
EVENT_WORDS = {
    "wedding_mehndi": r"\b(mehndi|mehendi|mehandi|mayun|mayoun|maiyun|dholki)\b|مہندی|مایوں|ڈھولکی",
    "wedding_baraat": r"\b(baraat|barat)\b|بارات|برات",
    "wedding_walima": r"\b(walima|valima|waleema)\b|ولیمہ|ولیمے",
    "engagement": r"\b(engagement|mangni|nikah|nikkah|nikaah)\b|منگنی|نکاح",
    "birthday": r"\b(birthday|b-day|bday|salgirah|saalgirah|salgira)\b|سالگرہ",
    "corporate_dinner": r"\b(corporate|company|annual|office)\s+(dinner|gala)\b|\bgala dinner\b",
    "university_gala": r"\b(university|uni|college|farewell|convocation)\b",
    "concert": r"\b(concert|music night|musical night|qawwali)\b|قوالی",
    "corporate_other": r"\b(conference|seminar|product launch|launch event|launch|corporate|office event)\b",
    "private_party": r"\b(party|dawat|get-together|get together)\b|دعوت|پارٹی",
}
VENUE_WORDS = {
    "marquee": r"\b(marquee|marquees|marqee)\b|مارکی",
    "banquet": r"\b(banquet|hall|shadi hall|wedding hall)\b|ہال",
    "farmhouse": r"\b(farmhouse|farm house)\b|فارم ہاؤس",
    "rooftop": r"\b(rooftop|roof top)\b",
    "lawn": r"\blawn\b|\bgarden\b(?!\s*town)|لان",
    "hotel": r"\bhotel\b|ہوٹل",
}
URDU_AREAS = {
    "گلبرگ": "Gulberg", "ڈیفنس": "DHA", "ڈی ایچ اے": "DHA", "جوہر ٹاؤن": "Johar Town", "کینٹ": "Cantt",
    "ماڈل ٹاؤن": "Model Town", "رائیونڈ": "Raiwind Road", "بحریہ ٹاؤن": "Bahria Town", "واپڈا ٹاؤن": "Wapda Town",
    "گارڈن ٹاؤن": "Garden Town", "فیصل ٹاؤن": "Faisal Town", "اقبال ٹاؤن": "Allama Iqbal Town",
    "ٹاؤن شپ": "Township", "لیک سٹی": "Lake City", "شادمان": "Shadman",
}  # fmt: skip


def _nullable(values):
    return {"type": ["string", "null"], "enum": [*values, None]}


SCHEMA = {
    "type": "object",
    "properties": {
        "event_type": _nullable(EVENT_TYPES),
        "guest_count": {"type": ["integer", "null"]},
        "area": _nullable(PLACES),
        "venue_type": _nullable(VENUE_TYPES),
        "date_text": {"type": ["string", "null"]},
        "event_date": {"type": ["string", "null"]},
        "budget_text": {"type": ["string", "null"]},
    },
    "required": ["event_type", "guest_count", "area", "venue_type", "date_text", "event_date", "budget_text"],
}

SYSTEM = """You read a chat between a host planning an event in Lahore, Pakistan and Shevent's assistant, and \
write down the host's event details as JSON. The host may write English, Urdu or Roman Urdu.

Rules:
- Use only what the host wrote. If the host didn't say something, use null. Never guess.
- If the host changed a detail later in the chat, use the latest one.

Fields:
- event_type: wedding_mehndi (mehndi, mayun, dholki), wedding_baraat (baraat), wedding_walima (walima), \
engagement (engagement, mangni, nikah), birthday (birthday, salgirah), corporate_dinner (company or annual \
dinner, gala dinner), corporate_other (conference, seminar, product launch, office event), university_gala \
(university or college event, farewell, convocation), concert (concert, qawwali, music night), private_party \
(any other party, dawat, get-together).
- guest_count: the number of guests, as a number.
- area: the part of Lahore, one of: {areas}. "Defence" is DHA, "Iqbal Town" is Allama Iqbal Town.
- venue_type: marquee, banquet (a hall), farmhouse, rooftop, lawn (a garden), hotel; null if not said.
- date_text: the event date exactly as the host wrote it. event_date: that date as YYYY-MM-DD; a date written \
without a year is the next one after today.
- budget_text: the total budget exactly as the host wrote it, for example "25 lakh" or "Rs 2,500,000".

Today is {today}."""

EXAMPLES = [
    (
        "Host: Mehndi for 300 guests in Gulberg on 19 December, around 25 lakh",
        '{"event_type": "wedding_mehndi", "guest_count": 300, "area": "Gulberg", "venue_type": null, '
        '"date_text": "19 December", "event_date": "{next_19_december}", "budget_text": "25 lakh"}',
    ),
    (
        "Host: walima karni hai, marquee chahiye\nAssistant: How many guests, which area, what date and what "
        "budget?\nHost: 500 log, Defence",
        '{"event_type": "wedding_walima", "guest_count": 500, "area": "DHA", "venue_type": "marquee", '
        '"date_text": null, "event_date": null, "budget_text": null}',
    ),
]


ASSISTANT_CHARS = 160


def transcript(messages, limit=12, max_chars=800, assistant_chars=ASSISTANT_CHARS):
    """The latest messages as one block of text, so the model reads the chat instead of joining it. The assistant's
    own replies are cut to their first line: they hold no detail the host didn't write, and long advice or price
    lists made the 3B model lose details the host had given (holdout-en-06, 12 Nov)."""
    who = {"user": "Host", "assistant": "Assistant"}

    def text(m):
        if m["role"] == "assistant":
            return m["content"].split("\n")[0][:assistant_chars]
        return m["content"][:max_chars]

    return "\n".join(f"{who[m['role']]}: {text(m)}" for m in messages[-limit:])


def _mentioned(text, aliases):
    """Areas named in the text, by where they appear (last one last)."""
    lower = normalize(text)
    found = []
    for alias, area in aliases.items():
        if area != "Other":
            found += [(m.start(), area) for m in re.finditer(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", lower)]
    found += [(lower.find(name), area) for name, area in URDU_AREAS.items() if name in lower]
    return [area for _, area in sorted(found)]


class Extractor:
    def __init__(self, llm, aliases=None):
        self.llm = llm
        self.aliases = aliases if aliases is not None else load_reference()["area_aliases"]

    def raw(self, messages, today):
        """The model's reading of the chat. One retry if the output doesn't parse."""
        system = SYSTEM.format(areas=", ".join(PLACES), today=today.strftime("%A %d %B %Y"))
        prompt = [{"role": "system", "content": system}]
        example_date = parse_date("19 December", today).isoformat()
        for chat, answer in EXAMPLES:
            answer = answer.replace("{next_19_december}", example_date)
            prompt += [{"role": "user", "content": chat}, {"role": "assistant", "content": answer}]
        prompt.append({"role": "user", "content": transcript(messages)})
        for attempt in range(2):
            try:
                return self.llm.chat(prompt, schema=SCHEMA, max_tokens=200)
            except ValueError:
                if attempt:
                    raise
        return None

    def extract(self, messages, today):
        """(plan, dropped): the details the host gave, and the names of values the model gave that the host's
        messages don't support."""
        raw = self.raw(messages, today)
        host = "\n".join(m["content"] for m in messages if m["role"] == "user")
        return ground(raw, host, today, self.aliases)


def ground(raw, host, today, aliases):
    """Keeps a value only if it is valid and the host's own messages contain it."""
    plan, dropped = {}, []
    said = figures(host)

    def keep(field, value, ok):
        if value is None:
            return
        if ok:
            plan[field] = value
        else:
            dropped.append(field)

    _keep_named(plan, dropped, "event_type", raw.get("event_type"), _named(host, EVENT_WORDS))

    guests = raw.get("guest_count")
    keep("guest_count", guests, isinstance(guests, int) and 10 <= guests <= 5000 and ("n", guests) in said)

    mentioned = _mentioned(host, aliases)
    area = raw.get("area")
    if area in mentioned:
        plan["area"] = area
    elif mentioned:  # the model missed or misread an area the host named: take the latest one named
        plan["area"] = mentioned[-1]
        if area is not None:
            dropped.append("area")
    else:
        keep("area", area, False)

    _keep_named(plan, dropped, "venue_type", raw.get("venue_type"), _named(host, VENUE_WORDS))

    when = _date(raw, today)
    latest = today + timedelta(days=MAX_DAYS_AHEAD)
    if when is not None:
        keep("event_date", when.isoformat(), today <= when <= latest and ("n", when.day) in said)
    elif raw.get("date_text") or raw.get("event_date"):
        dropped.append("event_date")

    budget_text = raw.get("budget_text")
    budget = parse_budget(budget_text) if budget_text else None
    if budget is not None and ("n", budget) in said:
        plan["total_budget_pkr"] = budget
    else:
        if budget_text:  # the model's figure isn't the host's (it once turned "Rs 1.5 crore" into "Rs 1,500,000")
            dropped.append("total_budget_pkr")
        # The model missed or misread a budget the host wrote: take the host's own words.
        if (stated := _stated_budget(host)) is not None:
            plan["total_budget_pkr"] = stated
    return plan, dropped


def _stated_budget(host):
    """The host's last amount that reads as money: written with a unit (25 lakh, 1.5 crore, 85k) or after Rs, PKR or
    "budget". The last, because hosts correct themselves; a per-head price ("2,500 per head") isn't a budget."""
    text = normalize(host)
    found = None
    for match in FIGURE.finditer(text):
        unit = (match[3] or "").lower()
        if match[2] or unit in ("%", "percent"):
            continue
        cue = MONEY_CUE.search(text[max(0, match.start() - 12) : match.start()])
        if (unit or cue) and not PER_HEAD.match(text[match.end() : match.end() + 16]):
            found = parse_budget(match[0]) or found
    return found


def _named(text, words):
    """The types whose words are in the text, in the order of `words` (most specific first)."""
    return [kind for kind, pattern in words.items() if re.search(pattern, text, re.I)]


def _keep_named(plan, dropped, field, value, named):
    """The model's type if the host named it; else the host's own word for a type (the first, most specific);
    else nothing, so it is asked for."""
    if value in named:
        plan[field] = value
        return
    if value is not None:
        dropped.append(field)
    if named:
        plan[field] = named[0]


def _date(raw, today):
    """The host's words for the date, parsed here; the model's own YYYY-MM-DD only when those can't be parsed."""
    if raw.get("date_text") and (parsed := parse_date(raw["date_text"], today)):
        return parsed
    try:
        return date.fromisoformat(raw.get("event_date") or "")
    except ValueError:
        return None


def missing(plan):
    return [field for field in REQUIRED if field not in plan]
