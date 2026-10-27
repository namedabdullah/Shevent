"""Hash and embed every collected portfolio image.

    python -m shevent_ml.images.build              # data/processed/media.parquet + data/images -> image index
    python -m shevent_ml.images.build --no-clip    # hashes only (no torch needed)

Writes data/processed/image_index.parquet (one row per media row: found, md5, phash, dhash, size, embedding_row)
and image_embeddings.npy (row i is the CLIP embedding of the index row whose embedding_row is i). Images that are
missing or unreadable stay in the index with found = False and the reason, so the collection can be fixed.
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from shevent_ml.config import IMAGES_DIR, PROCESSED_DIR, load_config
from shevent_ml.images.hashing import file_md5, open_image, perceptual_hashes

INDEX_COLUMNS = ["found", "error", "md5", "phash", "dhash", "width", "height", "embedding_row"]


def image_path(images_dir, vendor_id, file_name):
    """data/images/<vendor_id>/<file_name>, or data/images/<file_name> if it was saved without a vendor folder."""
    in_folder = images_dir / vendor_id / file_name
    return in_folder if in_folder.exists() else images_dir / file_name


def index_images(rows, embedder=None, batch_size=32):
    """Hashes (and embeds, with an embedder) the image at each row's `path`. Returns (index, embeddings).

    Images are opened a batch at a time, so a thousand phone photos never sit in memory together.
    """
    records = {col: [] for col in INDEX_COLUMNS}
    embeddings = []
    batch = []

    def flush():
        if embedder is not None and batch:
            embeddings.append(embedder.embed_images(batch))
        batch.clear()

    next_row = 0
    for path in rows["path"]:
        record = dict.fromkeys(INDEX_COLUMNS)
        record.update(found=False, error="", embedding_row=-1)
        try:
            image = open_image(Path(path))
        except FileNotFoundError:
            record["error"] = "file not found"
        except OSError as error:  # PIL raises OSError subclasses for broken or unsupported files
            record["error"] = f"unreadable: {error}"
        else:
            record.update(found=True, md5=file_md5(Path(path)), width=image.width, height=image.height)
            record.update(perceptual_hashes(image))
            if embedder is not None:
                record["embedding_row"] = next_row
                next_row += 1
                batch.append(image)
                if len(batch) >= batch_size:
                    flush()
        for col in INDEX_COLUMNS:
            records[col].append(record[col])
    flush()

    index = rows.reset_index(drop=True).assign(**records)
    index["path"] = index["path"].astype(str)
    dim = embeddings[0].shape[1] if embeddings else 0
    return index, np.concatenate(embeddings) if embeddings else np.zeros((0, dim), np.float32)


def load_embedder(use_clip):
    if not use_clip:
        return None
    from shevent_ml.images.embed import ClipEmbedder

    return ClipEmbedder()


def build(processed_dir=PROCESSED_DIR, images_dir=IMAGES_DIR, use_clip=True):
    media_path = processed_dir / "media.parquet"
    if not media_path.exists():
        raise FileNotFoundError(f"{media_path} not found; run python -m shevent_ml.data.build first")
    media = pd.read_parquet(media_path)
    rows = media[["media_id", "vendor_id", "file_name"]].assign(
        path=[image_path(images_dir, v, f) for v, f in zip(media["vendor_id"], media["file_name"], strict=True)]
    )
    embedder = load_embedder(use_clip)
    index, embeddings = index_images(rows, embedder, load_config("images")["clip"]["batch_size"])

    index.to_parquet(processed_dir / "image_index.parquet", index=False)
    np.save(processed_dir / "image_embeddings.npy", embeddings)
    manifest = {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "images": len(index),
        "found": int(index["found"].sum()),
        "clip": embedder.version if embedder else None,
        "errors": index.loc[~index["found"], "error"].value_counts().to_dict(),
    }
    (processed_dir / "image_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return index, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--images", type=Path, default=IMAGES_DIR, help="folder with one subfolder per vendor")
    parser.add_argument("--no-clip", action="store_true", help="hashes only, no CLIP embeddings")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    index, manifest = build(args.processed, args.images, use_clip=not args.no_clip)
    print(f"{manifest['found']} of {manifest['images']} images indexed ({manifest['clip'] or 'no CLIP'})")
    for error, count in manifest["errors"].items():
        print(f"  {count} x {error}")
    missing = index.loc[~index["found"], ["media_id", "path"]].head(10)
    for row in missing.itertuples():
        print(f"  {row.media_id}: {row.path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
