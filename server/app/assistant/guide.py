"""#8 guidance: the LLM's advice for the host's question, and the checks that keep it honest.

The model writes the advice (what to ask a caterer, what to book first); the server writes every figure. The model
is asked for no numbers at all, and each sentence it writes is checked: a sentence with a figure that isn't in the
host's own messages, a link, or the prompt's own wording is dropped. If nothing is left, or the model is down, the
host gets the hand-written notes below, which the model is also given to work from.
"""

import logging
import re

from .figures import figures, stated
from .llm import LLMUnavailable

log = logging.getLogger(__name__)

MAX_GUIDANCE_CHARS = 700
MAX_POINTS = 4  # bullet points, or sentences in a paragraph
# Hand-written planning notes for Lahore events, with no figures. The model is given the ones for the question's
# topic; they are also the fallback reply.
NOTES = {
    None: [
        "Book the venue first: the date and the guest count depend on it, and good halls fill up early in the "
        "wedding season.",
        "Settle the guest count before asking for quotes, since halls and caterers price per head.",
        "Get every quote in writing with what it includes: taxes, service charges, generator backup and setup time.",
        "Keep part of the budget aside for things that come up in the last week.",
    ],
    "venue": [
        "Check the hall's real capacity, parking, generator backup and whether outside catering is allowed.",
        "Ask what the rent includes: stage, seating, heating or cooling, basic decor and how long you can stay.",
        "Visit at the same time of day as your event to see the lighting and the traffic.",
        "Winter nights get cold in marquees and lawns: ask about heaters, or choose a hall that is easier to keep "
        "warm. In summer, ask how the space is cooled.",
    ],
    "catering": [
        "Ask for a tasting and the exact menu per head: the dishes, drinks, dessert and bread.",
        "Confirm whether serving staff, crockery and taxes are included in the per-head price.",
        "Agree in writing how extra guests are charged, and how many plates they keep in reserve.",
    ],
    "decor": [
        "Share photos of what you like and ask for a sketch of the stage and the entrance.",
        "Ask whether the flowers are fresh or artificial, and who sets up and clears everything.",
        "Confirm the setup time with the venue so the decor is ready before guests arrive.",
    ],
    "dj_sound": [
        "Ask exactly what equipment comes: speakers, microphones, mixer and backup power.",
        "Check the venue's rules on sound and the time the music must stop.",
        "Share your song list early, including the songs for the entrances.",
    ],
    "lighting": [
        "Ask for a lighting plan covering the stage, the entrance and any outdoor area.",
        "Make sure the lights have generator backup.",
        "Have the lighting and decor teams set up together so the look matches.",
    ],
    "photography": [
        "Look at complete albums from real events, not only highlight reels.",
        "Agree in writing on the team size, hours, number of edited photos, the album and the delivery date.",
        "Ask when the photos and video will be delivered: late albums are a common complaint in reviews.",
    ],
    "quote": [
        "Compare quotes for the same things: menu, hours, people and extras.",
        "Ask what is left out: taxes, service charges, transport and generator fuel.",
    ],
}

SYSTEM = """You are Shevent's event planning assistant in Lahore, Pakistan. Answer the host's latest message with \
practical guidance: what to consider, what to ask vendors, what to book first, and mistakes to avoid. Make it \
specific to their event and to Lahore.

Rules:
- Write 2 to 4 short sentences, or 3 to 5 short bullet points that each start with "- ". Plain text: no headings, \
no bold, no greeting.
- Never write a number of any kind: no prices, amounts, percentages, guest counts, dates or durations. The app \
shows its own price estimates next to your answer.
- Never name a business, vendor, venue or website.
- Reply in English."""

ECHO = re.compile(r"\b(Event so far|Topic|Notes|Host's (latest )?message|Conversation)\s*:", re.I)
BULLET = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s+")


def notes_for(topic):
    return NOTES.get(topic) or NOTES[None]


def fallback(topic, count=3):
    """The hand-written notes as a short list."""
    return "\n".join(f"- {line}" for line in notes_for(topic)[:count])


def prompt(question, event, topic_label, topic, conversation):
    notes = "\n".join(f"- {line}" for line in notes_for(topic))
    lines = [f"Event so far: {event or 'not described yet'}"]
    if topic_label:
        lines.append(f"Topic: {topic_label}")
    lines += [f"Notes you may use:\n{notes}"]
    if conversation:
        lines.append(f"Conversation:\n{conversation}")
    lines.append(f'Host\'s latest message: "{question}"\n\nWrite the guidance.')
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\n".join(lines)}]


def clean(text, allowed):
    """The model's guidance with every sentence that breaks a rule taken out; "" if nothing is left."""
    text = text.replace("**", "").replace("__", "")
    kept_lines = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        bullet = bool(BULLET.match(raw))
        line = BULLET.sub("", raw).strip()
        sentences = re.split(r"(?<=[.!?])\s+", line)
        good = [s for s in sentences if s and ok(s, allowed)]
        if good:
            kept_lines.append(("- " if bullet else "") + " ".join(good[:MAX_POINTS]))
    out = "\n".join(kept_lines[:MAX_POINTS]).strip()
    if len(out) > MAX_GUIDANCE_CHARS:
        cut = out[:MAX_GUIDANCE_CHARS]
        out = cut[: max(cut.rfind("\n"), cut.rfind(". ") + 1)].strip() or ""
    return out


def ok(sentence, allowed):
    if re.search(r"https?://|www\.|\.com\b|\.pk\b|```", sentence, re.I) or ECHO.search(sentence):
        return False
    return all(claim in allowed for claim in stated(sentence))


def guidance(llm, question, host_text, event, topic=None, topic_label=None, conversation=""):
    """(text, source): the model's checked guidance ("llm"), or the hand-written notes ("notes")."""
    try:
        reply = llm.chat(prompt(question, event, topic_label, topic, conversation), max_tokens=260)
    except LLMUnavailable as error:
        log.warning("No guidance from the model, using the notes: %s", error)
        return fallback(topic), "notes"
    text = clean(reply, figures(host_text))
    if not text:
        log.info("Guidance had nothing left after the checks, using the notes: %r", reply)
        return fallback(topic), "notes"
    return text, "llm"
