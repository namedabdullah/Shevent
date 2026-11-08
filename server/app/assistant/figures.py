"""Numbers in chat text, the way hosts in Lahore write them: "25 lakh", "Rs 2,500,000", "85k", "19th", "30%".

The assistant uses them twice: a value the LLM extracted counts only if the host actually wrote it, and a reply
counts only if every figure in it was in the facts it was given or in the host's own messages.
"""

import re
from datetime import date

LAKH, CRORE = 100_000, 10_000_000
MULTIPLIERS = [
    (re.compile(r"^(crores?|cr)$"), CRORE),
    (re.compile(r"^(lakhs?|lacs?|laakh|l)$"), LAKH),
    (re.compile(r"^(million|mn|m)$"), 1_000_000),
    (re.compile(r"^(thousand|hazaa?r|k)$"), 1_000),
]
FIGURE = re.compile(
    r"(?<![\d.,])(\d+(?:,\d{2,3})*(?:\.\d+)?)(?!\d)"
    r"\s*(?:(st|nd|rd|th)\b|(%|percent\b|crores?\b|cr\b|lakhs?\b|lacs?\b|laakh\b|million\b|mn\b"
    r"|thousand\b|hazaa?r\b|k\b|m\b|l\b))?",
    re.I,
)
DIGITS = {**{0x0660 + i: str(i) for i in range(10)}, **{0x06F0 + i: str(i) for i in range(10)}}
URDU_WORDS = {"کروڑ": " crore ", "لاکھ": " lakh ", "ہزار": " hazar "}
_ENGLISH_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
                   "november", "december"]  # fmt: skip
MONTHS = {
    **{m: i for i, m in enumerate(_ENGLISH_MONTHS, 1)},
    **{m[:3]: i for i, m in enumerate(_ENGLISH_MONTHS, 1)},
    "sept": 9,
    **dict(zip(["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"],
               range(1, 13), strict=True)),
}  # fmt: skip
MONTH_WORD = r"([a-z]{3,9}|" + "|".join(m for m in MONTHS if not m.isascii()) + ")"


def normalize(text):
    """Eastern Arabic and Urdu digits to ASCII, Urdu money words to the English ones, lower case."""
    text = text.translate(DIGITS)
    for word, english in URDU_WORDS.items():
        text = text.replace(word, english)
    return text.lower()


def _number(token):
    value = float(token.replace(",", ""))
    return int(value) if value.is_integer() else round(value, 4)


def figures(text):
    """Every figure in the text as (kind, value): ("%", 30) for a percentage, ("n", 2500000) for "25 lakh". The bare
    number is included too ("n", 25), so a figure written without its unit still matches."""
    found = set()
    for match in FIGURE.finditer(normalize(text)):
        number, unit = _number(match[1]), (match[3] or "").lower()
        if unit in ("%", "percent"):
            found.add(("%", number))
            continue
        found.add(("n", number))
        multiplier = next((m for pattern, m in MULTIPLIERS if pattern.match(unit)), None)
        if multiplier:
            found.add(("n", _number(str(round(number * multiplier)))))
    return found


def stated(text):
    """The figures as written, each with its unit applied (what a reply claims), without the bare numbers."""
    claims = set()
    for match in FIGURE.finditer(normalize(text)):
        number, unit = _number(match[1]), (match[3] or "").lower()
        if unit in ("%", "percent"):
            claims.add(("%", number))
            continue
        multiplier = next((m for pattern, m in MULTIPLIERS if pattern.match(unit)), 1)
        claims.add(("n", _number(str(round(number * multiplier, 4)))))
    return claims


def parse_budget(text):
    """The first amount in the text that could be a total budget (Rs 10,000 to Rs 50 crore), in rupees."""
    for match in FIGURE.finditer(normalize(text)):
        unit = (match[3] or "").lower()
        if unit in ("%", "percent") or match[2]:
            continue
        multiplier = next((m for pattern, m in MULTIPLIERS if pattern.match(unit)), 1)
        amount = round(float(match[1].replace(",", "")) * multiplier)
        if 10_000 <= amount <= 500_000_000:
            return amount
    return None


def _resolve(day, month, year, today):
    """A date written without a year is its next occurrence from today."""
    try:
        candidate = date(year or today.year, month, day)
        if year is None and candidate < today:
            candidate = date(today.year + 1, month, day)
    except ValueError:
        return None
    return candidate


def parse_date(text, today):
    """A calendar date in the text: 2026-12-19, 19/12/2026 (day first), 19 December, December 19th 2026."""
    text = normalize(text)
    if match := re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text):
        return _resolve(int(match[3]), int(match[2]), int(match[1]), today)
    if match := re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b", text):
        year = int(match[3]) + (2000 if len(match[3]) == 2 else 0)
        return _resolve(int(match[1]), int(match[2]), year, today)
    day_first = rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:of\s+)?{MONTH_WORD}(?![a-z])(?:,?\s*(\d{{4}}))?"
    for match in re.finditer(day_first, text):
        if month := MONTHS.get(match[2]):
            return _resolve(int(match[1]), month, int(match[3]) if match[3] else None, today)
    month_first = rf"{MONTH_WORD}\s+(\d{{1,2}})(?!\d)(?:st|nd|rd|th)?(?:,?\s*(\d{{4}}))?"
    for match in re.finditer(month_first, text):
        if month := MONTHS.get(match[1]):
            return _resolve(int(match[2]), month, int(match[3]) if match[3] else None, today)
    return None
