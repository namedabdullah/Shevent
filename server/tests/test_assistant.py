import re
from datetime import date

import pytest
from conftest import CHAT, READING, TODAY, FakeLLM

from app.assistant import Assistant, LLMUnavailable
from app.assistant.chat import CATEGORY_LABELS, EVENT_LABELS, HELLO, OFFER, check_reply, detect_language, format_pkr
from app.assistant.extract import ground
from app.assistant.figures import figures, parse_budget, parse_date
from app.assistant.guide import clean, fallback
from app.assistant.intent import chosen_services, detect_intent, quoted_amount
from shevent_ml.config import REPO_ROOT
from shevent_ml.data.load import load_reference

ALIASES = load_reference()["area_aliases"]
SPLIT = f"Split my budget: {CHAT}"
GUIDANCE = "Catering takes the biggest share. Open the plan to see vendors."  # FakeLLM's free-text answer


def say(*texts):
    return {"messages": [{"role": "user", "content": text} for text in texts]}


def use(services, **llm):
    """Swap in a fake model with these answers; returns it."""
    services.assistant = Assistant(FakeLLM(**llm), services, llm_replies=True, today=lambda: TODAY)
    return services.assistant.llm


def test_a_complete_plan_is_estimated_and_the_reply_kept(client):
    body = client.post("/v1/assistant/chat", json=say(SPLIT)).json()
    assert body["extracted"] == {"event_type": "wedding_mehndi", "guest_count": 300, "area": "Gulberg",
                                 "venue_type": "marquee", "event_date": "2026-12-19",
                                 "total_budget_pkr": 2_500_000}  # fmt: skip
    assert body["missing"] == [] and not body["fallback_to_form"] and body["language"] == "en"
    assert body["intent"] == "budget_split" and body["recommendations"] is None
    assert body["estimate"]["allocation"]["catering"]["pkr"] == 950_000
    assert body["reply"] == GUIDANCE
    assert body["model_version"] == "assistant-v2/llm-test+alloc-test+cost-test"


def test_a_described_event_gets_advice_and_typical_prices_not_a_split(client):
    body = client.post("/v1/assistant/chat", json=say(CHAT)).json()
    assert body["intent"] == "advice" and body["estimate"] is None
    reply = body["reply"].split("\n\n")
    assert reply[0] == ("Here's how I'd approach a mehndi / mayun / dholki for 300 guests in Gulberg on Sat, 19 Dec "
                        "2026 with a budget of Rs 25 lakh.")  # fmt: skip
    assert reply[1] == GUIDANCE  # the model's advice, which has no figures
    # FakeEstimator: venue Rs 1-2 lakh, catering Rs 1,500-2,500 a head x 300.
    assert reply[2] == (
        "What the biggest services cost for this event (AI estimates): venue usually about Rs 1.5 lakh "
        "(Rs 1 lakh to Rs 2 lakh); catering usually about Rs 6 lakh (Rs 4.5 lakh to Rs 7.5 lakh)."
    )
    assert reply[3] == OFFER


def test_only_a_request_to_split_the_budget_runs_1_and_it_can_leave_services_out(client):
    text = f"{CHAT}. Split it between the venue, catering and photography only"
    body = client.post("/v1/assistant/chat", json=say(text)).json()
    assert body["intent"] == "budget_split"
    assert list(body["estimate"]["allocation"]) == ["venue", "catering", "photography"]
    assert body["extracted"]["categories"] == ["venue", "catering", "photography"]


def test_a_price_question_gets_2s_ranges_and_says_what_would_sharpen_them(client):
    body = client.post("/v1/assistant/chat", json=say("How much does catering cost for a mehndi for 300 guests "
                                                       "in Gulberg?")).json()  # fmt: skip
    assert body["intent"] == "prices" and body["estimate"] is None
    assert body["extracted"] == {"event_type": "wedding_mehndi", "guest_count": 300, "area": "Gulberg"}
    facts, advice = body["reply"].split("\n\n")
    assert facts.splitlines()[1:] == [
        "- Catering: usually about Rs 6 lakh (Rs 4.5 lakh to Rs 7.5 lakh), about Rs 1,500 to Rs 2,500 per head",
        "Tell me the date for a closer estimate.",
    ]
    assert advice == GUIDANCE


