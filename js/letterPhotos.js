/**
 * letterPhotos.js
 * ---------------
 * Real photos of people signing each letter, shown next to the diagrams.
 *
 * The photos come from the public dataset "Images of American Sign Language
 * (ASL) Alphabet Gestures" by Sowrow, Iftekhar, Prova, and Huq (2024),
 * shared under the CC BY 4.0 license (see data/ATTRIBUTION.md). For each
 * letter we picked, from two different people, the photo whose hand shape is
 * the most typical (closest to every other person's version of that letter),
 * using tools/rank-photos.mjs. Photos marked "mirrored" were flipped left-right
 * (by tools/orient-photos.mjs) so every photo matches the diagrams: a right
 * hand, the way you see it in the mirror video.
 *
 * J and Z photos are single moments from a movement, so they look a little
 * different from the start shape in the diagram.
 */

/** Credit line shown under the photos. */
export const PHOTO_CREDIT = 'Photos: Sowrow et al. (2024), CC BY 4.0';

/** letter -> list of photos ({src, person, mirrored}). */
export const LETTER_PHOTOS = {
  A: [{ src: 'images/letters/A-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/A-2.jpg', person: 'person 3', mirrored: false }],
  B: [{ src: 'images/letters/B-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/B-2.jpg', person: 'person 3', mirrored: true }],
  C: [{ src: 'images/letters/C-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/C-2.jpg', person: 'person 3', mirrored: false }],
  D: [{ src: 'images/letters/D-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/D-2.jpg', person: 'person 3', mirrored: false }],
  E: [{ src: 'images/letters/E-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/E-2.jpg', person: 'person 3', mirrored: false }],
  F: [{ src: 'images/letters/F-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/F-2.jpg', person: 'person 3', mirrored: true }],
  G: [{ src: 'images/letters/G-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/G-2.jpg', person: 'person 3', mirrored: true }],
  H: [{ src: 'images/letters/H-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/H-2.jpg', person: 'person 3', mirrored: true }],
  I: [{ src: 'images/letters/I-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/I-2.jpg', person: 'person 3', mirrored: true }],
  J: [{ src: 'images/letters/J-1.jpg', person: 'person 2', mirrored: false }, { src: 'images/letters/J-2.jpg', person: 'person 3', mirrored: false }],
  K: [{ src: 'images/letters/K-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/K-2.jpg', person: 'person 3', mirrored: true }],
  L: [{ src: 'images/letters/L-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/L-2.jpg', person: 'person 3', mirrored: false }],
  M: [{ src: 'images/letters/M-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/M-2.jpg', person: 'person 3', mirrored: true }],
  N: [{ src: 'images/letters/N-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/N-2.jpg', person: 'person 3', mirrored: true }],
  O: [{ src: 'images/letters/O-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/O-2.jpg', person: 'person 3', mirrored: false }],
  P: [{ src: 'images/letters/P-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/P-2.jpg', person: 'person 2', mirrored: false }],
  Q: [{ src: 'images/letters/Q-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/Q-2.jpg', person: 'person 3', mirrored: true }],
  R: [{ src: 'images/letters/R-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/R-2.jpg', person: 'person 3', mirrored: true }],
  S: [{ src: 'images/letters/S-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/S-2.jpg', person: 'person 3', mirrored: true }],
  T: [{ src: 'images/letters/T-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/T-2.jpg', person: 'person 3', mirrored: false }],
  U: [{ src: 'images/letters/U-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/U-2.jpg', person: 'person 3', mirrored: true }],
  V: [{ src: 'images/letters/V-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/V-2.jpg', person: 'person 3', mirrored: true }],
  W: [{ src: 'images/letters/W-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/W-2.jpg', person: 'person 3', mirrored: true }],
  X: [{ src: 'images/letters/X-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/X-2.jpg', person: 'person 3', mirrored: true }],
  Y: [{ src: 'images/letters/Y-1.jpg', person: 'person 1', mirrored: true }, { src: 'images/letters/Y-2.jpg', person: 'person 3', mirrored: false }],
  Z: [{ src: 'images/letters/Z-1.jpg', person: 'person 1', mirrored: false }, { src: 'images/letters/Z-2.jpg', person: 'person 3', mirrored: false }],
};
