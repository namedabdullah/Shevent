"""Exact and perceptual hashes, for finding copies of the same photo.

MD5 only matches byte-identical files (the baseline). pHash and dHash describe what the photo looks like at low
resolution, so they survive resizing, recompression and mild filters, but not heavy cropping. Two common disguises are
handled on top: a plain frame added around the photo is trimmed before hashing, and a mirrored copy is caught by also
hashing the mirror image (phash_mirror) and comparing both ways.
"""

import hashlib

import imagehash
import numpy as np
from PIL import Image, ImageChops, ImageOps


def file_md5(path):
    return hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()


def open_image(path):
    """The photo as RGB, turned upright the way phones record it (EXIF orientation)."""
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def trim_frame(image, tolerance=24):
    """The photo without a plain frame around it: a band of the corner colour on two opposite sides at least, like a
    white border or a phone screenshot's black bars above and below. A sky or a smooth gradient touches one side only,
    so the photo's own content stays; so does at least a fifth of the picture."""
    background = Image.new(image.mode, image.size, image.getpixel((0, 0)))
    content = ImageChops.difference(image, background).convert("L").point(lambda v: 255 if v > tolerance else 0)
    box = content.getbbox()
    if not box:
        return image
    width, height = image.size
    framed = (box[1] > 0 and box[3] < height) or (box[0] > 0 and box[2] < width)
    kept = (box[2] - box[0]) * (box[3] - box[1])
    return image.crop(box) if framed and kept >= 0.2 * width * height else image


def perceptual_hashes(image):
    framed = trim_frame(image)
    return {
        "phash": str(imagehash.phash(framed)),
        "phash_mirror": str(imagehash.phash(ImageOps.mirror(framed))),
        "dhash": str(imagehash.dhash(framed)),
    }


def hash_bits(hashes):
    """64-bit hex hashes -> an (n, 64) boolean array."""
    return np.array([imagehash.hex_to_hash(h).hash.ravel() for h in hashes], dtype=bool).reshape(len(hashes), -1)


def hamming_matrix(hashes, others=None):
    """Pairwise number of differing bits between hex hashes (between `hashes` and `others` when given). 0 is identical;
    10 or less is a likely copy."""
    a = hash_bits(hashes).astype(np.int16)
    b = a if others is None else hash_bits(others).astype(np.int16)
    # Differing bits = ones in a + ones in b - 2 x shared ones.
    return a.sum(axis=1)[:, None] + b.sum(axis=1)[None, :] - 2 * a @ b.T
