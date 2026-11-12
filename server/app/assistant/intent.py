"""#8: what the host is asking for, read from their own words by rules (English, Roman Urdu and Urdu script).

Rules rather than the LLM, because the answer decides which model runs: a 3B model's guess could send a price
question to the budget splitter. Each host message is read for cue words; the latest message with a cue sets the
intent, so "300 guests, DHA" answers the question asked before it. Kinds of question:

- budget_split: split, divide or allocate the budget (only then does #1 run)
- quote_check: is a price they were quoted fair (needs an amount in the message)
- vendors: suggest, recommend or find a vendor for a service
- prices: how much a service, or the event, usually costs
- advice: anything else, such as how to plan, what to ask a vendor, which venue type suits the season
- greeting: hello, thanks
"""

import re

from shevent_ml.config import CATEGORIES

from .figures import FIGURE, MULTIPLIERS, normalize

INTENTS = ["budget_split", "quote_check", "vendors", "prices", "advice", "greeting"]
LOOK_BACK = 3  # how many earlier host messages a message without a cue may inherit its intent from

CUES = {
    "budget_split": r"\b(split|splits|splitting|divide|dividing|allocate|allocation|break ?down|breakup|break up|"
    r"distribute|distribution|budget plan|how (should|do|can|would) (i|we) (spend|use|divide|split|allocate)|"
    r"where should (the|my|our) money go|taqseem|takseem|baant|bant|baanto)\b|تقسیم|بانٹ",
    "quote_check": r"\b(quote|quotes|quoted|quotation|offered|offer|asking (for|me|us)|asked (for|me|us)|charging|"
    r"charged|charge (me|us)|demanding|demanded|is (it|this|that) (fair|reasonable|ok|okay|too (much|high|expensive)|"
    r"expensive|a good (price|deal)|normal)|fair|reasonable|overpriced|overcharg\w*|rip ?off|too (much|high|expensive)|"
    r"(ye|yeh|yah|is ka|iska|ye rate|yeh rate)\s+(theek|thik|sahi|munasib|zyada|ziada)|mehnga|mehenga|mehanga)\b|"
    r"مہنگا|زیادہ|ٹھیک",
    "vendors": r"\b(suggest|suggestion|suggestions|recommend|recommendation|recommendations|find( me)?|search|"
    r"looking for|show me|options|best|top|who (should|can|do)|which (vendor|caterer|photographer|hall|venue|"
    r"decorator|dj|one)|any good|koi achh?a|koi achh?i|achh?a sa|achh?i si|batao|batain|bataen|bataiye|bataye|"
    r"dhoondo|dhundo)\b|بتائیں|بتاؤ|تجویز",
    "prices": r"\b(how much|cost|costs|costing|price|prices|pricing|rate|rates|charges|expensive|cheap|afford|"
    r"budget for|kitna|kitne|kitni|kharcha|kharch|qeemat|keemat|qimat|paisay|paise|rate kya)\b|کتنا|کتنے|کتنی|"
    r"قیمت|خرچ|ریٹ",
}
GREETING = re.compile(
    r"^\s*(hi|hii+|hello|hey|salam|salaam|assalam[a-z ]*|aoa|thanks|thank you|thank u|thx|shukriya|jazakallah|ok|"
    r"okay|great|nice|good (morning|evening|afternoon))\b[\s!.,?]*(there|again)?[\s!.,?]*$|^\s*(سلام|السلام علیکم|"
    r"شکریہ)[\s!.,?]*$",
    re.I,
)
THANKS = re.compile(r"\b(thanks|thank you|thank u|thx|shukriya|jazakallah)\b|شکریہ", re.I)

# Services by the words hosts use for them. Venue types (a marquee, a lawn) count as the venue only when no other
# service is named: "a mehndi in a marquee, suggest a caterer" is about catering.
CATEGORY_WORDS = {
    "venue": r"\b(venue|venues|hall rent|shadi hall|shaadi hall|wedding hall|marriage hall|banquet hall|jagah)\b|"
    r"جگہ|شادی ہال",
    "catering": r"\b(catering|caterer|caterers|cater|food|menu|menus|khana|khaana|khanay|buffet|dishes|bbq|"
    r"one dish)\b|کھانا|کیٹرنگ|کیٹرر|مینو",
    "decor": r"\b(decor|decoration|decorations|decorator|decorators|decorate|sajawat|sajavat|stage|flowers|phool|"
    r"floral)\b|سجاوٹ|ڈیکور|ڈیکوریشن|اسٹیج|پھول",
    "dj_sound": r"\b(dj|djs|d\.j\.?|sound|sound system|music|dhol|speakers|band)\b|ڈی جے|ساؤنڈ|میوزک|ڈھول",
    "lighting": r"\b(lighting|lightings|lights|fairy lights|roshni)\b|لائٹنگ|روشنی|لائٹس",
    "photography": r"\b(photographer|photographers|photography|photo|photos|photoshoot|pictures|video|videos|"
    r"videography|videographer|camera|cameraman|shoot|album)\b|فوٹوگرافر|فوٹو|ویڈیو|تصویر|تصاویر",
}
VENUE_TYPE_WORDS = (
    r"\b(hall|halls|marquee|marquees|banquet|lawn|farmhouse|farm house|rooftop|hotel)\b|ہال|مارکی|لان|فارم ہاؤس|ہوٹل"
)
# A service named right after one of these is one the host doesn't need ("no DJ", "the hall is already booked").
NOT_NEEDED_BEFORE = re.compile(r"\b(without|no|except|excluding|not|skip|bina|baghair|baghier)\s+(an?\s+|the\s+)?$")
NOT_NEEDED_AFTER = re.compile(
    r"^\s*(is |are )?(already (booked|sorted|arranged|done|have|fixed)|not (needed|required)|nahi chahiye|"
    r"ki zaroorat nahi|we have|done)\b"
)
GUEST_AFTER = re.compile(r"^\s*(guests?|people|persons?|log|logon|logo|mehmaan|mehman|bande|attendees|pax|kids)\b")
PER_HEAD = re.compile(r"^\s*(?:per|/|a|fi|each)\s*(?:head|person|guest|plate|banda|bande)\b|^\s*each\b")
MONEY_BEFORE = re.compile(r"\b(rs\.?|pkr|rupees?|for|at|of|quoted|charging|asking|is|demanding)\s*$")
BUDGET_BEFORE = re.compile(r"budget( is| of)?\s*(rs\.?|pkr)?\s*$")
MONTH_NEAR = re.compile(r"^\s*(st|nd|rd|th)?\s*(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b")