def test_vendor_suggestions_are_3s_matches_without_sponsored_ones(client):
    body = client.post("/v1/assistant/chat", json=say("Suggest a venue for a mehndi for 300 guests in Gulberg")).json()
    assert body["intent"] == "vendors" and body["recommendations"]["category"] == "venue"
    matches = body["recommendations"]["matches"]
    assert 1 <= len(matches) <= 3 and all(m["category"] == "venue" for m in matches)
    # No budget was given, so no reason talks about one.
    assert not any("budget" in reason for m in matches for reason in m["reasons"])
    assert body["reply"].startswith("Here are venues that fit a mehndi / mayun / dholki for 300 guests in Gulberg")
    assert "sponsored listings are never mixed in" in body["reply"]


def test_a_quoted_price_is_checked_by_5(client):
    text = "A caterer quoted Rs 3,000 per head for our mehndi for 300 guests in Gulberg. Is that fair?"
    body = client.post("/v1/assistant/chat", json=say(text)).json()
    assert body["intent"] == "quote_check"
    assert body["reply"].startswith("Rs 3,000 per head for catering ")
    assert "(Rs 1,500 to Rs 2,500 per head)" in body["reply"]


@pytest.mark.parametrize(
    "texts, reading, missing",
    [
        (["Suggest a caterer"], {}, ["event_type", "guest_count", "area"]),
        (["How much does a photographer cost?"], {}, ["event_type", "guest_count"]),
        (["Is Rs 2 lakh fair for walima photography?"], {"event_type": "wedding_walima"}, ["guest_count"]),
        (["Suggest a caterer for a walima", "the venue is in DHA"], {"event_type": "wedding_walima", "area": "DHA"},
         ["guest_count"]),  # the second message answers the first one's question
    ],
)  # fmt: skip
def test_each_answer_asks_only_for_what_it_needs(client, services, texts, reading, missing):
    use(services, reading=reading)
    body = client.post("/v1/assistant/chat", json=say(*texts)).json()
    assert body["missing"] == missing and body["estimate"] is None and not body["fallback_to_form"]
    assert "I still need" in body["reply"]


def test_a_greeting_is_answered_without_the_model(client, services):
    llm = use(services)
    body = client.post("/v1/assistant/chat", json=say("Hello!")).json()
    assert body["intent"] == "greeting" and body["reply"] == HELLO and llm.calls == []


def test_advice_falls_back_to_the_notes_when_the_model_is_down_and_never_runs_1(client, services):
    use(services, reply=LLMUnavailable("timed out"))
    body = client.post("/v1/assistant/chat", json=say("What should I ask a decorator before booking?")).json()
    assert body["intent"] == "advice" and body["reply"] == fallback("decor") and body["estimate"] is None


def test_advice_sentences_with_figures_no_tool_gave_are_dropped():
    advice = "- Book the hall early.\n- Halls cost Rs 5 lakh. Ask about parking.\n- Expect 20% extra.\n**Note**"
    assert clean(advice, figures("")) == "- Book the hall early.\n- Ask about parking.\nNote"
    assert clean("1. Visit www.example.pk for deals.", figures("")) == ""
    assert clean("- Keep your 300 guests in mind.", figures("300 guests")) == "- Keep your 300 guests in mind."


@pytest.mark.parametrize(
    "host, intent",
    [
        (["Mehndi for 300 guests in Gulberg on 19 December, around 25 lakh"], "advice"),
        (["How much does catering cost for a mehndi for 300 guests?"], "prices"),
        (["mehndi ka khana kitne ka padega 300 logon ke liye"], "prices"),
        (["Suggest photographers in DHA for a walima"], "vendors"),
        (["walima ke liye 500 log, DHA mein, koi achha caterer batao"], "vendors"),
        (["A caterer quoted Rs 3,000 per head. Is that fair?"], "quote_check"),
        (["photographer ne 2 lakh maange hain, ye rate theek hai?"], "quote_check"),
        (["How should I divide my budget of 20 lakh?"], "budget_split"),
        (["What should I ask a decorator before booking?"], "advice"),
        (["Is a marquee or a hall better for a winter mehndi?"], "advice"),
        (["What is the best time of year for a wedding?"], "advice"),  # "best" without a service isn't a search
        (["theek hai, 300 log hain"], "advice"),
        (["Suggest a caterer", "walima, 400 guests, Johar Town"], "vendors"),
        (["hi"], "greeting"),
    ],
)  # fmt: skip
def test_the_question_is_read_from_the_hosts_words(host, intent):
    assert detect_intent(host)[0] == intent


