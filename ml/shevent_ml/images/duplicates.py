"""Find likely copies of the same photo, and score each finder on the planted-duplicate set.

    python -m shevent_ml.images.duplicates      # needs image_index and planted_index in data/processed/

Finders: MD5 exact match (the baseline #7 must beat), pHash distance and CLIP cosine similarity, at the starting
thresholds in configs/images.yaml. Recall is per planted copy: was it paired with the photo it came from? Precision
is over flagged pairs that involve a planted copy, the only pairs with a known answer. Byte-identical collected files
count as one photo. Other flagged pairs of two collected photos may be real reposts or false alarms: they are written
to duplicate_candidates.csv for someone to check, and are not scored.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import PROCESSED_DIR, load_config
from shevent_ml.images.hashing import hamming_matrix


def pairs_from(ids, close):
    """Index pairs (i < j) where the boolean matrix is True, as (id_a, id_b) tuples."""
    a, b = np.nonzero(np.triu(close, k=1))
    return {(ids[i], ids[j]) for i, j in zip(a, b, strict=True)}


def md5_pairs(ids, md5s):
    md5s = np.asarray(md5s)
    return pairs_from(ids, md5s[:, None] == md5s[None, :])


def phash_pairs(ids, phashes, max_distance):
    return pairs_from(ids, hamming_matrix(list(phashes)) <= max_distance)


def clip_pairs(ids, embeddings, min_similarity):
    return pairs_from(ids, embeddings @ embeddings.T >= min_similarity)


def _photos(index, embeddings, planted, planted_embeddings):
    """Collected photos and planted copies in one table, each with the photo it shows ("group")."""
    real = index[index["found"]]
    copies = planted[planted["found"]]
    # Byte-identical files are certainly the same photo, so they share a group.
    real_group = dict(zip(real["media_id"], real.groupby("md5")["media_id"].transform("first"), strict=True))
    photos = pd.concat(
        [
            pd.DataFrame(
                {
                    "id": real["media_id"],
                    "group": real["media_id"].map(real_group),
                    "source_id": "",
                    "transform": "",
                    "md5": real["md5"],
                    "phash": real["phash"],
                    "embedding_row": real["embedding_row"],
                    "source": "real",
                }
            ),
            pd.DataFrame(
                {
                    "id": copies["copy_id"],
                    "group": copies["source_media_id"].map(real_group),
                    "source_id": copies["source_media_id"],
                    "transform": copies["transform"],
                    "md5": copies["md5"],
                    "phash": copies["phash"],
                    "embedding_row": copies["embedding_row"],
                    "source": "planted",
                }
            ),
        ],
        ignore_index=True,
    )
    vectors = None
    if len(embeddings) and len(planted_embeddings) and (photos["embedding_row"] >= 0).all():
        offset = np.where(photos["source"] == "planted", len(embeddings), 0)
        vectors = np.concatenate([embeddings, planted_embeddings])[photos["embedding_row"] + offset]
    return photos, vectors


def score(found, photos):
    group = dict(zip(photos["id"], photos["group"], strict=True))
    real = set(photos.loc[photos["source"] == "real", "id"])
    labelled = {pair for pair in found if pair[0] not in real or pair[1] not in real}
    correct = {pair for pair in labelled if group[pair[0]] == group[pair[1]]}
    found_ids = {frozenset(pair) for pair in found}
    copies = photos[photos["source"] == "planted"]
    caught = pd.Series(
        [frozenset((c, s)) in found_ids for c, s in zip(copies["id"], copies["source_id"], strict=True)],
        index=copies.index,
    )
    return {
        "pairs_flagged": len(found),
        "precision": len(correct) / len(labelled) if labelled else float("nan"),
        "recall": float(caught.mean()) if len(caught) else float("nan"),
        "recall_by_transform": caught.groupby(copies["transform"]).mean().round(3).to_dict(),
        "real_pairs": sorted(pair for pair in found if pair[0] in real and pair[1] in real),
    }


def evaluate(index, embeddings, planted, planted_embeddings, settings=None):
    settings = (settings or load_config("images"))["duplicates"]
    photos, vectors = _photos(index, embeddings, planted, planted_embeddings)
    ids = photos["id"].tolist()
    finders = {
        "md5 (baseline)": md5_pairs(ids, photos["md5"]),
        f"phash <= {settings['phash_max_distance']}": phash_pairs(ids, photos["phash"], settings["phash_max_distance"]),
    }
    if vectors is not None:
        finders[f"clip >= {settings['clip_min_similarity']}"] = clip_pairs(
            ids, vectors, settings["clip_min_similarity"]
        )
    return {name: score(found, photos) for name, found in finders.items()}


def load(processed_dir):
    return (
        pd.read_parquet(processed_dir / "image_index.parquet"),
        np.load(processed_dir / "image_embeddings.npy"),
        pd.read_parquet(processed_dir / "planted_index.parquet"),
        np.load(processed_dir / "planted_embeddings.npy"),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    report = evaluate(*load(args.processed))
    candidates = sorted({pair for result in report.values() for pair in result.pop("real_pairs")})
    pd.DataFrame(candidates, columns=["media_id_a", "media_id_b"]).to_csv(
        args.processed / "duplicate_candidates.csv", index=False
    )
    (args.processed / "duplicate_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    def pct(value):
        return "n/a" if np.isnan(value) else f"{value:.0%}"

    transforms = sorted({t for result in report.values() for t in result["recall_by_transform"]})
    print(f"{'finder':<16} {'precision':>9} {'recall':>7}  " + " ".join(f"{t[:9]:>9}" for t in transforms))
    for name, r in report.items():
        by = r["recall_by_transform"]
        print(
            f"{name:<16} {pct(r['precision']):>9} {pct(r['recall']):>7}  "
            + " ".join(f"{pct(by.get(t, np.nan)):>9}" for t in transforms)
        )
    print(f"\n{len(candidates)} pairs of collected photos flagged for review in duplicate_candidates.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