def has_cue(text, intent):
    return re.search(CUES[intent], normalize(text), re.I) is not None


def message_intent(text, has_amount=None):
    """The intent a single message asks for, or None when it has no cue (it then continues the conversation)."""
    if GREETING.match(text):
        return "greeting"
    lower = normalize(text)
    found = {name for name, pattern in CUES.items() if re.search(pattern, lower, re.I)}
    amount = quoted_amount(text) if has_amount is None else has_amount
    # A quote needs a price to check, and a vendor suggestion a service to suggest.
    if "quote_check" in found and amount:
        return "quote_check"
    if "budget_split" in found:
        return "budget_split"
    if "vendors" in found and categories_named(text):
        return "vendors"
    if "prices" in found:
        return "prices"
    return None


def detect_intent(host):
    """(intent, index of the host message that set it). Without any cue the host is described an event or asked
    something open: advice. A greeting counts only as the latest message."""
    if not host:
        return "advice", None
    latest = message_intent(host[-1])
    if latest is not None:
        return latest, len(host) - 1
    for index in range(len(host) - 2, max(-1, len(host) - 2 - LOOK_BACK), -1):
        earlier = message_intent(host[index])
        if earlier not in (None, "greeting"):
            return earlier, index
    return "advice", None


def categories_named(text, venue_types=True):
    """The services the text names, in the usual order. Venue types count as the venue only when nothing else is
    named (and only with venue_types)."""
    lower = normalize(text)
    named = [c for c in CATEGORIES if re.search(CATEGORY_WORDS[c], lower, re.I)]
    if venue_types and not named and re.search(VENUE_TYPE_WORDS, lower, re.I):
        named = ["venue"]
    return named


def categories_not_needed(text):
    """Services the host says they don't need: "no DJ", "without decor", "the venue is already booked"."""
    lower = normalize(text)
    skipped = []
    for category in CATEGORIES:
        for match in re.finditer(CATEGORY_WORDS[category], lower, re.I):
            before, after = lower[max(0, match.start() - 20) : match.start()], lower[match.end() : match.end() + 30]
            if NOT_NEEDED_BEFORE.search(before) or NOT_NEEDED_AFTER.search(after):
                skipped.append(category)
                break
    return skipped


def chosen_services(text):
    """For a budget split: the services the host wants, or None for all six. Named services ("split it between
    catering and photography"), else all but the ones they don't need ("no DJ")."""
    skipped = set(categories_not_needed(text))
    named = [c for c in categories_named(text, venue_types=False) if c not in skipped]
    if named:
        return named
    if skipped:
        return [c for c in CATEGORIES if c not in skipped] or None
    return None


def quoted_amount(text):
    """(amount, unit) of the last price in the text that reads as a quote, or None. unit is "per_head" when written
    per head / per person, else "per_event". Guest counts, dates and percentages aren't prices; neither is the
    total budget ("budget 25 lakh")."""
    lower = normalize(text)
    found = None
    for match in FIGURE.finditer(lower):
        unit_word = (match[3] or "").lower()
        if match[2] or unit_word in ("%", "percent"):
            continue
        after = lower[match.end() : match.end() + 20]
        before = lower[max(0, match.start() - 14) : match.start()]
        if GUEST_AFTER.match(after) or MONTH_NEAR.match(after) or BUDGET_BEFORE.search(before):
            continue
        multiplier = next((m for pattern, m in MULTIPLIERS if pattern.match(unit_word)), None)
        per_head = bool(PER_HEAD.match(after))
        if multiplier is None and not per_head and not MONEY_BEFORE.search(before):
            continue
        amount = float(match[1].replace(",", "")) * (multiplier or 1)
        unit = "per_head" if per_head else "per_event"
        low, high = (100, 50_000) if per_head else (5_000, 500_000_000)
        if low <= amount <= high:
            found = (round(amount), unit)
    return found


def is_thanks(text):
    return THANKS.search(text) is not None
