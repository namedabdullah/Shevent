# Model Card: #7 Verified Portfolios (duplicate photos)

| | |
|---|---|
| Version | Rules in `ml/shevent_ml/images/hashing.py` and `duplicates.py`, thresholds and the CLIP model in `ml/configs/images.yaml` |
| Code | `ml/shevent_ml/images/` (`download.py`, `build.py`, `hashing.py`, `planted.py`, `duplicates.py`) |
| Served by | `POST /v1/portfolio/check` (a photo upload; the apps don't call it yet) |
| Owner | ML lead |

## What it does

Finds a vendor's portfolio photo that is a copy of another photo, even when it has been resized, recompressed,
colour-filtered, turned grey, watermarked, framed, mirrored or cropped to hide that, and tags the photo's scene and
style ("stage", "floral", "fairy lights") so hosts could filter portfolios by look.

## Method

Not trained: two finders, each catching what the other misses. A pair is flagged when either matches.

1. **MD5** (the baseline) matches byte-identical files only.
2. **pHash:** a 64-bit fingerprint of what the photo looks like at low resolution; two photos within 10 bits are a
   likely copy. Before hashing, a plain band of one colour on two opposite sides (a white border, a phone screenshot's
   black bars) is trimmed; a band on one side only, like a sky, is left. Each photo is also hashed mirrored, and a
   pair matches if either orientation does.
3. **CLIP:** OpenCLIP ViT-B/32 image embeddings; a cosine similarity of 0.92 or more is a likely copy. It survives
   crops, which change pHash's low-resolution picture.

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
| pHash, plain (first run) | 100% | 56% | 0% | 100% | 2% | 100% | 100% | 0% | 1% | 100% | 100% |
| pHash + trimming + mirror | 100% | 77% | 92% | 100% | 2% | 100% | 100% | 100% | 1% | 100% | 97% |
| CLIP >= 0.92 | 100% | 56% | 14% | 90% | 61% | 2% | 94% | 90% | 5% | 89% | 59% |
| **pHash or CLIP** | **100%** | **85%** | 94% | 100% | 62% | 100% | 100% | 100% | 6% | 100% | 100% |

Recall is per planted copy (was it paired with the photo it came from); precision is over flagged pairs that involve a
planted copy, the only ones with a known answer. The trimming and mirror steps were added after seeing the plain pHash
misses on this set; they target disguises named in the plan. The thresholds (10 bits, 0.92) are the configured
starting values, not tuned on this set.

**On the real collection** it flags 14 pairs for a person to check. Checked by eye where it mattered:

- **3 across vendors, all true:** a caterer and a venue showing the same three photos, byte for byte (the data lead
  had noted them).
- **5 within one vendor, true:** the same photo posted twice in one gallery.
- **6 within one vendor, found by CLIP alone, not copies:** of the two looked at, one is two angles of the same hall
  and the other two frames of the same moment. CLIP at 0.92 means "same scene", which a photographer's own burst or a
  venue's several angles also are.

So 8 of the 14 are real copies. An earlier version also flagged a bride's portrait and a stage as a cross-vendor match:
both were phone screenshots, and pHash saw mostly the black bars. Trimming bars on two opposite sides removed that
false alarm (the two now hash 32 bits apart). In the app, only cross-vendor matches would be worth showing.

**Style tags:** CLIP zero-shot, two groups of prompts in `ml/configs/images.yaml`: scene (stage, entrance,
seating, food, portrait, guests, venue) and style (floral, fairy lights, mehndi colours, red and gold, pastel, white
and green). Each tag is scored against the others in its group; tags at 0.3 or more are kept, at most four. On 12 real
photos chosen at random across vendor types and checked by eye (by an AI assistant, not the data lead): the scene tag
was right for 11, the style tags 12 times out of 16; 23 of 29 tags (79%) in all. Misses: "fairy lights" for a
chandelier, "pastel" for bright mehndi ribbons, style tags on a studio portrait.

## Serving

`/v1/portfolio/check` takes a vendor id and a photo (up to 10 MB and 50 megapixels) and returns the tags, a duplicate
status and up to five matching photos. **duplicate**: the same file or a pHash match with another vendor's photo;
**possible_duplicate**: only CLIP finds one; **unique**: neither. The uploader's own photos never count. The server
loads the photo index and CLIP at startup (about 15 s more, about 600 MB), from the local cache, without internet; a
missing index or model makes the endpoint answer 503. A check takes about 0.2 s once warm.

## Limitations

- **Reposts (crop + filter + watermark together) are still missed** (6%).
- **CLIP's real precision is lower than on the planted set:** it also matches different photos of the same scene.
- A match means "these look like the same photo", not "this vendor copied": a venue may legitimately show a
  photographer's photo of an event held there. Matches go to a person to check, never to an automatic penalty.
- Style tags are judged on 12 photos only, by an AI assistant; a scene's tags compete, so a photo of a stage with
  guests on it gets one or the other.
- A photo whose own edge is as dark as screenshot bars (or as light as a white frame) can lose a strip of itself when
  trimmed.

## Licences

| Component | Licence |
|---|---|
| imagehash | BSD-2-Clause |
| Pillow | HPND |
| OpenCLIP code / ViT-B-32 `laion2b_s34b_b79k` weights | MIT / MIT (trained on LAION-2B) |
| Portfolio photos | Public vendor galleries; internal testing only, never redistributed |

## Reproduce

```
cd ml && python -m shevent_ml.images.download
cd ml && python -m shevent_ml.images.build       # --no-clip for hashes only
cd ml && python -m shevent_ml.images.planted
cd ml && python -m shevent_ml.images.duplicates
```
