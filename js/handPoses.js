/**
 * handPoses.js
 * ------------
 * The "recipe" for each letter's diagram: how much each finger bends, where
 * the thumb goes, and how the hand is turned. handModel.js turns a recipe
 * into a 3D hand, and diagram.js draws it.
 *
 * How to read a recipe:
 *   fingers.index = { spread, flex: [knuckle, middle joint, top joint] }
 *       spread: degrees tilted sideways (+ = toward the pinky, - = toward the thumb)
 *       flex:   degrees bent at each joint (0 = straight, 90 = bent like an L)
 *   thumb = { base, middle, tip }: the direction each thumb bone points
 *       (x = right, y = up, z = toward the viewer), OR
 *   thumb = { base, touch: { finger, at } }: the thumb reaches to touch a
 *       spot on a finger (at: 0 = knuckle ... 3 = fingertip), OR
 *   thumb = { base, reach: [x, y, z] }: the thumb tip reaches an exact spot
 *   thumb.layer = 'front' or 'behind': draw the thumb in front of / behind the fingers
 *       (or a list of 3, one per thumb bone, e.g. tucked under but the tip in front)
 *   view = rotations of the whole hand, e.g. [['y', -70]] turns the palm to the side
 *   forearm = false hides the arm (for letters where the bent wrist would make it confusing)
 *   motion = for J and Z: the path the fingertip draws, as [x, y] steps in picture units,
 *            starting from landmark `from` (shown as a dashed arrow)
 *
 * All recipes are for a RIGHT hand as you see it in the mirror (the webcam view).
 */

/**
 * A finger curled tightly into the palm (like in a fist).
 * @param {number} spread - Sideways tilt in degrees.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function curled(spread = 0) {
  // About 205 degrees in total, which matches real signers' fists (measured
  // from the reference data); a tighter curl looked unnatural.
  return { spread, flex: [75, 85, 45] };
}

/**
 * A straight finger.
 * @param {number} spread - Sideways tilt in degrees.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function straight(spread = 0) {
  // Real fingers are never perfectly straight, so add a tiny natural bend.
  return { spread, flex: [3, 8, 5] };
}

/**
 * A finger folded down but held loosely (for example, ring and pinky held by
 * the thumb in U, V, and R). Real signers fold these less than in a fist.
 * @param {number} spread - Sideways tilt in degrees.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function folded(spread = 0) {
  return { spread, flex: [70, 75, 25] };
}

/**
 * A finger with custom bends.
 * @param {number} spread - Sideways tilt in degrees.
 * @param {number} knuckle - Bend at the knuckle.
 * @param {number} middle - Bend at the middle joint.
 * @param {number} top - Bend at the top joint.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function bent(spread, knuckle, middle, top) {
  return { spread, flex: [knuckle, middle, top] };
}

/*
 * Where the thumb-tip "reach" numbers come from:
 *   - A, E, H, I, K, R, S, U, V, W, X: FITTED by tools/fit-diagrams.mjs, which
 *     searched for the spot whose distances to the fingertips and knuckles best
 *     match the average of the real signers in data/reference-hands.json.
 *   - M, N, T: set by hand from the ASL definition (where the thumb tip peeks
 *     out). In these letters the thumb is hidden under the fingers, so MediaPipe
 *     has to guess where it is, and the real-signer data isn't reliable there.
 */

/** Thumb tucked under the fingers, with only its tip drawn on top (M, N, T). */
const TIP_PEEKS_OUT = ['behind', 'behind', 'front'];

/**
 * Most letters face you. Real signers angle the palm slightly toward the
 * middle of their body (measured from the reference data), so we do too.
 */
const FACING_YOU = [['y', -8]];

