# Model Card: #7 Verified Portfolios (duplicate photos)

| | |
|---|---|
| Version | Rules in `ml/shevent_ml/images/hashing.py` and `duplicates.py`, thresholds in `ml/configs/images.yaml` |
| Code | `ml/shevent_ml/images/` (`download.py`, `build.py`, `hashing.py`, `planted.py`, `duplicates.py`) |
| Served by | Not yet (`/v1/portfolio/check` is in the API contract; the apps don't show it) |
| Owner | ML lead |

## What it does

Finds a vendor's portfolio photo that is a copy of another photo, even when it has been resized, recompressed,
colour-filtered, turned grey, watermarked, framed or mirrored to hide that. The planned second half, style tags with
CLIP ("floral stage", "fairy lights"), isn't built: its 600 MB model didn't download on the available connection.

## Method

Not trained: perceptual hashing, tuned on known disguises.

1. **MD5** (the baseline) matches byte-identical files only.
2. **pHash:** a 64-bit fingerprint of what the photo looks like at low resolution. Two photos within 10 bits are a
   likely copy.
3. **Frames:** a plain band of one colour on all four sides is trimmed before hashing. Only all four sides count, so a
   sky or a gradient along one edge isn't cut.
4. **Mirror images:** each photo is also hashed mirrored, and a pair matches if either orientation does.

## Data

541 portfolio photos from 113 Lahore vendors' public galleries (one link was broken), downloaded with
`python -m shevent_ml.images.download` into the git-ignored `data/images/`, for internal testing only.

**Planted-duplicate test set:** 100 of those photos (fixed in `data/splits/planted_duplicates.csv`), each copied with
nine disguises a vendor might use: crop, resize, heavy JPEG, colour filter, grayscale, watermark, white border, mirror,
and a "repost" that combines crop, filter and watermark. 900 copies in all.

## Evaluation

| Finder | Precision | Recall | Border | Colour | Crop | Grey | JPEG | Mirror | Repost | Resize | Watermark |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MD5 (baseline) | n/a | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pHash, plain | 100% | 56% | 0% | 100% | 2% | 100% | 100% | 0% | 1% | 100% | 100% |
| **pHash + frame trim + mirror** | **100%** | **78%** | 99% | 100% | 2% | 100% | 100% | 100% | 1% | 100% | 99% |

Recall is per planted copy (was it paired with the photo it came from); precision is over flagged pairs that involve a
planted copy, the only ones with a known answer. The frame and mirror steps were added after seeing the plain pHash
misses on this set; they target disguises named in the plan, not anything particular to these photos.

**On the real collection** it flags 10 pairs for a person to check, three of them across vendors:

- a caterer and a venue showing three byte-identical photos (the data lead had noted them);
- a photographer and a venue showing the same photo in different files, which MD5 couldn't match: the venue may be
  showing the photographer's work, credited or not.

## Limitations

- **Crops and reposts are missed** (1-2%): a crop changes the low-resolution picture. CLIP embeddings would catch them.
- A match means "these look like the same photo", not "this vendor copied": a venue may legitimately show a
  photographer's photo of an event held there. Matches go to a person to check, never to an automatic penalty.
- Two different photos of the same plain stage could hash close; precision on the planted set (100%) doesn't prove
  that can't happen on real galleries.

## Licences

| Component | Licence |
|---|---|
| imagehash | BSD-2-Clause |
| Pillow | HPND |
| Portfolio photos | Public vendor galleries; internal testing only, never redistributed |

## Reproduce

```
cd ml && python -m shevent_ml.images.download
cd ml && python -m shevent_ml.images.build --no-clip
cd ml && python -m shevent_ml.images.planted --no-clip
cd ml && python -m shevent_ml.images.duplicates
```
