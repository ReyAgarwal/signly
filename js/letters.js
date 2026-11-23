/**
 * letters.js
 * ----------
 * The list of ASL letters this app practices, plus a short written
 * description of each handshape.
 *
 * We only use the 24 "static" letters (the ones you hold still).
 * J and Z are skipped for now because they are signed with a MOVEMENT,
 * and our recognizer only looks at one frame (one picture) at a time.
 *
 * The descriptions are our own words, so we don't need any copyrighted
 * pictures of hands.
 */

/** All 24 static letters, in alphabet order (no J, no Z). */
export const STATIC_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
];

/** A one-sentence description of how to make each letter. */
export const LETTER_TIPS = {
  A: 'Make a fist. Rest your thumb straight up along the side of your index finger.',
  B: 'Hold four fingers straight up and together. Fold your thumb across your palm.',
  C: 'Curve your fingers and thumb into the shape of the letter C.',
  D: 'Point your index finger up. Curl the other fingers so they touch your thumb tip.',
  E: 'Bend all four fingers down so the tips rest on your thumb, which is tucked across your palm.',
  F: 'Touch your index fingertip to your thumb tip to make a circle. Hold the other three fingers up and spread.',
  G: 'Point your index finger and thumb sideways, parallel to each other. Curl the other fingers.',
  H: 'Point your index and middle fingers sideways, together. Hold the other fingers down with your thumb.',
  I: 'Make a fist and hold your pinky straight up.',
  K: 'Index finger up, middle finger angled forward, thumb touching the middle finger between them.',
  L: 'Index finger straight up and thumb straight out to the side, making an L.',
  M: 'Tuck your thumb under your index, middle, and ring fingers.',
  N: 'Tuck your thumb under your index and middle fingers.',
  O: 'Curve all your fingertips so they touch your thumb tip, making an O.',
  P: 'Make the K handshape, then turn your hand so the fingers point down.',
  Q: 'Make the G handshape, then turn your hand so the fingers point down.',
  R: 'Cross your middle finger over your index finger, both pointing up.',
  S: 'Make a fist with your thumb wrapped across the front of your fingers.',
  T: 'Make a fist with your thumb tucked between your index and middle fingers.',
  U: 'Hold your index and middle fingers straight up and together.',
  V: 'Hold your index and middle fingers straight up and spread apart, like a peace sign.',
  W: 'Hold your index, middle, and ring fingers up and spread. Thumb holds down the pinky.',
  X: 'Make a fist, then raise your index finger and bend it into a hook.',
  Y: 'Stick out your thumb and pinky. Curl the three middle fingers down.',
};

/**
 * Checks whether a value is one of the 24 letters this app supports.
 * @param {string} letter - The value to check, for example "B".
 * @returns {boolean} True if it is a supported static letter.
 */
export function isStaticLetter(letter) {
  return STATIC_LETTERS.includes(letter);
}