/** The recipe for every letter. */
export const LETTER_POSES = {
  A: {
    view: [['y', -5]],
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb straight up against the SIDE of the index finger (not across the front).
    thumb: { base: [-0.3, 0.75, 0.8], reach: [-2.3, 3.95, 0.8] },
  },
  B: {
    view: FACING_YOU,
    fingers: { index: straight(-2), middle: straight(0), ring: straight(2), pinky: straight(5) },
    // Thumb folded across the palm.
    thumb: { base: [0.45, 0.6, 0.65], middle: [1, 0.3, 0.35], tip: [1, 0.15, 0.1], layer: 'front' },
  },
  C: {
    view: [['y', -60]],
    fingers: { index: bent(-2, 30, 40, 30), middle: bent(0, 30, 40, 30), ring: bent(2, 30, 40, 30), pinky: bent(4, 30, 40, 30) },
    // Thumb curved only a little, opposite the fingers, leaving a gap.
    thumb: { base: [-0.1, 0.55, 1], middle: [0, 0.8, 0.9], tip: [0.05, 1, 0.7] },
  },
  D: {
    view: FACING_YOU,
    fingers: { index: straight(-3), middle: bent(0, 55, 70, 35), ring: bent(2, 55, 70, 38), pinky: bent(5, 45, 60, 28) },
    thumb: { base: [0.2, 0.9, 0.9], touch: { finger: 'middle', at: 3 } },
  },
  E: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 30, 95, 45), middle: bent(0, 30, 95, 45), ring: bent(2, 30, 95, 45), pinky: bent(4, 30, 95, 45) },
    // Thumb tucked across the palm, under the bent fingertips.
    thumb: { base: [-0.3, 0.75, 0.8], reach: [-1.1, 2.75, 1.55], layer: 'behind' },
  },
  F: {
    view: FACING_YOU,
    fingers: { index: bent(-4, 45, 60, 35), middle: straight(2), ring: straight(9), pinky: straight(17) },
    thumb: { base: [-0.15, 0.7, 1], touch: { finger: 'index', at: 3 } },
  },
  G: {
    // Turned sideways: index points across your body, palm facing you, seen from a bit above.
    view: [['y', 180], ['z', 90], ['x', 35]],
    fingers: { index: straight(0), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb parallel to the index finger.
    thumb: { base: [-0.3, 1, 0.5], middle: [0, 1, 0.15], tip: [0.05, 1, 0], layer: 'front' },
  },
  H: {
    view: [['y', 180], ['z', 90], ['x', 35]],
    fingers: { index: straight(-1), middle: straight(1), ring: folded(3), pinky: folded(6) },
    thumb: { base: [0.1, 0.8, 0.6], reach: [-1.4, 4.4, 0.95] },
  },
  I: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: straight(6) },
    thumb: { base: [0.5, 0.4, 0.8], reach: [-1.1, 4.55, 0.35], layer: 'front' },
  },
  K: {
    view: FACING_YOU,
    fingers: { index: straight(-8), middle: bent(14, 35, 10, 5), ring: curled(3), pinky: curled(6) },
    // Thumb tip touches the middle finger, in the gap between index and middle.
    thumb: { base: [0.1, 0.8, 0.6], reach: [-1.4, 4.4, 0.95], layer: 'front' },
  },
  L: {
    view: FACING_YOU,
    fingers: { index: straight(-2), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb straight out to the side, making an L.
    thumb: { base: [-1, 0.55, 0.2], middle: [-1, 0.1, 0], tip: [-1, 0, 0] },
  },
  M: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 70, 70, 30), middle: bent(0, 70, 70, 30), ring: bent(2, 70, 70, 30), pinky: curled(5) },
    // Thumb tucked under three fingers; its tip peeks out by the pinky.
    thumb: { base: [0.35, 0.6, 0.6], reach: [0.88, 2.3, 1.9], layer: TIP_PEEKS_OUT },
  },
  N: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 70, 70, 30), middle: bent(0, 70, 70, 30), ring: curled(3), pinky: curled(5) },
    // Thumb tucked under two fingers; its tip peeks out between middle and ring.
    thumb: { base: [0.3, 0.6, 0.6], reach: [0.05, 2.3, 1.95], layer: TIP_PEEKS_OUT },
  },
  O: {
    view: [['y', -60]],
    fingers: { index: bent(-2, 40, 55, 35), middle: bent(0, 40, 55, 35), ring: bent(2, 40, 55, 35), pinky: bent(4, 42, 55, 30) },
    thumb: { base: [-0.1, 0.6, 1], touch: { finger: 'index', at: 3 } },
  },
  P: {
    // Like K, but the hand points DOWN: the middle finger points straight down,
    // the index slants down and toward you, and the thumb sits between them.
    // (Checked against photos of real signers.) Drawn from the side so both
    // fingers are easy to see.
    view: [['x', 75], ['y', -62]],
    forearm: false,
    fingers: { index: bent(-6, 40, 5, 5), middle: bent(12, 95, 10, 0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [0, 0.6, 1], touch: { finger: 'middle', at: 0.6 }, layer: 'front' },
  },
  Q: {
    // The G handshape, pointing down and forward.
    view: [['x', 125], ['y', 35]],
    forearm: false,
    fingers: { index: bent(0, 10, 25, 15), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [-0.3, 1, 0.5], middle: [0, 1, 0.15], tip: [0.05, 1, 0], layer: 'front' },
  },
  R: {
    view: FACING_YOU,
    // Index and middle fingers crossed: the middle finger leans over the index.
    fingers: { index: straight(7), middle: bent(-13, 12, 0, 0), ring: folded(3), pinky: folded(6) },
    thumb: { base: [0.1, 0.8, 0.6], reach: [-0.95, 3.95, 2.15], layer: 'front' },
  },
  S: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb across the FRONT of the curled fingers.
    thumb: { base: [0, 0.5, 1], reach: [-0.65, 3.2, 2.75], layer: 'front' },
  },
  T: {
    view: FACING_YOU,
    fingers: { index: bent(-3, 65, 75, 35), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb tucked under the index finger; its tip pokes up between index and middle.
    thumb: { base: [-0.05, 0.85, 0.6], reach: [-0.8, 3.75, 2.15], layer: TIP_PEEKS_OUT },
  },
  U: {
    view: FACING_YOU,
    fingers: { index: straight(-1), middle: straight(1), ring: folded(3), pinky: folded(6) },
    thumb: { base: [-0.3, 0.75, 0.8], reach: [-0.35, 3.35, 1.7], layer: 'front' },
  },
  V: {
    view: FACING_YOU,
    fingers: { index: straight(-13), middle: straight(10), ring: folded(3), pinky: folded(6) },
    thumb: { base: [0, 0.5, 1], reach: [-0.5, 3.35, 1.4], layer: 'front' },
  },
  W: {
    view: FACING_YOU,
    fingers: { index: straight(-14), middle: straight(0), ring: straight(12), pinky: bent(6, 60, 55, 20) },
    // Thumb holds down the pinky.
    thumb: { base: [-0.3, 0.75, 0.8], reach: [0.4, 3.35, 1.4], layer: 'front' },
  },
  X: {
    // Turned like C, so you can see the hook of the index finger from the side.
    view: [['y', -50]],
    fingers: { index: bent(-3, 5, 65, 30), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [0.5, 0.4, 0.8], reach: [-2.15, 4.1, 1.25], layer: 'front' },
  },
  Y: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: straight(20) },
    thumb: { base: [-1, 0.6, 0.25], middle: [-1, 0.25, 0], tip: [-1, 0.15, 0] },
  },
};

