/**
 * fit-diagrams.mjs
 * ----------------
 * Checks the handshape diagrams against REAL signers, and finds where each
 * diagram's thumb tip should go.
 *
 * For every letter it compares the diagram's hand (from js/handPoses.js)
 * with the average of the real signers in data/reference-hands.json:
 *   - finger bends (degrees) for all 5 fingers
 *   - distances from the thumb tip to 14 finger joints (in palm sizes)
 *   - whether the coach's k-NN recognizes the diagram as the right letter
 *
 * For letters whose thumb uses `reach: FIT`, it also searches thousands of
 * possible thumb-tip spots and prints the one that best matches the real
 * signers. Those numbers were then copied into js/handPoses.js.
 *
 * Usage: node tools/fit-diagrams.mjs
 */

import { readFileSync } from 'node:fs';
import { parseReferenceFile } from '../js/reference.js';
import { featuresToPoints, normalizeHand } from '../js/landmarks.js';
import { allFingerBends } from '../js/hints.js';
import { handFeatures } from '../js/features.js';
import { classify } from '../js/classifier.js';
import { buildHand, buildFinger, buildThumb, PALM, BONE_LENGTHS } from '../js/handModel.js';
import { LETTER_POSES } from '../js/handPoses.js';
import { STATIC_LETTERS } from '../js/letters.js';

/** Joints we measure the thumb tip against: the 4 fingertips and the 4 middle knuckles. */
const THUMB_TARGETS = [8, 12, 16, 20, 6, 10, 14, 18];

/** Thumb base directions to try (the thumb's first bone can swing a bit). */
const BASE_CHOICES = [[0.35, 0.6, 0.6], [0.1, 0.8, 0.6], [-0.3, 0.75, 0.8], [0.5, 0.4, 0.8], [0, 0.5, 1]];

/** Never accept a thumb bent more than this (real thumbs can't fold that far). */
const MAX_THUMB_BEND = 190;

/** Wrist-to-middle-knuckle length in the diagram model (its "palm size"). */
const MODEL_PALM_SIZE = Math.hypot(...PALM.knuckles.middle);

/**
 * Straight-line distance between two 3D points.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number} The distance.
 */
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * The thumb tip's distance to each target joint.
 * @param {number[][]} points - 21 hand points.
 * @param {number} palmSize - Divide by this so different-sized hands compare fairly.
 * @returns {number[]} One distance per target joint.
 */
function thumbDistances(points, palmSize) {
  return THUMB_TARGETS.map((joint) => distance(points[4], points[joint]) / palmSize);
}

/**
 * Average of the real signers for one letter: finger bends and thumb distances.
 * @param {Array<{letter:string, features:number[]}>} reference - Reference samples.
 * @param {string} letter - The letter.
 * @returns {{bends:Object<string,number>, thumb:number[]}} The averages.
 */
function realAverage(reference, letter) {
  const hands = reference.filter((s) => s.letter === letter).map((s) => featuresToPoints(s.features));
  const bends = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  const thumb = new Array(THUMB_TARGETS.length).fill(0);
  for (const points of hands) {
    const handBends = allFingerBends(points);
    for (const finger of Object.keys(bends)) {
      bends[finger] += handBends[finger] / hands.length;
    }
    thumbDistances(points, 1).forEach((value, i) => {
      thumb[i] += value / hands.length;
    });
  }
  return { bends, thumb };
}

/**
 * How far the diagram's thumb is from the real signers' thumb (smaller = better).
 * @param {number[][]} points - The diagram's 21 points (model units).
 * @param {{bends:Object<string,number>, thumb:number[]}} real - From realAverage().
 * @returns {number} The error score.
 */
function thumbError(points, real) {
  const mine = thumbDistances(points, MODEL_PALM_SIZE);
  let error = 0;
  mine.forEach((value, i) => {
    error += (value - real.thumb[i]) ** 2;
  });
  if (allFingerBends(points).thumb > MAX_THUMB_BEND) {
    return Infinity;
  }
  return error;
}

