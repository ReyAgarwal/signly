/**
 * features.js
 * -----------
 * Turns a normalized hand (21 points, from landmarks.js) into the list of
 * numbers the k-NN classifier compares: the "feature vector".
 *
 * Why not just use the 63 coordinates? Because real people hold their hands
 * at slightly different angles. If your hand is tilted 20 degrees, every
 * coordinate changes, even though your handshape didn't. So we describe the
 * hand in 5 parts, each one chosen for a reason:
 *
 *   1. SHAPE (63 numbers): every point measured from the palm's own point of
 *      view ("2 palms above the wrist, a bit toward the thumb, a bit in front
 *      of the palm"). Tilting your whole hand doesn't change these.
 *   2. DIRECTION (6 numbers): which way the fingers point and which way the
 *      palm faces. H vs U, P vs K, and G vs Q have the SAME shape but point
 *      in different directions, so we need this too.
 *   3. FINGER BENDS (5 numbers): how curled each finger is (from hints.js).
 *   4. THUMB POSITION (10 numbers): how far the thumb tip is from the other
 *      fingers' joints. This is what separates A, S, T, M, N, and E.
 *   5. CROSSING (2 numbers): whether the index and middle fingers cross (R vs U).
 *
 * Each part has a WEIGHT that sets how much it counts in the distance.
 * We picked the weights by testing on people the coach had never seen
 * (see tools/README.md); this mix scored best.
 *
 * Pure math, so it can be unit tested in Node.
 */

import { allFingerBends } from './hints.js';

/** How much each part of the feature vector counts. */
export const FEATURE_WEIGHTS = {
  direction: 1,
  bends: 1,
  thumb: 1,
  crossing: 2,
};

/** Joints the thumb tip is measured against (index, middle, ring, pinky joints + two knuckles). */
const THUMB_TARGETS = [6, 7, 10, 11, 14, 15, 18, 19, 5, 9];

/** Total length of the feature vector: 63 + 6 + 5 + 10 + 2. */
export const FEATURE_LENGTH = 86;

/**
 * Subtracts two 3D points.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number[]} a - b.
 */
function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Dot product of two 3D vectors.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number} a · b.
 */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product: a vector at right angles to both inputs.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number[]} a × b.
 */
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Makes a vector 1 unit long.
 * @param {number[]} v - [x, y, z].
 * @returns {number[]} The unit vector (or zeros if v is all zeros).
 */
function unit(v) {
  const size = Math.sqrt(dot(v, v));
  if (size === 0) {
    return [0, 0, 0];
  }
  return [v[0] / size, v[1] / size, v[2] / size];
}

/**
 * Builds the palm's own set of directions ("palm frame").
 * @param {number[][]} points - 21 normalized points.
 * @returns {{across:number[], up:number[], facing:number[]}}
 *   across = from pinky knuckle toward index knuckle, up = toward the fingers,
 *   facing = straight out of the palm. All 1 unit long and at right angles.
 */
export function palmFrame(points) {
  const across = unit(subtract(points[5], points[17]));
  const wristToMiddle = subtract(points[9], points[0]);
  // The cross product of two directions IN the palm points straight OUT of it.
  const facing = unit(cross(across, wristToMiddle));
  // Crossing "facing" with "across" gives an "up" that is exactly at right
  // angles to both, even if the wrist-to-middle line was a little tilted.
  const up = cross(facing, across);
  return { across, up, facing };
}

/**
 * Measures every point from the palm's point of view.
 * @param {number[][]} points - 21 normalized points (wrist at the origin).
 * @param {{across:number[], up:number[], facing:number[]}} frame - From palmFrame().
 * @returns {number[]} 63 numbers: for each point, how far across, up, and out from the palm.
 */
export function shapeInPalmFrame(points, frame) {
  const shape = [];
  for (const point of points) {
    // A dot product with a unit direction answers "how far along that direction?"
    const fromWrist = subtract(point, points[0]);
    shape.push(dot(fromWrist, frame.across), dot(fromWrist, frame.up), dot(fromWrist, frame.facing));
  }
  return shape;
}

/**
 * Distance between two 3D points.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number} The distance.
 */
function distance(a, b) {
  const d = subtract(a, b);
  return Math.sqrt(dot(d, d));
}

/**
 * Builds the full 86-number feature vector for one hand.
 * @param {number[][]} points - 21 normalized points from normalizeHand().
 * @returns {number[]} The feature vector.
 */
export function handFeatures(points) {
  const frame = palmFrame(points);
  const shape = shapeInPalmFrame(points, frame);
  const features = [...shape];

  // 2. Direction: which way the fingers point and the palm faces (in camera terms).
  for (const value of [...frame.up, ...frame.facing]) {
    features.push(value * FEATURE_WEIGHTS.direction);
  }

  // 3. Finger bends, divided by 100 so "180 degrees" becomes 1.8 (similar size to the other numbers).
  const bends = allFingerBends(points);
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    features.push((bends[finger] / 100) * FEATURE_WEIGHTS.bends);
  }

  // 4. Thumb position: distance from the thumb tip (point 4) to other joints.
  for (const target of THUMB_TARGETS) {
    features.push(distance(points[4], points[target]) * FEATURE_WEIGHTS.thumb);
  }

  // 5. Crossing: in palm terms, is the index tip on the "wrong side" of the middle tip?
  // (shape[n * 3] is point n's "across" measurement.)
  const indexTipAcross = shape[8 * 3];
  const middleTipAcross = shape[12 * 3];
  const indexJointAcross = shape[7 * 3];
  const middleJointAcross = shape[11 * 3];
  features.push((indexTipAcross - middleTipAcross) * FEATURE_WEIGHTS.crossing);
  features.push((indexJointAcross - middleJointAcross) * FEATURE_WEIGHTS.crossing);
  return features;
}
