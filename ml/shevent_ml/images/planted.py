"""The planted-duplicate test set: altered copies of collected photos, each labelled with the photo it came from.

    python -m shevent_ml.images.planted            # needs data/processed/image_index.parquet
    python -m shevent_ml.images.planted --force    # choose new originals
    python -m shevent_ml.images.planted --no-clip  # hashes only

A vendor who reuses another vendor's photo rarely posts the exact file: they crop it, resize it, filter it, add
their own watermark or mirror it. Each chosen original gets one copy per transform in data/images/planted/, and
the copies are hashed and embedded like the collection (planted_index.parquet, planted_embeddings.npy). The chosen
originals are committed in data/splits/planted_duplicates.csv, so the test set stays fixed as more photos arrive.
"""

import argparse
import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

from shevent_ml.config import IMAGES_DIR, PROCESSED_DIR, SEED, SPLITS_DIR, load_config
from shevent_ml.images.build import index_images, load_embedder

PLANTED_FILE = SPLITS_DIR / "planted_duplicates.csv"


def _crop(image, s):
    left, top, right, bottom = s["crop_box"]
    w, h = image.size
    return image.crop((round(w * left), round(h * top), round(w * right), round(h * bottom)))


def _resize(image, s):
    w, h = image.size
    scale = s["resize_scale"]
    return image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)


def _jpeg(image, s):
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=s["jpeg_quality"])
    return Image.open(buffer).convert("RGB")


def _colour(image, s):
    c = s["colour"]
    image = ImageEnhance.Brightness(image).enhance(c["brightness"])
    image = ImageEnhance.Contrast(image).enhance(c["contrast"])
    return ImageEnhance.Color(image).enhance(c["saturation"])


def _grayscale(image, s):
    return ImageOps.grayscale(image).convert("RGB")


def _watermark(image, s):
    w, h = image.size
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = ImageFont.load_default(size=max(12, h // 14))
    text = s["watermark_text"]
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    margin = max(4, w // 40)
    draw.text(
        (w - (right - left) - margin, h - (bottom - top) - 2 * margin), text, font=font, fill=(255, 255, 255, 170)
    )
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def _border(image, s):
    return ImageOps.expand(image, border=round(max(image.size) * s["border"]), fill="white")


def _mirror(image, s):
    return ImageOps.mirror(image)


def _repost(image, s):
    """What a reposting vendor typically does: crop, filter and stamp their own handle."""
    return _watermark(_colour(_crop(image, s), s), s)


TRANSFORMS = {
    "crop": _crop,
    "resize": _resize,
    "jpeg": _jpeg,
    "colour": _colour,
    "grayscale": _grayscale,
    "watermark": _watermark,
    "border": _border,
    "mirror": _mirror,
    "repost": _repost,
}


def choose_originals(index, n, seed=SEED):
    """n readable photos, spread over as many vendors as possible (one per vendor before any vendor gets two)."""
    rng = np.random.default_rng(seed)
    found = index[index["found"]].sample(frac=1, random_state=rng.integers(2**31))
    turn = found.groupby("vendor_id").cumcount()
    return found.assign(_turn=turn).sort_values("_turn", kind="stable")["media_id"].head(n).tolist()


def make_planted(
    processed_dir=PROCESSED_DIR,
    images_dir=IMAGES_DIR,
    planted_file=PLANTED_FILE,
    force=False,
    use_clip=True,
    settings=None,
):
    settings = settings or load_config("images")
    s = settings["planted"]
    index = pd.read_parquet(processed_dir / "image_index.parquet")
    if planted_file.exists() and not force:
        plan = pd.read_csv(planted_file, dtype=str)
    else:
        originals = choose_originals(index, s["originals"])
        plan = pd.DataFrame(
            [(m, t) for m in originals for t in s["transforms"]], columns=["source_media_id", "transform"]
        )
        planted_file.parent.mkdir(parents=True, exist_ok=True)
        plan.to_csv(planted_file, index=False)

    sources = index.set_index("media_id")
    out_dir = images_dir / "planted"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for media_id, transform in plan.itertuples(index=False):
        if media_id not in sources.index or not sources.at[media_id, "found"]:
            continue  # the original was removed from the collection since the plan was made
        copy_id = f"{media_id}~{transform}"
        path = out_dir / f"{copy_id}.jpg"
        with Image.open(sources.at[media_id, "path"]) as original:
            copy = TRANSFORMS[transform](ImageOps.exif_transpose(original).convert("RGB"), s)
        copy.save(path, "JPEG", quality=s["jpeg_quality"] if transform == "jpeg" else 95)
        rows.append({"copy_id": copy_id, "source_media_id": media_id, "transform": transform, "path": path})

    planted, embeddings = index_images(pd.DataFrame(rows), load_embedder(use_clip), settings["clip"]["batch_size"])
    planted.to_parquet(processed_dir / "planted_index.parquet", index=False)
    np.save(processed_dir / "planted_embeddings.npy", embeddings)
    return planted


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--processed", type=Path, default=PROCESSED_DIR, help="the built dataset")
    parser.add_argument("--images", type=Path, default=IMAGES_DIR, help="folder with one subfolder per vendor")
    parser.add_argument("--force", action="store_true", help="choose new originals (changes the test set)")
    parser.add_argument("--no-clip", action="store_true", help="hashes only, no CLIP embeddings")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    planted = make_planted(args.processed, args.images, force=args.force, use_clip=not args.no_clip)
    originals = planted["source_media_id"].nunique()
    print(f"{len(planted)} planted copies of {originals} photos written to {args.images / 'planted'}")
    print(f"Originals are fixed in {PLANTED_FILE}; commit it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
