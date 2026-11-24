# Data attribution

`reference-hands.json` contains **numbers derived from photos** in the two datasets
below. Both are licensed under the
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
2 decimals, and kept at most 50 per letter per person. **No photos are included.**
See `tools/README.md` for every step.

`reference-hands.json` is shared under the same CC BY 4.0 license.
