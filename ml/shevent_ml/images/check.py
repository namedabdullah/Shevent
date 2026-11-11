"""#7 Verified Portfolios for one uploaded photo: style tags, and whether it copies another vendor's photo.

The server loads one PortfolioChecker at startup (POST /v1/portfolio/check). It compares the upload with every
collected photo in data/processed/image_index.parquet and image_embeddings.npy (python -m shevent_ml.images.build):

- duplicate: the same file (MD5), or a pHash within phash_max_distance bits either way round (mirror images too), of
  a photo from another vendor. pHash survives resizing, recompression, filters, watermarks and added frames.
- possible_duplicate: no such match, but a CLIP similarity of clip_min_similarity or more with another vendor's
  photo. CLIP also survives crops, but it matches different photos of the same scene too, hence the softer label.
- unique: neither.

The uploader's own photos never count: a vendor posting their own photo twice copies nobody. Tags are CLIP zero-shot
over the prompt groups in configs/images.yaml: each tag is scored against the others in its group.
"""

import io

import numpy as np
from PIL import Image, ImageOps

from shevent_ml.config import load_config
from shevent_ml.images.hashing import file_md5_bytes, hamming_matrix, perceptual_hashes

# Refuse decompression bombs: real portfolio photos are far below this.
Image.MAX_IMAGE_PIXELS = 50_000_000
MAX_MATCHES = 5


class PortfolioChecker:
    def __init__(self, index, embeddings, embedder, settings=None, vendor_ids=None):
        """index: image_index rows (media_id, vendor_id, found, md5, phash, phash_mirror, embedding_row); embeddings:
        their CLIP vectors; embedder: a ClipEmbedder. vendor_ids maps a research vendor_id to the id the app uses."""
        settings = settings or load_config("images")
        self.duplicates, tags = settings["duplicates"], settings["tags"]
        rows = index[index["found"].astype(bool)].reset_index(drop=True)
        self.media_ids = rows["media_id"].to_numpy()
        self.vendor_ids = rows["vendor_id"].map(vendor_ids or (lambda v: v)).to_numpy()
        self.md5s = rows["md5"].to_numpy()
        self.phashes, self.mirrors = rows["phash"].tolist(), rows["phash_mirror"].tolist()
        self.vectors = embeddings[rows["embedding_row"].astype(int).to_numpy()]
        self.embedder = embedder
        self.min_score, self.max_tags = tags["min_score"], tags["max_tags"]
        self.groups = []
        for group in tags["groups"].values():
            prompts = [tags["prompt"].format(text) for text in group.values()]
            self.groups.append((list(group), embedder.embed_texts(prompts)))

    @property
    def version(self):
        return f"portfolio-v1/{self.embedder.version}"

    def tags(self, vector):
        """Each group's tags scored with a softmax over CLIP's scaled similarities (scores in a group add to 1)."""
        found = []
        for labels, texts in self.groups:
            logits = 100.0 * (texts @ vector)
            scores = np.exp(logits - logits.max())
            scores /= scores.sum()
            found += [(label, float(score)) for label, score in zip(labels, scores, strict=True)]
        kept = sorted((t for t in found if t[1] >= self.min_score), key=lambda t: -t[1])[: self.max_tags]
        return [{"label": label, "score": round(score, 3)} for label, score in kept]

    def check(self, data, vendor_id):
        """data: the uploaded file's bytes. Raises ValueError if it isn't a readable image."""
        try:
            with Image.open(io.BytesIO(data)) as raw:
                image = ImageOps.exif_transpose(raw).convert("RGB")
        except (OSError, ValueError, Image.DecompressionBombError) as error:
            raise ValueError("not a readable image (JPEG, PNG or WebP, under 50 megapixels)") from error
        hashes = perceptual_hashes(image)
        vector = self.embedder.embed_images([image])[0]

        others = self.vendor_ids != vendor_id
        upright = hamming_matrix([hashes["phash"]], self.phashes)[0]
        distance = np.minimum(upright, hamming_matrix([hashes["phash_mirror"]], self.phashes)[0])
        similarity = self.vectors @ vector
        same_file = self.md5s == file_md5_bytes(data)
        copied = others & (same_file | (distance <= self.duplicates["phash_max_distance"]))
        alike = others & (similarity >= self.duplicates["clip_min_similarity"])
        status = "duplicate" if copied.any() else "possible_duplicate" if alike.any() else "unique"
        flagged = np.flatnonzero(copied | alike)
        flagged = flagged[np.lexsort((-similarity[flagged], distance[flagged]))][:MAX_MATCHES]
        matches = [
            {
                "media_id": str(self.media_ids[i]),
                "vendor_id": str(self.vendor_ids[i]),
                "phash_distance": int(distance[i]),
                "clip_similarity": round(float(similarity[i]), 4),
            }
            for i in flagged
        ]
        return {
            "tags": self.tags(vector),
            "duplicate": {"status": status, "matches": matches},
            "phash": hashes["phash"],
            "model_version": self.version,
        }