/**
 * J and Z: the coach can't check them (they move), but the diagrams show the
 * starting handshape plus a dashed arrow for the movement. Arrow points are
 * in picture units (y goes DOWN), starting at the fingertip that draws.
 */
export const MOTION_POSES = {
  J: {
    // Starts as I; the pinky draws a J: down, then curving toward the thumb side.
    ...LETTER_POSES.I,
    motion: { from: 20, offset: [1.4, 0.2], path: [[0, 0], [0.1, 3.2], [-0.5, 4.2], [-1.5, 3.5]] },
  },
  Z: {
    // The index finger points (like the number 1) and draws a Z in the air.
    view: FACING_YOU,
    fingers: { index: straight(-3), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [-0.3, 0.75, 0.8], reach: [-0.35, 3.35, 1.7], layer: 'front' },
    motion: { from: 8, offset: [0.9, -0.4], path: [[0, 0], [2.4, 0], [0, 2.2], [2.4, 2.2]] },
  },
};

/** An open hand with spread fingers, used for the "which color is which finger" key. */
export const KEY_POSE = {
  view: [['y', -5]],
  fingers: { index: straight(-17), middle: straight(-3), ring: straight(12), pinky: straight(27) },
  thumb: { base: [-1, 0.5, 0.3], middle: [-1, 0.6, 0.1], tip: [-0.75, 0.75, 0] },
};
