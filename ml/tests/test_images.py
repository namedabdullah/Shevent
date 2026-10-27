import numpy as np
import pandas as pd
import pytest
from PIL import Image, ImageDraw

from shevent_ml.config import load_config
from shevent_ml.images.build import image_path, index_images
from shevent_ml.images.duplicates import evaluate, md5_pairs, phash_pairs
from shevent_ml.images.hashing import hamming_matrix, open_image, perceptual_hashes
from shevent_ml.images.planted import TRANSFORMS, choose_originals, make_planted

SETTINGS = load_config("images")


def scene(seed, size=(480, 360)):
    """A made-up photo: a gradient with coloured shapes, so it has the low-frequency structure real photos have."""
    rng = np.random.default_rng(seed)
    w, h = size
    ramp = np.linspace(0, 1, w)[None, :, None] * rng.uniform(60, 200, 3) + rng.uniform(0, 50, 3)
    image = Image.fromarray(np.broadcast_to(ramp, (h, w, 3)).astype(np.uint8))
    draw = ImageDraw.Draw(image)
    for _ in range(6):
        x0, y0 = rng.integers(0, w - 60), rng.integers(0, h - 60)
        box = (x0, y0, x0 + rng.integers(40, w // 2), y0 + rng.integers(40, h // 2))
        colour = tuple(int(c) for c in rng.integers(0, 255, 3))
        (draw.ellipse if rng.random() < 0.5 else draw.rectangle)(box, fill=colour)
    return image


@pytest.fixture
def collection(tmp_path):
    """Six vendors with two photos each, one missing file, one broken file and one exact repost."""
    images = tmp_path / "images"
    rows = []
    for v in range(6):
        vendor = f"DEC-{v:03}"
        (images / vendor).mkdir(parents=True)
        for k in range(2):
            name = f"{vendor}_{k + 1:02}.jpg"
            scene(v * 10 + k).save(images / vendor / name, quality=92)
            rows.append({"media_id": f"M-{len(rows) + 1:04}", "vendor_id": vendor, "file_name": name})
    # DEC-005 posts DEC-000's first photo byte for byte.
    (images / "DEC-005" / "DEC-005_03.jpg").write_bytes((images / "DEC-000" / "DEC-000_01.jpg").read_bytes())
    rows.append({"media_id": "M-0013", "vendor_id": "DEC-005", "file_name": "DEC-005_03.jpg"})
    rows.append({"media_id": "M-0014", "vendor_id": "DEC-005", "file_name": "DEC-005_04.jpg"})  # never saved
    (images / "DEC-004" / "DEC-004_03.jpg").write_text("not an image")
    rows.append({"media_id": "M-0015", "vendor_id": "DEC-004", "file_name": "DEC-004_03.jpg"})
    media = pd.DataFrame(rows)
    paths = [image_path(images, v, f) for v, f in zip(media.vendor_id, media.file_name, strict=True)]
    return images, media.assign(path=paths)


class FakeEmbedder:
    """Stands in for CLIP: a fixed vector per image size, so tests need no model."""

    version = "fake/0"

    def __init__(self):
        self.batches = []

    def embed_images(self, images):
        self.batches.append(len(images))
        vectors = np.array([[im.width, im.height, 1.0] for im in images], dtype=np.float32)
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def test_hamming_matrix_matches_imagehash():
    hashes = [perceptual_hashes(scene(s))["phash"] for s in range(3)]
    import imagehash

    expected = [[imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b) for b in hashes] for a in hashes]
    assert hamming_matrix(hashes).tolist() == expected


def test_perceptual_hash_survives_resizing_but_not_a_different_photo():
    image = scene(1)
    small = image.resize((240, 180))
    distance = hamming_matrix([perceptual_hashes(im)["phash"] for im in (image, small, scene(2))])
    assert distance[0, 1] <= 4
    assert distance[0, 2] > 16


def test_index_records_missing_and_broken_files(collection):
    _, media = collection
    embedder = FakeEmbedder()
    index, embeddings = index_images(media, embedder, batch_size=5)
    by_id = index.set_index("media_id")
    assert by_id.at["M-0014", "error"] == "file not found"
    assert by_id.at["M-0015", "error"].startswith("unreadable")
    assert not by_id.loc[["M-0014", "M-0015"], "found"].any()
    found = index[index["found"]]
    assert len(found) == 13 and found["phash"].str.len().eq(16).all()
    # Embedding rows count only the readable images, in order, and batches are capped at batch_size.
    assert found["embedding_row"].tolist() == list(range(13))
    assert by_id.at["M-0014", "embedding_row"] == -1
    assert embeddings.shape == (13, 3) and max(embedder.batches) <= 5
    assert by_id.at["M-0001", "md5"] == by_id.at["M-0013", "md5"]


def test_every_transform_makes_a_different_file_of_the_same_photo():
    image = scene(3)
    for name, transform in TRANSFORMS.items():
        copy = transform(image, SETTINGS["planted"])
        assert copy.mode == "RGB", name
        assert np.asarray(copy).shape != np.asarray(image).shape or not np.array_equal(copy, image), name


def test_originals_are_spread_over_vendors():
    index = pd.DataFrame({"media_id": [f"M{i}" for i in range(8)], "vendor_id": list("AAAAABCD"), "found": True})
    chosen = choose_originals(index, 4, seed=1)
    assert sorted(index.set_index("media_id").loc[chosen, "vendor_id"]) == ["A", "B", "C", "D"]


def test_planted_set_is_frozen_and_scored(collection, tmp_path):
    images, media = collection
    processed = tmp_path / "processed"
    processed.mkdir()
    index, embeddings = index_images(media)
    index.to_parquet(processed / "image_index.parquet")
    settings = {**SETTINGS, "planted": {**SETTINGS["planted"], "originals": 4}}
    plan_file = tmp_path / "splits" / "planted_duplicates.csv"

    planted = make_planted(processed, images, plan_file, use_clip=False, settings=settings)
    assert len(planted) == 4 * len(TRANSFORMS) and planted["found"].all()
    assert (images / "planted" / f"{planted['copy_id'][0]}.jpg").exists()
    plan = pd.read_csv(plan_file)
    # Running again keeps the same originals, even with a different count in the settings.
    settings["planted"]["originals"] = 2
    again = make_planted(processed, images, plan_file, use_clip=False, settings=settings)
    assert set(again["source_media_id"]) == set(plan["source_media_id"])

    report = evaluate(index, embeddings, planted, np.zeros((0, 0), np.float32), settings)
    md5 = report["md5 (baseline)"]
    assert md5["recall"] == 0  # every copy is a new file
    # The exact repost between vendors is listed for review; it has no label, so it isn't scored.
    assert md5["real_pairs"] == [("M-0001", "M-0013")]
    assert np.isnan(md5["precision"])
    phash = report[f"phash <= {SETTINGS['duplicates']['phash_max_distance']}"]
    assert phash["recall_by_transform"]["resize"] == 1 and phash["recall_by_transform"]["jpeg"] == 1
    assert phash["recall"] > md5["recall"]
    assert phash["precision"] > 0.9
    assert "clip" not in " ".join(report)  # no embeddings, no CLIP finder


def test_pair_finders():
    ids = ["a", "b", "c"]
    assert md5_pairs(ids, ["x", "y", "x"]) == {("a", "c")}
    same = perceptual_hashes(scene(5))["phash"]
    assert phash_pairs(ids, [same, perceptual_hashes(scene(6))["phash"], same], 0) == {("a", "c")}


def test_open_image_applies_exif_rotation(tmp_path):
    path = tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # stored sideways: rotate 90 degrees to view
    scene(4, (300, 200)).save(path, exif=exif)
    assert open_image(path).size == (200, 300)


@pytest.mark.clip
def test_clip_embeddings_and_text():
    # Plumbing only. How well CLIP matches altered copies is measured on real photos (images.duplicates): on these
    # made-up gradient-and-shapes scenes every picture looks alike to CLIP.
    from shevent_ml.images.embed import ClipEmbedder

    embedder = ClipEmbedder()
    image = scene(8)
    vectors = embedder.embed_images([image, TRANSFORMS["resize"](image, SETTINGS["planted"]), scene(9)])
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-4)
    similarity = vectors @ vectors.T
    assert similarity[0, 1] > 0.9
    assert similarity[0, 1] > similarity[0, 2]
    texts = embedder.embed_texts(["a photo of a wedding stage", "a photo of food on a buffet"])
    assert texts.shape == (2, vectors.shape[1])
