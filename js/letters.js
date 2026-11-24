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
 * The descriptions are our own words (checked against the sources listed
 * above LETTER_STEPS).
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

/**
 * How to make each letter, as 2-3 short steps: the handshape, where the
 * thumb goes, and which way the palm faces.
 *
 * "Forward" means toward the person you're signing to (here: the camera).
 * "Toward your other hand" means sideways, toward your non-signing hand; it's
 * written that way so the steps are right for BOTH right- and left-handed signers.
 *
 * Fact-checked (November 2026) against: Lifeprint / ASL University
 * (lifeprint.com, the letter pages and "Which way should the palm face?"),
 * Signing Savvy's "Common fingerspelling mistakes", and the "American manual
 * alphabet" article on Wikipedia. Things we fixed after checking:
 *   - R: the middle finger crosses BEHIND the index finger.
 *   - M, N, T: where the thumb tip peeks out, and M/N fingers are draped, not squeezed.
 *   - G, H: the palm faces you; C, O: palm mostly forward, turned only a little.
 *   - J, Z: left-handed signers draw them as a mirror image.
 */
export const LETTER_STEPS = {
  A: ['Make a fist.', 'Put your thumb straight up against the SIDE of your index finger.', 'Palm faces forward.'],
  B: ['Hold your four fingers straight up, pressed together.', 'Fold your thumb across your palm.', 'Palm faces forward.'],
  C: ['Curve your fingers (held together) and your thumb into a C.', 'Leave a gap between your thumb and fingertips.', 'Palm faces forward, turned a little toward your other hand.'],
  D: ['Point your index finger straight up.', 'Curve your other fingers down so the middle fingertip touches your thumb tip.', 'Palm faces forward.'],
  E: ['Bend all four fingers down so the fingertips point at your palm.', 'Tuck your thumb under them, across your palm, so your fingertips rest on it.', 'Palm faces forward.'],
  F: ['Touch your index fingertip to your thumb tip, making a circle.', 'Hold your middle, ring, and pinky fingers up and spread apart.', 'Palm faces forward.'],
  G: ['Point your index finger sideways, toward your other hand.', 'Hold your thumb just above it, pointing the same way (not touching).', 'Curl the other fingers. Palm faces you.'],
  H: ['Point your index and middle fingers sideways, together, toward your other hand.', 'Curl your ring and pinky fingers; your thumb holds them down.', 'Palm faces you.'],
  I: ['Make a fist with your thumb resting across your curled fingers.', 'Hold your pinky straight up.', 'Palm faces forward.'],
  J: ['Make an I (pinky up).', 'Draw a J with your pinky: down, then curve toward your thumb side, twisting your wrist.', 'Left-handed signers draw a mirror-image J.'],
  K: ['Hold your index finger straight up.', 'Point your middle finger forward, at a right angle to the index.', 'Put your thumb tip against the middle finger, between the two. Palm faces forward.'],
  L: ['Hold your index finger straight up.', 'Stick your thumb straight out to the side, making an L.', 'Curl the other fingers. Palm faces forward.'],
  M: ['Drape your index, middle, and ring fingers down over your thumb.', 'Your thumb tip peeks out between your ring finger and pinky.', 'Palm faces forward; don\'t squeeze it into a tight fist.'],
  N: ['Drape your index and middle fingers down over your thumb.', 'Your thumb tip peeks out between your middle and ring fingers.', 'Ring and pinky stay curled. Palm faces forward.'],
  O: ['Curve all your fingers so their tips touch your thumb tip.', 'Keep it round, like the letter O (not flat).', 'Palm faces forward, turned a little toward your other hand.'],
  P: ['Make a K.', 'Bend your wrist so the middle finger points straight down and the index points forward.', 'Palm faces down. Only the wrist changes from K to P.'],
  Q: ['Make a G.', 'Bend your wrist so your index finger and thumb point down at the floor.', 'The other fingers stay curled.'],
  R: ['Hold your index and middle fingers up.', 'Cross them like "fingers crossed for luck": the middle finger goes behind the index.', 'Curl the other fingers under your thumb. Palm faces forward.'],
  S: ['Make a fist.', 'Wrap your thumb across the FRONT of your fingers.', 'Palm faces forward.'],
  T: ['Make a fist with your thumb tucked under your index finger.', 'Your thumb tip peeks out between your index and middle fingers.', 'Palm faces forward.'],
  U: ['Hold your index and middle fingers straight up, pressed together.', 'Curl your ring and pinky fingers; your thumb holds them down.', 'Palm faces forward.'],
  V: ['Hold your index and middle fingers straight up and spread apart.', 'Curl your ring and pinky fingers; your thumb holds them down.', 'Palm faces forward.'],
  W: ['Hold your index, middle, and ring fingers up and spread apart.', 'Your thumb holds your pinky down.', 'Palm faces forward.'],
  X: ['Make a fist, then raise your index finger.', 'Bend it into a hook at the two top joints.', 'Thumb rests on the curled fingers. Palm faces a little toward your other hand.'],
  Y: ['Stick your thumb and pinky straight out.', 'Curl your three middle fingers down.', 'Palm faces forward.'],
  Z: ['Point your index finger up (other fingers curled, thumb on them).', 'Draw a Z in the air: across, diagonally down and back, then across again.', 'Left-handed signers draw a mirror-image Z.'],
};

/** The same instructions as one line of text (for small spaces, like the Challenge hint). */
export const LETTER_TIPS = Object.fromEntries(
  Object.entries(LETTER_STEPS).map(([letter, steps]) => [letter, steps.join(' ')]),
);

/** The most common mistake for each letter, and the letter it gets confused with. */
export const LETTER_MIXUPS = {
  A: 'Thumb goes on the SIDE of the fist. Thumb across the front is S.',
  B: 'Keep the four fingers together and the thumb folded in.',
  C: 'Leave a gap between thumb and fingers. Closed all the way is O.',
  D: 'Only the index points up. The other fingertips touch the thumb.',
  E: 'Fingertips rest down on the thumb, with no big gap. A fist with the thumb across the front is S.',
  F: 'Index fingertip touches the thumb tip; the other three fingers stay up and spread.',
  G: 'Index and thumb point sideways, palm facing you. Two fingers sideways is H.',
  H: 'Two fingers point sideways, palm facing you. Two fingers pointing up is U.',
  I: 'Only the pinky is up. Pinky AND thumb out is Y.',
  J: 'Same handshape as I. Holding still makes it an I; the J movement makes it a J.',
  K: 'The thumb touches the middle finger between the raised fingers. Without it, it looks like V.',
  L: 'Thumb and index make a right angle, like the letter L.',
  M: 'Three fingers over the thumb. Two fingers is N; one finger (thumb poking out by the index) is T.',
  N: 'Two fingers over the thumb. Three fingers is M.',
  O: 'All fingertips touch the thumb. With a gap, it is C.',
  P: 'Same handshape as K, but the middle finger points down.',
  Q: 'Same handshape as G, but pointing down.',
  R: 'Fingers crossed. Side by side is U.',
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