@pytest.mark.parametrize(
    "text, quote",
    [
        ("A caterer quoted Rs 3,000 per head for 300 guests", (3000, "per_head")),
        ("the hall is asking 8 lakh for the baraat", (800_000, "per_event")),
        ("they want 2.5k/head", (2500, "per_head")),
        ("budget is Rs 25 lakh, 300 guests, 19 December", None),  # a budget, a guest count and a date
        ("is it fair?", None),
    ],
)
def test_a_quoted_price_is_read_with_its_unit(text, quote):
    assert quoted_amount(text) == quote


@pytest.mark.parametrize(
    "text, services",
    [
        ("Split 25 lakh: only venue, catering and decor", ["venue", "catering", "decor"]),
        ("split my budget, no DJ and no lighting please", ["venue", "catering", "decor", "photography"]),
        ("split it, the venue is already booked", ["catering", "decor", "dj_sound", "lighting", "photography"]),
        ("split 25 lakh for a mehndi in a marquee", None),  # a venue type isn't a choice of services
    ],
)
def test_a_split_covers_the_services_the_host_names(text, services):
    assert chosen_services(text) == services


def test_missing_details_are_asked_for_and_nothing_is_estimated(client, services):
    use(services, reading={"event_type": "wedding_mehndi", "guest_count": 300})
    body = client.post("/v1/assistant/chat", json=say("split the budget for a mehndi for 300 guests")).json()
    assert body["extracted"] == {"event_type": "wedding_mehndi", "guest_count": 300}
    assert body["missing"] == ["area", "event_date", "total_budget_pkr"] and body["estimate"] is None
    assert body["reply"].startswith("Got it: a mehndi / mayun / dholki for 300 guests.")
    assert "the area in Lahore, the date and your total budget." in body["reply"]
    assert not body["fallback_to_form"]


def test_details_carry_across_messages_and_the_reply_quotes_the_host():
    plan, dropped = ground(READING, "mehndi in Gulberg\n300 guests, 19 December\nbudget 25 lakh", TODAY, ALIASES)
    assert plan["total_budget_pkr"] == 2_500_000 and plan["event_date"] == "2026-12-19"
    assert dropped == ["venue_type"]  # the model's "marquee" isn't in these messages


@pytest.mark.parametrize(
    "host, budget",
    [
        ("Concert for 2000 people in Gulberg on 18 December with Rs 1.5 crore", 15_000_000),  # en-18, model missed it
        ("walima, 500 log, budget 30 lakh... actually make it 35 lakh", 3_500_000),  # the host's correction wins
        ("mehndi for 300 guests, our budget is 2500000", 2_500_000),  # a bare number after "budget"
        ("caterer at 2,500 per head, 300 guests in DHA", None),  # a per-head price isn't a budget
        ("BBQ at 50k per head for 200 guests", None),
        ("2000 people in Gulberg on 18 December", None),  # plain numbers aren't money
    ],
)
def test_a_budget_the_model_missed_is_taken_from_the_hosts_words(host, budget):
    plan, _ = ground({**READING, "budget_text": None}, host, TODAY, ALIASES)
    assert plan.get("total_budget_pkr") == budget


def test_a_budget_the_model_misread_is_replaced_by_the_hosts_own():
    host = "Concert for 2000 people in Gulberg on 18 December with Rs 1.5 crore"
    plan, dropped = ground({**READING, "budget_text": "Rs 1,500,000"}, host, TODAY, ALIASES)  # what the 3B model said
    assert plan["total_budget_pkr"] == 15_000_000 and "total_budget_pkr" in dropped


def test_values_the_host_did_not_write_are_dropped():
    guessed = {**READING, "guest_count": 250, "area": "Gulberg", "budget_text": "30 lakh", "event_date": "2026-10-01",
               "date_text": None}  # fmt: skip
    plan, dropped = ground(guessed, "walima for 300 guests in Defence, 25 lakh", TODAY, ALIASES)
    assert "guest_count" not in plan and "event_date" not in plan
    # What the host named or wrote, not the guesses: Defence is DHA, the budget their 25 lakh, not the model's 30.
    assert plan["area"] == "DHA" and plan["event_type"] == "wedding_walima" and plan["total_budget_pkr"] == 2_500_000
    assert sorted(dropped) == ["area", "event_date", "event_type", "guest_count", "total_budget_pkr", "venue_type"]


