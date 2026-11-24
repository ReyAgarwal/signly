# Tools: how the real-signer reference data was made

The app checks your signing against **`data/reference-hands.json`**: about
6,000 hands of real people signing the 24 static letters. This folder has the
tools that built that file, so anyone can see (and repeat) exactly how it was made.
**The app itself never needs these tools**; they only ran once, with internet,
on a development laptop.

## The datasets

| | Dataset 1 | Dataset 2 |
|--|-----------|-----------|
| Name | *Images of American Sign Language (ASL) Alphabet Gestures* | *American Sign Language Image Dataset (fingerspelling original + keypoints + evaluation)* |
| Authors | Sowrow, Iftekhar, Prova, Huq (East West University) | Cabana Garceran del Vall (CUNEF) |
| Link | https://data.mendeley.com/datasets/48dg9vhmyk/2 | https://data.mendeley.com/datasets/97yd3b5f5h/1 |
| License | CC BY 4.0 | CC BY 4.0 |
| People | 3 (photos 1–500, 501–1000, 1001–1500) | video recordings + a separate test set |
| Photos we sampled | 5,040 (70 per person per letter) | 4,080 (70 + 70 + 30 per letter) |
| Hands MediaPipe found | 3,498 (69%; close-up crops are hard) | 3,885 (95%) |

Full citations are in `data/ATTRIBUTION.md`.

## The steps

1. **Pick photos:** `python3 make_photo_lists.py` writes lists of which photos to sample
   (spread evenly over every person / video so no one dominates).
2. **Download just those photos:** `python3 download_zip_files.py <zip-url> photos <list.json>`.
   Each dataset is a single ~3.5 GB zip; this reads only the needed bytes (~130 MB total).
3. **Find the hands:** open `extract-landmarks.html` through the local server. It runs the
   app's own offline MediaPipe on every photo and saves the 21 hand points per photo.
4. **Build the reference file:** `node build-reference.mjs dataset1.json dataset2.json`.
   It normalizes each hand exactly like the app does, keeps at most 50 samples per letter
   per person, writes `data/reference-hands.json` (only numbers, no photos), and runs
   the fair accuracy test.
5. **Check the diagrams:** `node fit-diagrams.mjs` compares every handshape diagram
   with the real signers (finger bends, thumb position, and whether the coach recognizes
   the drawing) and fits thumb positions. See `js/handPoses.js` for which values it set.
6. **Pick the letter photos** (shown next to the diagrams): with the hand points of
   candidate photos from dataset 1 saved as `tools/landmarks-photos.json`, run
   `node tools/rank-photos.mjs` (most typical photo per person) and then
   `node tools/orient-photos.mjs` (mirror or not, by matching the diagram). The list is in
   `js/letterPhotos.js`. Then, with the original photos in `tools/photos/`, run
   `node tools/crop-photos.mjs`: it cuts away the white bars the dataset added around each
   photo and makes every photo a 300 × 300 square (empty edges filled with a blurred copy),
   so they all look the same size in the app. J and Z (moving letters) are not in the ranking (the coach has
   no answer key for them); their photos were chosen separately and are single moments
   from the movement.

## Results (November 2026)

**Fair test, "leave one person out":** each person's hands were hidden and recognized
using only everyone else's.

| Hidden person / recording | Accuracy |
|---------------------------|----------|
| Dataset 1, person 1 | 87% |
| Dataset 1, person 2 | 71% |
| Dataset 1, person 3 | 73% |
| Dataset 2, main recordings | 87% |
| Dataset 2, test photos | 88% |
| Dataset 2, evaluation videos (small, side-on, partly cut-off hands) | 54% |
| **Overall** | **76%** |

Hardest letters: P (47%), X (59%), R (60%), D (66%). The most common mix-ups are
R↔U, M↔N, A/S/T/E, P↔Q↔X, and C↔O. Those are the same letters people mix up, because
they differ only by small details like where the thumb is tucked.

**Feature design:** we tried several ways of describing a hand. Plain coordinates
scored 69%. Measuring the hand from the palm's own point of view, plus its direction,
scored 74%. Adding finger bends, thumb-tip distances, and a "crossed fingers" measure
scored 77%. That last design is what `js/features.js` uses.

**Diagrams vs. real signers:** after tuning, every diagram's finger bends are within
70° of the real average, and the coach recognizes 20 of the 24 drawings as the right
letter. The 4 it doesn't: P (drawn from the side so it's easier to see), and N, S, T
(fist letters with a hidden thumb, which the coach also mixes up for real people).

## Limits to be honest about

- Only a handful of different people (at least 4–6). More signers would help the most.
- We don't know whether the dataset signers are fluent or Deaf signers. Their handshapes
  looked correct when we checked sample photos, but a few may be off.
- Where the thumb is hidden (M, N, T), MediaPipe has to guess the thumb's position, so
  those diagrams follow the ASL definition instead of the data.
