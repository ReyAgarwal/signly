/**
 * letters.js
 * ----------
 * The list of ASL letters this app practices, plus a short written
 * description of each handshape.
 *
 * The coach checks the 24 "static" letters (the ones you hold still).
 * J and Z are signed with a MOVEMENT, and our recognizer only looks at one
 * frame (one picture) at a time, so it can't check them yet. They still
 * have tips and diagrams (with an arrow showing the movement) for learning.
 *
 * The descriptions are our own words, so we don't need any copyrighted
 * pictures of hands.
 */

/** All 24 static letters, in alphabet order (no J, no Z). */
export const STATIC_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
];

/** All 26 letters, in alphabet order. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** The two letters signed with a movement (the coach can't check these yet). */
export const MOTION_LETTERS = ['J', 'Z'];

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
  J: 'Make the I handshape (pinky up), then draw a J in the air with your pinky: down, then curve toward your thumb side.',
  K: 'Index finger up, middle finger angled forward, thumb touching the middle finger between them.',
  L: 'Index finger straight up and thumb straight out to the side, making an L.',
  M: 'Tuck your thumb under your index, middle, and ring fingers.',
  N: 'Tuck your thumb under your index and middle fingers.',
  O: 'Curve all your fingertips so they touch your thumb tip, making an O.',
  P: 'Make the K handshape, then tip your hand forward: index points toward the camera, middle finger points down.',
  Q: 'Make the G handshape, then tip it so the index and thumb point down and toward the camera.',
  R: 'Cross your middle finger over your index finger, both pointing up.',
  S: 'Make a fist with your thumb wrapped across the front of your fingers.',
  T: 'Make a fist with your thumb tucked between your index and middle fingers.',
  U: 'Hold your index and middle fingers straight up and together.',
  V: 'Hold your index and middle fingers straight up and spread apart, like a peace sign.',
  W: 'Hold your index, middle, and ring fingers up and spread. Thumb holds down the pinky.',
  X: 'Make a fist, then raise your index finger and bend it into a hook.',
  Y: 'Stick out your thumb and pinky. Curl the three middle fingers down.',
  Z: 'Point your index finger (other fingers curled), then draw a Z in the air: across, diagonal down, across.',
};

/** The most common mistake for each letter, and the letter it gets confused with. */
export const LETTER_MIXUPS = {
  A: 'Thumb goes on the SIDE of the fist. Thumb across the front is S.',
  B: 'Keep the four fingers together and the thumb folded in.',
  C: 'Leave a gap between thumb and fingers. Closed all the way is O.',
  D: 'Only the index points up. The other fingertips touch the thumb.',
  E: 'Fingertips rest on the thumb. A tight fist with the thumb across is S.',
  F: 'Index fingertip touches the thumb tip; the other three fingers stay up.',
  G: 'Index and thumb point sideways. Two fingers sideways is H.',
  H: 'Two fingers point sideways. Two fingers pointing up is U.',
  I: 'Only the pinky is up. Pinky AND thumb out is Y.',
  J: 'Same handshape as I. Holding still makes it an I; the J movement makes it a J.',
  K: 'The thumb touches the middle finger between the raised fingers. Without it, it looks like V.',
  L: 'Thumb and index make a right angle, like the letter L.',
  M: 'Three fingers over the thumb. Two fingers is N.',
  N: 'Two fingers over the thumb. Three fingers is M.',
  O: 'All fingertips touch the thumb. With a gap, it is C.',
  P: 'Like K, but pointing down.',
  Q: 'Like G, but pointing down.',
  R: 'Cross the fingers. Side by side is U.',
  S: 'Thumb across the FRONT. On the side is A; poking between fingers is T.',
  T: 'Only the thumb TIP pokes out, between the index and middle fingers.',
  U: 'Fingers together. Spread apart is V.',
  V: 'Fingers spread apart. Together is U.',
  W: 'Three fingers up and spread; the thumb holds down the pinky.',
  X: 'The index is bent like a hook, not straight up.',
  Y: 'Thumb and pinky out. Only the pinky is I.',
  Z: 'Held still, this handshape looks like D or the number 1. The Z movement is what makes it Z.',
};

/**
 * Checks whether a letter is signed with a movement (J or Z).
 * @param {string} letter - The letter to check.
 * @returns {boolean} True for J and Z.
 */
export function isMotionLetter(letter) {
  return MOTION_LETTERS.includes(letter);
}

/**
 * Checks whether a value is one of the 24 letters this app supports.
 * @param {string} letter - The value to check, for example "B".
 * @returns {boolean} True if it is a supported static letter.
 */
export function isStaticLetter(letter) {
  return STATIC_LETTERS.includes(letter);
}
