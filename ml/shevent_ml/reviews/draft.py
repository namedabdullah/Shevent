"""Choose the hand-labelled review test set, draft first-pass labels with the local LLM, and write Label Studio files.

    python -m shevent_ml.reviews.draft              # needs data/processed/reviews.parquet and Ollama running
    python -m shevent_ml.reviews.draft --no-llm     # no drafts: just the test set and the Label Studio files
    python -m shevent_ml.reviews.draft --limit 20   # draft 20 reviews, to check the prompt before a full run

The test set (data/splits/review_test_ids.csv, commit it) is labelled by hand from scratch: its tasks carry no LLM
draft, so the labeller isn't anchored by the model. Every other review gets a draft the labeller corrects; those
become training labels. Drafts are cached in data/processed/review_drafts.jsonl, so a rerun only drafts what's new.

Then in Label Studio (docker compose up -d label-studio, http://127.0.0.1:8080): create a project, paste
data/processed/label_studio_config.xml under Labeling Interface, import label_studio_tasks.json, and export the
finished labels as JSON.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pydantic import ValidationError

from shevent_ml.config import PROCESSED_DIR, SEED, SPLITS_DIR
from shevent_ml.reviews.labels import (
    label_model,
    label_studio_config,
    label_studio_task,
    prompt_messages,
    prompt_version,
    settings,
)
from shevent_ml.reviews.ollama import OllamaError, chat_json, check_model

TEST_FILE = SPLITS_DIR / "review_test_ids.csv"
NON_ENGLISH = {"roman_ur", "ur", "mixed"}


def choose_test_reviews(reviews, size, min_non_english, seed=SEED):
    """size review IDs, at least min_non_english of them Roman Urdu, Urdu or mixed (or all such reviews if fewer)."""
    rng = np.random.default_rng(seed)
    ids = reviews["review_id"].sort_values()
    non_english = ids[reviews.set_index("review_id").loc[ids, "language"].isin(NON_ENGLISH).to_numpy()]
    quota = min(len(non_english), math.ceil(size * min_non_english))
    chosen = set(rng.choice(non_english.to_numpy(), size=quota, replace=False))
    rest = ids[~ids.isin(chosen)].to_numpy()
    chosen |= set(rng.choice(rest, size=min(len(rest), size - quota), replace=False))
    return sorted(chosen)


def load_or_choose_test_set(reviews, config, test_file=TEST_FILE, force=False):
    if test_file.exists() and not force:
        return set(pd.read_csv(test_file, dtype=str)["review_id"])
    chosen = choose_test_reviews(reviews, config["test_set"]["size"], config["test_set"]["min_non_english"])
    test_file.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"review_id": chosen}).to_csv(test_file, index=False)
    return set(chosen)


def read_drafts(path, model, version):
    """Cached drafts made with this model and prompt version, by review_id."""
    if not path.exists():
        return {}
    drafts = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        if record["model"] == model and record["prompt_version"] == version:
            drafts[record["review_id"]] = record["labels"]
    return drafts


def draft_labels(text, config, schema_model, chat=chat_json):
    """The LLM's labels for one review, checked against the schema."""
    reply = chat(prompt_messages(text, config), schema_model.model_json_schema(), config["ollama"])
    return schema_model.model_validate(reply).model_dump()


def run(
    processed_dir=PROCESSED_DIR,
    test_file=TEST_FILE,
    use_llm=True,
    limit=None,
    force_test=False,
    chat=chat_json,
    config=None,
    log=print,
):
    config = config or settings()
    if use_llm and chat is chat_json:
        check_model(config["ollama"])  # before writing anything, so a failed run leaves no files behind
    reviews = pd.read_parquet(processed_dir / "reviews.parquet")
    test_ids = load_or_choose_test_set(reviews, config, test_file, force_test)
    reviews = reviews.assign(set=np.where(reviews["review_id"].isin(test_ids), "test", "train"))

    model, version = config["ollama"]["model"], prompt_version(config)
    cache = processed_dir / "review_drafts.jsonl"
    drafts = read_drafts(cache, model, version)
    failed = []
    if use_llm:
        todo = reviews[(reviews["set"] == "train") & ~reviews["review_id"].isin(drafts)]
        if limit is not None:
            todo = todo.head(limit)
        schema_model = label_model(config)
        with cache.open("a", encoding="utf-8") as out:
            for i, review in enumerate(todo.itertuples(), 1):
                try:
                    labels = draft_labels(review.text, config, schema_model, chat)
                except (OllamaError, ValidationError) as error:
                    failed.append(review.review_id)
                    log(f"  {review.review_id}: no draft ({str(error).splitlines()[0]})")
                    continue
                drafts[review.review_id] = labels
                record = {"review_id": review.review_id, "model": model, "prompt_version": version, "labels": labels}
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                if i % 25 == 0:
                    log(f"  drafted {i} of {len(todo)}")

    tasks = [
        label_studio_task(review, drafts.get(review["review_id"]) if review["set"] == "train" else None, model)
        for review in reviews.to_dict("records")
    ]
    (processed_dir / "label_studio_tasks.json").write_text(json.dumps(tasks, ensure_ascii=False, indent=1), "utf-8")
    (processed_dir / "label_studio_config.xml").write_text(label_studio_config(config), "utf-8")
    return {
        "reviews": len(reviews),
        "test": int((reviews["set"] == "test").sum()),
        "test_non_english": int(((reviews["set"] == "test") & reviews["language"].isin(NON_ENGLISH)).sum()),
        "drafted": sum(1 for task in tasks if "predictions" in task),
        "failed": failed,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--no-llm", action="store_true", help="skip drafting; write the files without predictions")
    parser.add_argument("--limit", type=int, help="draft at most this many new reviews")
    parser.add_argument("--force-test", action="store_true", help="choose a new test set (only before labelling)")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    try:
        summary = run(args.processed, use_llm=not args.no_llm, limit=args.limit, force_test=args.force_test)
    except OllamaError as error:
        print(f"{error}\nOr run with --no-llm to set up Label Studio without drafts.")
        return 1
    print(
        f"{summary['reviews']} reviews: {summary['test']} in the test set "
        f"({summary['test_non_english']} Roman Urdu / Urdu / mixed), {summary['drafted']} with LLM drafts"
    )
    if summary["failed"]:
        print(f"  {len(summary['failed'])} reviews couldn't be drafted; rerun to retry them")
    print(f"Label Studio files: {args.processed / 'label_studio_config.xml'} and label_studio_tasks.json")
    print(f"Test set fixed in {TEST_FILE}; commit it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
