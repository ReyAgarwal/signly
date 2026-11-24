# Data attribution

`reference-hands.json` contains **numbers derived from photos** in the two datasets
below, and `images/letters/` contains **52 photos** from dataset 1. Both are licensed under the
[Creative Commons Attribution 4.0 International license (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/),
which allows reuse and adaptation with credit.

1. Sowrow, Ab. Rahim Ahmed; Iftekhar, Md Iftekhar Alam Sarker; Prova, Sadia Islam;
   Huq, Mohammad Rezwanul (2024). *Images of American Sign Language (ASL) Alphabet
   Gestures*. Mendeley Data, Version 2. https://doi.org/10.17632/48dg9vhmyk.2

2. Cabana Garceran del Vall, Elisa (2026). *American Sign Language Image Dataset
   (fingerspelling original + keypoints + evaluation)*. Mendeley Data, Version 1.
   https://doi.org/10.17632/97yd3b5f5h.1

**Changes we made:** we sampled about 9,000 of the photos, ran Google MediaPipe Hand
Landmarker on them, kept only the 21 hand points of each hand that was found,
normalized them (wrist at the origin, palm size 1, left hands mirrored), rounded to
2 decimals, and kept at most 50 per letter per person. See `tools/README.md` for every step.

**Letter photos (`images/letters/`):** two photos per letter (A–Z), each from a
different person in dataset 1. Changes we made: picked the most typical photo of
each person (`tools/rank-photos.mjs`), **mirrored some left-right** so they match the
app's right-hand diagrams (`tools/orient-photos.mjs`; which ones is listed in
`js/letterPhotos.js`), cut away the white and black bars around the photo, and fit it
into a 300 × 300 square whose empty edges are filled with a blurred copy of the same
photo (`tools/crop-photos.mjs`). The photos show only hands.

`reference-hands.json` and the letter photos are shared under the same CC BY 4.0 license.
