"""Download the collected portfolio images into data/images/<vendor_id>/<file_name>.

    python -m shevent_ml.images.download            # every image in data/raw/portfolio_media.csv not already saved
    python -m shevent_ml.images.download --limit 20

Images are public portfolio photos, saved for internal model testing only (data/images/ is git-ignored). A file that's
already there is skipped, so a run can be repeated after a dropped connection. Each request waits `delay` seconds
after the last one, to go easy on the image host. Failures are listed at the end and leave no partial file.
"""

import argparse
import sys
import time
from pathlib import Path

import httpx

from shevent_ml.config import IMAGES_DIR, RAW_DIR
from shevent_ml.data.load import read_export_csv

USER_AGENT = "Shevent capstone research (portfolio duplicate detection)"
# The first bytes of JPEG, PNG and GIF files.
SIGNATURES = [bytes.fromhex("ffd8ff"), bytes.fromhex("89504e470d0a1a0a"), b"GIF8"]


def is_image(content, content_type):
    """By the declared type, or by the first bytes: image hosts sometimes send photos as application/octet-stream."""
    if content_type.startswith("image/"):
        return True
    webp = content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return webp or any(content.startswith(signature) for signature in SIGNATURES)


def download(media, images_dir=IMAGES_DIR, delay=0.3, client=None, log=print):
    """Saves each row's source_url as images_dir/vendor_id/file_name. Returns (saved, skipped, failures)."""
    client = client or httpx.Client(timeout=30, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    saved, skipped, failures = 0, 0, []
    for i, row in enumerate(media.itertuples(index=False), 1):
        path = images_dir / row.vendor_id / row.file_name
        if path.exists() and path.stat().st_size:
            skipped += 1
            continue
        try:
            response = client.get(row.source_url)
            response.raise_for_status()
            if not is_image(response.content, response.headers.get("content-type", "")):
                raise ValueError(f"not an image ({response.headers.get('content-type')})")
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".part")
            tmp.write_bytes(response.content)
            tmp.replace(path)
            saved += 1
        except (httpx.HTTPError, ValueError) as error:
            failures.append((row.media_id, str(error)[:120]))
        if i % 50 == 0:
            log(f"  {i}/{len(media)}: {saved} saved, {skipped} already there, {len(failures)} failed")
        time.sleep(delay)
    return saved, skipped, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--media", type=Path, default=RAW_DIR / "portfolio_media.csv")
    parser.add_argument("--images", type=Path, default=IMAGES_DIR)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--delay", type=float, default=0.3, help="seconds between requests")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    media = read_export_csv(args.media)
    media = media[media["source_url"].str.startswith("http")].head(args.limit)
    saved, skipped, failures = download(media, args.images, args.delay)
    print(f"{saved} images saved to {args.images}, {skipped} already there, {len(failures)} failed")
    for media_id, reason in failures:
        print(f"  {media_id}: {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