def test_an_area_the_model_missed_is_taken_from_the_hosts_words():
    plan, _ = ground({**READING, "area": None}, "300 guests, Johar Town, then actually Model Town", TODAY, ALIASES)
    assert plan["area"] == "Model Town"
    plan, _ = ground({**READING, "area": None}, "گلبرگ میں 300 مہمانوں کی مہندی", TODAY, ALIASES)
    assert plan["area"] == "Gulberg"


def test_a_reply_with_an_invented_figure_is_replaced_by_the_fixed_one(client, services):
    use(services, reply="Catering gets Rs 12 lakh and the venue Rs 6.75 lakh.")
    body = client.post("/v1/assistant/chat", json=say(SPLIT)).json()
    assert body["reply"].startswith("Here is a budget split for a mehndi / mayun / dholki for 300 guests in Gulberg")
    assert ("Catering gets Rs 9.5 lakh (38%), more than this usually costs; Venue gets Rs 6.75 lakh (27%), more than "
            "this usually costs." in body["reply"])  # fmt: skip
    assert "It falls in peak wedding season, when prices run higher." in body["reply"]
    assert services.assistant.rejected == 1


def test_a_reply_quoting_the_tools_and_the_host_is_kept(client, services):
    reply = "For 300 guests on 19 December, catering takes Rs 9.5 lakh (38%) of your 2,500,000. Open the plan."
    use(services, reply=reply)
    assert client.post("/v1/assistant/chat", json=say(SPLIT)).json()["reply"] == reply
    assert services.assistant.rejected == 0


def test_after_four_messages_without_a_full_plan_the_host_goes_to_the_form(client, services):
    use(services, reading={"event_type": "wedding_walima"})
    body = client.post("/v1/assistant/chat", json=say("split my budget for a walima", "not sure", "hmm", "soon")).json()
    assert body["fallback_to_form"] and body["extracted"] == {"event_type": "wedding_walima"}
    assert "planner form" in body["reply"]


def test_unreadable_model_output_sends_the_host_to_the_form(client, services):
    use(services, reading=ValueError("not JSON"))
    body = client.post("/v1/assistant/chat", json=say(SPLIT)).json()
    assert body["fallback_to_form"] and body["extracted"] == {} and len(body["missing"]) == 5


def test_by_default_the_reply_is_the_fixed_one_and_the_model_only_reads(client, services):
    services.assistant = Assistant(FakeLLM(reply="Not used"), services, today=lambda: TODAY)
    body = client.post("/v1/assistant/chat", json=say(SPLIT)).json()
    assert body["reply"].startswith("Here is a budget split for") and body["estimate"]
    assert [schema is not None for _, schema in services.assistant.llm.calls] == [True]  # one call: the reading


def test_ollama_down_is_a_503_but_a_failed_reply_falls_back_to_the_fixed_one(client, services):
    use(services, reading=LLMUnavailable("connection refused"))
    assert client.post("/v1/assistant/chat", json=say(SPLIT)).status_code == 503
    use(services, reply=LLMUnavailable("timed out"))
    body = client.post("/v1/assistant/chat", json=say(SPLIT)).json()
    assert body["reply"].startswith("Here is a budget split") and body["estimate"]


def test_the_model_reads_the_chat_with_todays_date(client, services):
    llm = use(services)
    client.post("/v1/assistant/chat", json=say(SPLIT))
    (extraction, schema), (reply, _) = llm.calls
    assert schema is not None and "Today is Sunday 08 November 2026." in extraction[0]["content"]
    assert extraction[-1]["content"] == f"Host: {SPLIT}"
    # Rs 9.5 lakh against #2's Rs 4.5-7.5 lakh: the server makes the comparison, not the model.
    assert "Catering: Rs 9.5 lakh (38%), more than this usually costs" in reply[1]["content"]


