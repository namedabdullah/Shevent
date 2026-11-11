# Model Card: #6 Review Insights

| | |
|---|---|
| Version | `reviews-v1-…` (`ml/artifacts/review_insights/meta.json`) |
| Code | `ml/shevent_ml/reviews/model.py`, synthetic reviews in `ml/shevent_ml/reviews/synthetic.py`, settings in `ml/configs/reviews.yaml` and `ml/configs/review_phrases.yaml` |
| Served by | `POST /v1/reviews/insights` (the apps don't show it yet) |
| Owner | ML lead |

## What it does

Reads a review and says, for each of seven aspects (punctuality, food quality, sound quality, staff behaviour, value for
money, hidden charges, photo and video quality), whether the reviewer praised it, criticised it, did both, or didn't
mention it. Summed over a vendor's reviews this gives the pros and cons panel ("guests praised the food", "late
arrival mentioned 3 times"). It reads English, Roman Urdu, Urdu script and a mix.

## Inputs and outputs

- **In:** review text.
- **Out:** one label per aspect: positive, negative, mixed or not_mentioned.

## Method

Reviews are read clause by clause: split at full stops and joining words (but, however, and, lekin, magar, aur, لیکن,
مگر, اور). For each clause:

1. **Aspect:** a logistic regression picks the aspect the clause is about, or none. It counts only when its probability
   is at least 0.3.
2. **Tone:** a second logistic regression decides praise or complaint, from the same text features plus counts of
   general praise and complaint words in three languages (`lexicon` in `ml/configs/reviews.yaml`). A clause counts as
   clear praise or complaint at 65% confidence.

An aspect with clear praise and a clear complaint is mixed. Features are TF-IDF over words (1-2 grams) and character
2-5 grams inside words, which copes with Roman Urdu's loose spelling (bohat / bohot / bht) and with Urdu script
without a tokenizer or a model download. The model file is 0.8 MB and predicts in milliseconds on a CPU.

The plan's fine-tuned XLM-RoBERTa was dropped: it needs a GPU and a 1 GB download, and with no hand-labelled real
reviews it would have learned only the synthetic fragments.

## Training data

- **Synthetic clauses:** about 450 hand-written fragments in English, Roman Urdu and Urdu script, each one clause with a
  known tone: about one aspect, or about none (the place, decor, parking; openers and closers). Each also appears once with a
  dropped letter. Written because the 308 collected reviews are 97% five-star and 97% English: a model trained on them
  alone would call every review positive.
- **Real reviews:** the 158 labelled reviews outside the test set (`data/splits/review_labels.csv`) at 5× weight:
  those about a single aspect as examples of it, those about no aspect as examples of "none".

## Evaluation

**Real test set:** 150 real reviews (`data/splits/review_test_ids.csv`): all 10 that aren't English, all 10 rated 3
stars or less, and 130 more at random. All 308 real reviews were labelled on 10 Nov **by an AI assistant that
also built this model**, following the aspect definitions in `ml/configs/reviews.yaml`, from the text alone and without
looking at the model's output. The 158 outside the test set train the model. Labels by the assistant that built the model are less
independent than labels by the data lead would be; re-labelling the test set by a person is the first thing to do.

| On 150 real test reviews | Macro-F1 (4 labels, mean of 7 aspects) | Label right where mentioned | Complaints found | Aspects found (recall / precision) |
|---|---|---|---|---|
| This model | **0.436** | **65%** | **13 of 17** | **79%** / 71% |
| English-only keyword baseline | 0.424 | 61% | 7 of 17 | 76% / **90%** |

- The model finds nearly twice as many of the real complaints, which is what review insights are for. The baseline is
  more precise: the model still flags aspects a review doesn't talk about (44 false alarms in 150 reviews).
- Real reviews hardly mention punctuality (2), sound (1) or hidden charges (0), so macro-F1 on those aspects mostly
  measures false alarms; food (100 mentions), staff (115) and photos (35) carry the result.
- **The test set was looked at twice.** The first score was macro-F1 0.398 against the baseline's 0.424, with 95 false
  aspects. The diagnosis: the synthetic data had no remarks about the place, decor or parking, which 40% of real reviews
  are made of. Adding such remarks to the synthetic fragments, and teaching the model from the labelled training reviews
  that mention no aspect, gave the scores above. A test set used to choose a change is less independent than one scored
  once.
- Non-English: 7 of 15 mentioned labels right (baseline 6); 10 reviews are too few to say more.

**Synthetic check:** 600 reviews built from a fifth of the fragments kept out of training: macro-F1 0.583 against
0.544 for the baseline. It only shows the model handles phrasings it hasn't seen, and the same hand wrote both.

**Second labeller (ready, not yet done):** `python -m shevent_ml.reviews.model --second-sheet` writes the 150 test
reviews with no labels; a person fills them in without seeing the first labels and saves
`data/splits/review_labels_second.csv`; `--second` then scores the model and the baseline on their labels and reports
Cohen's kappa between the two labellers per aspect (`ml/artifacts/review_insights/second_labeller.json`).

## Limitations

- The real test labels are by an AI assistant and the test set was used to choose one change (see above).
- Tone is the weak part, especially negation ("no hidden charges" is praise) and sarcasm.
- Long reviews pick up stray aspects; the aspect threshold (0.3) was tuned on the synthetic check, not on real text.
- The synthetic fragments and the word lists were written by the same person, so the synthetic check flatters the
  word lists.
- Reviews don't carry dates, so the planned weighting towards recent reviews can't be applied.

## Serving

`/v1/reviews/insights` takes a vendor id and reads that vendor's collected reviews (`data/processed/reviews.parquet`,
read once at startup). It returns praise and complaint counts per aspect (a mixed review counts in both) and pros and
cons, each needing at least two reviews, so one review or one misreading doesn't become a headline. Cons are worded as
"Some reviews mention late arrival", never as an accusation.

## Synthetic reviews

Training only. No synthetic review names a vendor or person, none is linked to a vendor, and none is ever shown in the
apps. The model is scored on real reviews only.

## Licences

| Component | Licence |
|---|---|
| scikit-learn, SciPy, joblib | BSD-3-Clause |
| Synthetic fragments and word lists | Written by this project |
| Collected reviews | Public reviews on vendor directories; internal testing only |

## Reproduce

```
cd ml && python -m shevent_ml.reviews.synthetic          # optional: write 3,000 synthetic reviews to look at
cd ml && python -m shevent_ml.reviews.model --sheet      # labelling sheet for the real reviews
cd ml && python -m shevent_ml.reviews.model              # train and score
```
