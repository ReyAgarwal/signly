/**
 * landmarks.test.js
 * -----------------
 * Tests for normalization (js/landmarks.js): centering on the wrist,
 * scaling by palm size, mirroring left hands, and flattening to features.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPoints, centerOnWrist, scaleByPalmSize, palmSize, mirrorX, normalizeHand,
  pointsToFeatures, featuresToPoints, averagePoints, distance3d,
} from '../js/landmarks.js';
import { makeFakeHand } from './helpers/fakeHand.js';

/**
 * Checks two lists of numbers are equal within a tiny rounding tolerance.
 * @param {number[]} actual - Numbers we got.
 * @param {number[]} expected - Numbers we wanted.
 * @param {number} tolerance - How close counts as equal.
 * @returns {void}
 */
function assertClose(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance,
      `index ${i}: ${actual[i]} is not close to ${expected[i]}`);
  }
}

test('toPoints multiplies x and z by the aspect ratio', () => {
  const points = toPoints([{ x: 0.3, y: 0.5, z: 0.1 }], 2);
  assertClose(points[0], [0.6, 0.5, 0.2]);
});

test('centerOnWrist moves the wrist to (0, 0, 0)', () => {
  const points = toPoints(makeFakeHand());
  const centered = centerOnWrist(points);
  assertClose(centered[0], [0, 0, 0]);
  // Every other point moves by the same amount, so the shape is unchanged.
  assertClose(centered[9], [points[9][0] - points[0][0], points[9][1] - points[0][1], points[9][2] - points[0][2]]);
});

test('scaleByPalmSize makes the wrist-to-middle-knuckle distance exactly 1', () => {
  const centered = centerOnWrist(toPoints(makeFakeHand({ size: 0.25 })));
  assert.ok(Math.abs(palmSize(centered) - 0.25) < 1e-9);
  const scaled = scaleByPalmSize(centered);
  assert.ok(Math.abs(palmSize(scaled) - 1) < 1e-9);
});

test('scaleByPalmSize does not crash or make NaN when the palm size is 0', () => {
  const flat = new Array(21).fill(null).map(() => [0, 0, 0]);
  const scaled = scaleByPalmSize(flat);
  for (const point of scaled) {
    assert.deepEqual(point, [0, 0, 0]);
  }
});

test('mirrorX flips only the x coordinate', () => {
  assert.deepEqual(mirrorX([[1, 2, 3], [-4, 5, 6]]), [[-1, 2, 3], [4, 5, 6]]);
});

test('normalizeHand gives the same shape no matter where the hand is or how big it looks', () => {
  const bends = { index: 40, ring: 70 };
  const nearAndLeft = makeFakeHand({ bends, wrist: [0.2, 0.9], size: 0.3 });
  const farAndRight = makeFakeHand({ bends, wrist: [0.8, 0.6], size: 0.05 });
  const a = pointsToFeatures(normalizeHand(nearAndLeft));
  const b = pointsToFeatures(normalizeHand(farAndRight));
  assertClose(a, b, 1e-3);
});

test('normalizeHand undoes the aspect-ratio stretch of a wide camera', () => {
  const square = makeFakeHand({ aspectRatio: 1 });
  const wide = makeFakeHand({ aspectRatio: 16 / 9 });
  const a = pointsToFeatures(normalizeHand(square, { aspectRatio: 1 }));
  const b = pointsToFeatures(normalizeHand(wide, { aspectRatio: 16 / 9 }));
  assertClose(a, b, 1e-3);
});

test('normalizeHand mirrors a "Left" hand so it matches the same shape on a "Right" hand', () => {
  const bends = { thumb: 20, middle: 60 };
  const rightHand = makeFakeHand({ bends });
  const leftHand = makeFakeHand({ bends, mirror: true });
  const right = pointsToFeatures(normalizeHand(rightHand, { handedness: 'Right' }));
  const left = pointsToFeatures(normalizeHand(leftHand, { handedness: 'Left' }));
  assertClose(left, right, 1e-3);
});

test('the wrist ends up at the origin and the palm size is 1 after normalizeHand', () => {
  const points = normalizeHand(makeFakeHand({ wrist: [0.7, 0.4], size: 0.17 }));
  assertClose(points[0], [0, 0, 0]);
  assert.ok(Math.abs(distance3d(points[0], points[9]) - 1) < 1e-9);
});

test('pointsToFeatures makes 63 numbers and featuresToPoints turns them back', () => {
  const points = normalizeHand(makeFakeHand());
  const features = pointsToFeatures(points);
  assert.equal(features.length, 63);
  const back = featuresToPoints(features);
  assert.equal(back.length, 21);
  assertClose(back[8], points[8], 1e-4);
});

test('pointsToFeatures rounds to 4 decimal places', () => {
  assert.deepEqual(pointsToFeatures([[0.123456, -1.987654, 2]]), [0.1235, -1.9877, 2]);
});

test('averagePoints returns the point-by-point average, or null for no hands', () => {
  const handA = new Array(21).fill(null).map(() => [0, 0, 0]);
  const handB = new Array(21).fill(null).map(() => [2, 4, -6]);
  const average = averagePoints([handA, handB]);
  assert.deepEqual(average[5], [1, 2, -3]);
  assert.equal(averagePoints([]), null);
});
