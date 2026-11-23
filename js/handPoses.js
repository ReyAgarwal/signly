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
 *
 * All recipes are for a RIGHT hand as you see it in the mirror (the webcam view).
 */

/**
 * A finger curled tightly into the palm (like in a fist).
 * @param {number} spread - Sideways tilt in degrees.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function curled(spread = 0) {
  return { spread, flex: [88, 100, 65] };
}

/**
 * A straight finger.
 * @param {number} spread - Sideways tilt in degrees.
 * @returns {{spread:number, flex:number[]}} The finger pose.
 */
function straight(spread = 0) {
  return { spread, flex: [0, 0, 0] };
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

/** Thumb lying across the FRONT of curled fingers (S, I, X, ...). */
const THUMB_ACROSS_FRONT = { base: [0.25, 0.5, 1], middle: [1, 0.25, 0.5], tip: [1, -0.15, 0.05], layer: 'front' };

/** Thumb holding down the curled ring and pinky fingers (U, V, H, R, K). */
const THUMB_HOLDS_RING_PINKY = { base: [0.35, 0.5, 1], middle: [1, 0.35, 0.55], tip: [1, 0, 0.1], layer: 'front' };

/** Thumb holding down ring and pinky, but hidden behind the hand (for H, seen from the back). */
const THUMB_HIDDEN_ON_FINGERS = { base: [0.35, 0.5, 1], middle: [1, 0.35, 0.55], tip: [1, 0, 0.1] };

/** Thumb tucked under the fingers, with only its tip drawn on top (M, N, T). */
const TIP_PEEKS_OUT = ['behind', 'behind', 'front'];

/** Most letters face you, turned a little so you can see the thumb side. */
const FACING_YOU = [['y', 15]];

/** The recipe for every letter. */
export const LETTER_POSES = {
  A: {
    view: [['y', 25]],
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb straight up against the SIDE of the index finger (not across the front).
    thumb: { base: [-0.35, 0.75, 0.85], middle: [-0.1, 1, 0.1], tip: [0, 1, -0.05] },
  },
  B: {
    view: FACING_YOU,
    fingers: { index: straight(-2), middle: straight(0), ring: straight(2), pinky: straight(5) },
    // Thumb folded across the palm.
    thumb: { base: [0.45, 0.6, 0.65], middle: [1, 0.15, 0.3], tip: [1, -0.1, 0], layer: 'front' },
  },
  C: {
    view: [['y', -75]],
    fingers: { index: bent(-2, 40, 50, 35), middle: bent(0, 40, 50, 35), ring: bent(2, 40, 50, 35), pinky: bent(4, 40, 50, 35) },
    thumb: { base: [-0.1, 0.55, 1], middle: [0, 0.9, 0.8], tip: [0.05, 1, 0.3] },
  },
  D: {
    view: [['y', 10]],
    fingers: { index: straight(-3), middle: bent(0, 50, 90, 40), ring: bent(2, 55, 95, 40), pinky: bent(5, 60, 95, 40) },
    thumb: { base: [0.3, 0.55, 1], touch: { finger: 'middle', at: 3 } },
  },
  E: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 30, 110, 75), middle: bent(0, 30, 110, 75), ring: bent(2, 30, 110, 75), pinky: bent(4, 35, 110, 75) },
    // Thumb tucked across the palm, under the bent fingertips.
    thumb: { base: [0.35, 0.55, 0.8], middle: [1, 0.2, 0.35], tip: [1, -0.05, 0], layer: 'behind' },
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
    fingers: { index: straight(-1), middle: straight(1), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_HIDDEN_ON_FINGERS,
  },
  I: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: straight(6) },
    thumb: THUMB_ACROSS_FRONT,
  },
  K: {
    view: FACING_YOU,
    fingers: { index: straight(-8), middle: bent(14, 35, 0, 0), ring: curled(3), pinky: curled(6) },
    // Thumb tip touches the middle finger, in the gap between index and middle.
    thumb: { base: [0, 0.6, 1], touch: { finger: 'middle', at: 0.5 }, layer: 'front' },
  },
  L: {
    view: FACING_YOU,
    fingers: { index: straight(-2), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb straight out to the side, making an L.
    thumb: { base: [-1, 0.55, 0.2], middle: [-1, 0.1, 0], tip: [-1, 0, 0] },
  },
  M: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 80, 100, 50), middle: bent(0, 80, 100, 50), ring: bent(2, 80, 100, 50), pinky: curled(5) },
    // Thumb tucked under three fingers; its tip peeks out between ring and pinky.
    thumb: { base: [0.35, 0.6, 0.6], reach: [0.88, 2.2, 1.9], bend: [0, -0.6, 0.8], layer: TIP_PEEKS_OUT },
  },
  N: {
    view: FACING_YOU,
    fingers: { index: bent(-2, 80, 100, 50), middle: bent(0, 80, 100, 50), ring: curled(3), pinky: curled(5) },
    // Thumb tucked under two fingers; its tip peeks out between middle and ring.
    thumb: { base: [0.3, 0.6, 0.6], reach: [0.05, 2.2, 1.95], bend: [0, -0.6, 0.8], layer: TIP_PEEKS_OUT },
  },
  O: {
    view: [['y', -75]],
    fingers: { index: bent(-2, 45, 65, 40), middle: bent(0, 45, 65, 40), ring: bent(2, 45, 65, 40), pinky: bent(4, 50, 65, 40) },
    thumb: { base: [-0.1, 0.6, 1], touch: { finger: 'index', at: 3 } },
  },
  P: {
    // The K handshape, tipped forward so the fingers point down.
    view: [['x', 125], ['y', 25]],
    fingers: { index: straight(-8), middle: bent(14, 35, 0, 0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [0, 0.6, 1], touch: { finger: 'middle', at: 0.5 }, layer: 'front' },
  },
  Q: {
    // The G handshape, pointing down.
    view: [['x', 155], ['y', 30]],
    fingers: { index: straight(0), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: { base: [-0.3, 1, 0.5], middle: [0, 1, 0.15], tip: [0.05, 1, 0], layer: 'front' },
  },
  R: {
    view: FACING_YOU,
    // Index and middle fingers crossed: the middle finger leans over the index.
    fingers: { index: straight(7), middle: bent(-13, 12, 0, 0), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_HOLDS_RING_PINKY,
  },
  S: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_ACROSS_FRONT,
  },
  T: {
    view: FACING_YOU,
    fingers: { index: bent(-3, 70, 95, 60), middle: curled(0), ring: curled(3), pinky: curled(6) },
    // Thumb tucked under the index finger; its tip pokes up between index and middle.
    thumb: { base: [-0.05, 0.85, 0.6], reach: [-0.8, 3.75, 2.15], bend: [-0.6, -0.3, 0.2], layer: TIP_PEEKS_OUT },
  },
  U: {
    view: FACING_YOU,
    fingers: { index: straight(-1), middle: straight(1), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_HOLDS_RING_PINKY,
  },
  V: {
    view: FACING_YOU,
    fingers: { index: straight(-13), middle: straight(10), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_HOLDS_RING_PINKY,
  },
  W: {
    view: FACING_YOU,
    fingers: { index: straight(-14), middle: straight(0), ring: straight(12), pinky: curled(6) },
    thumb: { base: [0.4, 0.5, 1], touch: { finger: 'pinky', at: 2.6 }, layer: 'front' },
  },
  X: {
    // Turned so you can see the hook of the index finger from the side.
    view: [['y', 75]],
    fingers: { index: bent(-3, 15, 95, 70), middle: curled(0), ring: curled(3), pinky: curled(6) },
    thumb: THUMB_ACROSS_FRONT,
  },
  Y: {
    view: FACING_YOU,
    fingers: { index: curled(-3), middle: curled(0), ring: curled(3), pinky: straight(20) },
    thumb: { base: [-1, 0.6, 0.25], middle: [-1, 0.25, 0], tip: [-1, 0.15, 0] },
  },
};
