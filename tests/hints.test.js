/**
 * hints.test.js
 * -------------
 * Tests for angles, finger bends, templates, and hint messages (js/hints.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  angleBetweenVectors, jointBend, fingerBend, allFingerBends, findFingerToFix,
  hintMessage, buildTemplate, averageBends,
} from '../js/hints.js';
import { normalizeHand, toPoints, pointsToFeatures } from '../js/landmarks.js';
import { makeFakeHand } from './helpers/fakeHand.js';

/**
 * Checks a number is within a tolerance of the expected value.
 * @param {number} actual - What we got.
 * @param {number} expected - What we wanted.
 * @param {number} tolerance - Allowed difference.
 * @returns {void}
 */
function assertNear(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`);
}

test('angleBetweenVectors: same direction is 0, perpendicular is 90, opposite is 180', () => {
  assertNear(angleBetweenVectors([1, 0, 0], [5, 0, 0]), 0);
  assertNear(angleBetweenVectors([1, 0, 0], [0, 2, 0]), 90);
  assertNear(angleBetweenVectors([1, 0, 0], [-1, 0, 0]), 180);
  assertNear(angleBetweenVectors([1, 0, 0], [1, 1, 0]), 45);
});

test('angleBetweenVectors returns 0 (not NaN) for a zero-length arrow', () => {
  assert.equal(angleBetweenVectors([0, 0, 0], [1, 0, 0]), 0);
});

test('jointBend is 0 for a straight line and 90 for an L shape', () => {
  assertNear(jointBend([0, 0, 0], [1, 0, 0], [2, 0, 0]), 0);
  assertNear(jointBend([0, 0, 0], [1, 0, 0], [1, 1, 0]), 90);
});

test('fingerBend is about 0 for every finger of a flat, straight hand', () => {
  const points = toPoints(makeFakeHand());
  const bends = allFingerBends(points);
  for (const finger of Object.keys(bends)) {
    assertNear(bends[finger], 0, 0.5);
  }
});

test('fingerBend adds up all three joints (3 joints x 60 degrees = 180)', () => {
  const points = toPoints(makeFakeHand({ bends: { index: 60 } }));
  assertNear(fingerBend(points, 'index'), 180, 0.5);
  assertNear(fingerBend(points, 'middle'), 0, 0.5);
});

test('finger bends do not change when the hand is moved, resized, or mirrored', () => {
  const bends = { index: 50, pinky: 20 };
  const original = allFingerBends(toPoints(makeFakeHand({ bends })));
  const normalized = allFingerBends(normalizeHand(
    makeFakeHand({ bends, wrist: [0.2, 0.3], size: 0.4, mirror: true }),
    { handedness: 'Left' },
  ));
  for (const finger of Object.keys(original)) {
    assertNear(normalized[finger], original[finger], 0.5);
  }
});

test('findFingerToFix says "curl" when a finger is too straight', () => {
  const user = { thumb: 10, index: 20, middle: 180, ring: 180, pinky: 180 };
  const target = { thumb: 10, index: 180, middle: 180, ring: 180, pinky: 180 };
  const fix = findFingerToFix(user, target, 30);
  assert.equal(fix.finger, 'index');
  assert.equal(fix.action, 'curl');
  assert.equal(hintMessage(fix), 'Curl your index finger more.');
});

test('findFingerToFix says "straighten" when a finger is bent too much', () => {
  const user = { thumb: 10, index: 0, middle: 0, ring: 0, pinky: 200 };
  const target = { thumb: 10, index: 0, middle: 0, ring: 0, pinky: 5 };
  const fix = findFingerToFix(user, target, 30);
  assert.equal(fix.finger, 'pinky');
  assert.equal(fix.action, 'straighten');
  assert.equal(hintMessage(fix), 'Straighten your pinky.');
});

test('findFingerToFix picks the finger that is MOST wrong', () => {
  const user = { thumb: 0, index: 50, middle: 0, ring: 100, pinky: 0 };
  const target = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  assert.equal(findFingerToFix(user, target, 30).finger, 'ring');
});

test('findFingerToFix returns null when every finger is within the threshold', () => {
  const user = { thumb: 15, index: 20, middle: 0, ring: 0, pinky: 0 };
  const target = { thumb: 0, index: 0, middle: 10, ring: 10, pinky: 10 };
  assert.equal(findFingerToFix(user, target, 30), null);
  assert.match(hintMessage(null), /thumb position/);
});

test('averageBends averages each finger separately', () => {
  const average = averageBends([
    { thumb: 0, index: 10, middle: 20, ring: 30, pinky: 40 },
    { thumb: 10, index: 30, middle: 20, ring: 10, pinky: 0 },
  ]);
  assert.deepEqual(average, { thumb: 5, index: 20, middle: 20, ring: 20, pinky: 20 });
});

test('buildTemplate averages the samples of one letter', () => {
  const straight = pointsToFeatures(normalizeHand(makeFakeHand()));
  const curled = pointsToFeatures(normalizeHand(makeFakeHand({ bends: { index: 60 } })));
  const samples = [
    { letter: 'B', features: straight },
    { letter: 'B', features: curled },
    { letter: 'S', features: curled },
  ];
  const template = buildTemplate(samples, 'B');
  assert.equal(template.count, 2);
  assert.equal(template.points.length, 21);
  // Half the B samples have index bend 0, half have 180, so the average is 90.
  assertNear(template.bends.index, 90, 1);
  assert.equal(buildTemplate(samples, 'Q'), null);
});