@pytest.mark.parametrize(
    "reply, problem",
    [
        ("Catering takes Rs 9.5 lakh (38%).", None),
        ("Catering takes 950,000 rupees.", None),  # the same figure written out
        ("Catering takes Rs 9.5 crore.", "figures not from a tool: [95000000]"),
        ("About 40% goes to catering.", "figures not from a tool: [40]"),
        ("See https://example.com for Rs 9.5 lakh.", "link or code"),
        ("", "empty or too long"),
        ("Catering takes Rs 9.5 lakh.\n\nFACTS: catering Rs 9.5 lakh", "prompt text or extra paragraph"),
    ],
)
def test_the_checker_allows_only_figures_from_the_tools_or_the_host(reply, problem):
    allowed = figures("- Catering: Rs 9.5 lakh (38%)") | figures(CHAT)
    assert check_reply(reply, allowed) == problem


@pytest.mark.parametrize(
    "text, amount",
    [("budget 40 lakh", 4_000_000), ("Rs 2,500,000", 2_500_000), ("1.2 crore", 12_000_000), ("85k", 85_000),
     ("25 lac", 2_500_000), ("۲۵ لاکھ", 2_500_000), ("300 guests", None), ("2.5m", 2_500_000)],
)  # fmt: skip
def test_budgets_are_read_as_hosts_write_them(text, amount):
    assert parse_budget(text) == amount


@pytest.mark.parametrize(
    "text, day",
    [("19 December", date(2026, 12, 19)), ("march 3rd", date(2027, 3, 3)), ("19/12/26", date(2026, 12, 19)),
     ("2027-01-15", date(2027, 1, 15)), ("Dec 5th, 2026", date(2026, 12, 5)), ("1 November", date(2027, 11, 1)),
     ("15 mayun", None), ("5 decorators", None), ("31/02/2027", None)],
)  # fmt: skip
def test_dates_are_read_day_first_and_without_a_year_mean_the_next_one(text, day):
    assert parse_date(text, TODAY) == day


@pytest.mark.parametrize(
    "value, text",
    [(85_000, "Rs 85,000"), (2_500_000, "Rs 25 lakh"), (12_500_000, "Rs 1.25 crore"), (9_999_999, "Rs 1 crore"),
     (99_999.6, "Rs 1 lakh"), (675_000, "Rs 6.75 lakh")],
)  # fmt: skip
def test_rupees_print_like_the_apps(value, text):
    assert format_pkr(value) == text


@pytest.mark.parametrize(
    "text, language",
    [(CHAT, "en"), ("walima karni hai, 500 log", "roman_ur"), ("گلبرگ میں مہندی", "ur"),
     ("DHA میں mehndi party", "mixed")],
)  # fmt: skip
def test_the_hosts_language_is_noted(text, language):
    assert detect_language(text) == language


@pytest.mark.parametrize(
    "labels, file, name",
    [(EVENT_LABELS, "event-types.ts", "EVENT_TYPE_LABELS"), (CATEGORY_LABELS, "categories.ts", "CATEGORY_LABELS")],
)
def test_labels_match_the_apps(labels, file, name):
    text = (REPO_ROOT / "packages" / "core" / "enums" / file).read_text(encoding="utf-8")
    body = re.search(rf"export const {name}[^=]*= \{{(.*?)\}};", text, re.S).group(1)
    assert labels == dict(re.findall(r"(\w+): '([^']+)'", body))


@pytest.mark.parametrize(
    "host, model_says, expected",
    [
        ("300 guests in Gulberg", "wedding_walima", None),  # copied from the prompt's example: dropped
        ("Office event in Garden Town for 120 people", "corporate_dinner", "corporate_other"),  # the host's word wins
        ("salgirah ki party, 70 log", "birthday", "birthday"),
        ("Annual company gala in Cantt", None, "corporate_dinner"),  # the model missed it
    ],
)
def test_an_event_type_counts_only_if_the_host_named_it(host, model_says, expected):
    plan, _ = ground({"event_type": model_says}, host, TODAY, ALIASES)
    assert plan.get("event_type") == expected


def test_a_venue_type_counts_only_if_the_host_named_it():
    assert "venue_type" not in ground({"venue_type": "marquee"}, "walima, 500 log", TODAY, ALIASES)[0]
    assert "venue_type" not in ground({"venue_type": "lawn"}, "120 people in Garden Town", TODAY, ALIASES)[0]
    assert ground({"venue_type": None}, "on a lawn in Valencia", TODAY, ALIASES)[0]["venue_type"] == "lawn"
