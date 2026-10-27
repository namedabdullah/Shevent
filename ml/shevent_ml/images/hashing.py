"""Exact and perceptual hashes, for finding copies of the same photo.

MD5 only matches byte-identical files (the baseline). pHash and dHash describe what the photo looks like at low
resolution, so they survive resizing, recompression and mild filters, but not mirroring or heavy cropping.
"""

import hashlib

import imagehash
import numpy as np
from PIL import Image, ImageOps


def file_md5(path):
    return hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()


def open_image(path):
    """The photo as RGB, turned upright the way phones record it (EXIF orientation)."""
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def perceptual_hashes(image):
    return {"phash": str(imagehash.phash(image)), "dhash": str(imagehash.dhash(image))}


def hash_bits(hashes):
    """64-bit hex hashes -> an (n, 64) boolean array."""
    return np.array([imagehash.hex_to_hash(h).hash.ravel() for h in hashes], dtype=bool).reshape(len(hashes), -1)


def hamming_matrix(hashes):
    """Pairwise number of differing bits between hex hashes. 0 is identical; 10 or less is a likely copy."""
    bits = hash_bits(hashes).astype(np.int16)
    # Differing bits = ones in a + ones in b - 2 x shared ones.
    ones = bits.sum(axis=1)
    return ones[:, None] + ones[None, :] - 2 * bits @ bits.T