/**
 * Builds the diagram hand's points (before turning it) with a given thumb.
 * @param {Object} pose - The letter recipe.
 * @param {Object} thumbPose - The thumb settings to try.
 * @returns {number[][]} 21 points.
 */
function pointsWithThumb(pose, thumbPose) {
  const fingers = {};
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    fingers[name] = buildFinger(PALM.knuckles[name], BONE_LENGTHS[name], pose.fingers[name]);
  }
  const thumb = buildThumb(thumbPose, fingers);
  return [PALM.wrist, ...thumb, ...fingers.index, ...fingers.middle, ...fingers.ring, ...fingers.pinky];
}

/**
 * Searches for the thumb-tip spot that best matches the real signers.
 * @param {Object} pose - The letter recipe (its thumb uses `reach`).
 * @param {Object} real - From realAverage().
 * @returns {{reach:number[], error:number}} The best spot and its error.
 */
function fitThumb(pose, real) {
  let best = { reach: pose.thumb.reach, base: pose.thumb.base, error: Infinity };
  // Only search where a real thumb tip can be: in front of the palm, below the fingertips.
  for (const base of BASE_CHOICES) {
    for (let x = -2.3; x <= 1.9; x += 0.15) {
      for (let y = 0.8; y <= 4.6; y += 0.15) {
        for (let z = 0.2; z <= 3.2; z += 0.15) {
          const reach = [x, y, z];
          const error = thumbError(pointsWithThumb(pose, { ...pose.thumb, base, reach }), real);
          if (error < best.error) {
            best = { reach, base, error };
          }
        }
      }
    }
  }
  return best;
}

/**
 * Turns the diagram into MediaPipe-style picture points and normalizes it,
 * so the coach can try to recognize the drawing.
 * @param {string} letter - The letter.
 * @returns {number[][]} 21 normalized points.
 */
function diagramAsCameraHand(letter) {
  // The diagram is a right hand seen in a mirror (x right, y up, z toward you).
  // A camera picture is the mirror image, with y pointing DOWN.
  const points = buildHand(LETTER_POSES[letter]).landmarks;
  const picture = points.map(([x, y, z]) => ({ x: 0.5 - x * 0.05, y: 0.6 - y * 0.05, z: -z * 0.05 }));
  return normalizeHand(picture, { handedness: 'Right' });
}

const reference = parseReferenceFile(JSON.parse(readFileSync(new URL('../data/reference-hands.json', import.meta.url), 'utf8'))).samples;
const pool = reference.map((s) => ({ letter: s.letter, features: handFeatures(featuresToPoints(s.features)) }));

let recognized = 0;
for (const letter of STATIC_LETTERS) {
  const pose = LETTER_POSES[letter];
  const real = realAverage(reference, letter);
  let line = letter + ':';

  if (pose.thumb.reach) {
    const best = fitThumb(pose, real);
    line += ' fitted base = [' + best.base.join(', ') + '], reach = [' + best.reach.map((n) => n.toFixed(2)).join(', ') + ']  (error ' + best.error.toFixed(3) + ')';
  }

  const diagram = buildHand(pose).landmarks;
  const bends = allFingerBends(diagram);
  const bendText = Object.keys(bends).map((f) => f + ' ' + Math.round(bends[f]) + '/' + Math.round(real.bends[f])).join(', ');
  const guess = classify(handFeatures(diagramAsCameraHand(letter)), pool, 9);
  if (guess.letter === letter) {
    recognized += 1;
  }
  const votes = guess.votes.map((v) => v.letter + v.votes).join(' ');
  console.log(line + '\n   bends diagram/real: ' + bendText + '\n   coach recognizes diagram as: ' + votes);
}
console.log('\nDiagrams the coach recognizes as the right letter: ' + recognized + ' / 24');
