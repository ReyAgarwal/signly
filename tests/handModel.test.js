/**
 * handModel.test.js
 * -----------------
 * Tests for the diagram hand model (js/handModel.js), the letter recipes
 * (js/handPoses.js), and the diagram shape builder (js/diagram.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinger, solveTwoBoneJoint, rotatePoint, buildHand, length, subtract, BONE_LENGTHS,
} from '../js/handModel.js';
import { LETTER_POSES } from '../js/handPoses.js';
import { buildDiagramShapes } from '../js/diagram.js';
import { STATIC_LETTERS } from '../js/letters.js';

/**
 * Distance between two 3D points.
 * @param {number[]} a - First point.
 * @param {number[]} b - Second point.
 * @returns {number} The distance.
 */
function distance(a, b) {
  return length(subtract(a, b));
}

/**
 * Checks a number is within a tolerance of the expected value.
 * @param {number} actual - What we got.
 * @param {number} expected - What we wanted.
 * @param {number} tolerance - Allowed difference.
 * @returns {void}
 */
function assertNear(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`);
}

test('a straight finger points straight up and keeps its bone lengths', () => {
  const finger = buildFinger([0, 0, 0], [2, 1, 0.5], { spread: 0, flex: [0, 0, 0] });
  assert.deepEqual(finger.map((p) => p.map((n) => Number(n.toFixed(6)))), [[0, 0, 0], [0, 2, 0], [0, 3, 0], [0, 3.5, 0]]);
});

test('bending the knuckle 90 degrees points the finger toward the palm side (+z)', () => {
  const finger = buildFinger([0, 0, 0], [2, 1, 0.5], { spread: 0, flex: [90, 0, 0] });
  assertNear(finger[1][2], 2);
  assertNear(finger[1][1], 0);
});

test('rotatePoint turns a point 90 degrees around each axis', () => {
  const aroundZ = rotatePoint([1, 0, 0], 'z', 90);
  assertNear(aroundZ[0], 0);
  assertNear(aroundZ[1], 1);
  const aroundY = rotatePoint([0, 0, 1], 'y', 90);
  assertNear(aroundY[0], 1);
  const aroundX = rotatePoint([0, 1, 0], 'x', 90);
  assertNear(aroundX[2], 1);
});

test('solveTwoBoneJoint keeps both bone lengths and reaches a reachable target', () => {
  const base = [0, 0, 0];
  const target = [1.5, 1, 0];
  const joint = solveTwoBoneJoint(base, target, 1.3, 1.0, [0, 0, 1]);
  assertNear(distance(base, joint), 1.3, 1e-6);
  assertNear(distance(joint, target), 1.0, 1e-6);
});

test('every letter recipe builds 21 real (finite) points with correct bone lengths', () => {
  for (const letter of STATIC_LETTERS) {
    const hand = buildHand(LETTER_POSES[letter]);
    assert.equal(hand.landmarks.length, 21, letter);
    for (const point of hand.landmarks) {
      for (const value of point) {
        assert.ok(Number.isFinite(value), letter + ' has a broken point');
      }
    }
    // Index finger bones (landmarks 5-6, 6-7, 7-8) should keep their lengths after rotating.
    assertNear(distance(hand.landmarks[5], hand.landmarks[6]), BONE_LENGTHS.index[0], 1e-6);
    assertNear(distance(hand.landmarks[7], hand.landmarks[8]), BONE_LENGTHS.index[2], 1e-6);
  }
});

test('letters where the thumb touches a fingertip really touch (F, O, D), and W holds the pinky', () => {
  const pinkyGap = distance(buildHand(LETTER_POSES.W).landmarks[4], buildHand(LETTER_POSES.W).landmarks[20]);
  assert.ok(pinkyGap < 2, 'W: the thumb should be on the pinky, but is ' + pinkyGap.toFixed(2) + ' away');
  const touches = { F: 8, O: 8, D: 12 };
  for (const [letter, fingerPoint] of Object.entries(touches)) {
    const hand = buildHand(LETTER_POSES[letter]);
    const gap = distance(hand.landmarks[4], hand.landmarks[fingerPoint]);
    assert.ok(gap < 0.8, `${letter}: thumb tip is ${gap.toFixed(2)} away from the finger`);
  }
});

test('A, S, and T put the thumb where each letter needs it', () => {
  // Use each recipe without turning the hand, so x = across, y = up, z = out of the palm.
  const hand = (letter) => buildHand({ ...LETTER_POSES[letter], view: [] }).landmarks;
  const indexKnuckleX = hand('A')[5][0];
  // A: thumb tip BESIDE the fist, past the index finger's side.
  assert.ok(hand('A')[4][0] < indexKnuckleX - 0.5, 'A thumb should be on the side of the fist');
  // S: thumb tip further IN FRONT of the fingers than in T.
  assert.ok(hand('S')[4][2] > hand('T')[4][2] + 0.3, 'S thumb should be in front of the fingers');
  // T: thumb tip HIGHER than in S (it pokes up between the index and middle fingers).
  assert.ok(hand('T')[4][1] > hand('S')[4][1] + 0.3, 'T thumb tip should poke up higher');
});

test('the L thumb points sideways and the index points up', () => {
  const hand = buildHand(LETTER_POSES.L);
  const wrist = hand.landmarks[0];
  // Index tip is far above the wrist; thumb tip is far to the side.
  assert.ok(hand.landmarks[8][1] - wrist[1] > 6);
  assert.ok(Math.abs(hand.landmarks[4][0] - wrist[0]) > 3);
});

test('buildDiagramShapes sorts shapes back-to-front and marks the highlighted finger', () => {
  const hand = buildHand(LETTER_POSES.B);
  const { shapes, viewBox } = buildDiagramShapes(hand, { highlightFinger: 'index' });
  for (let i = 1; i < shapes.length; i++) {
    assert.ok(shapes[i].depth >= shapes[i - 1].depth, 'shapes must be in depth order');
  }
  const indexBones = shapes.filter((shape) => shape.finger === 'index');
  assert.equal(indexBones.length, 3);
  assert.ok(indexBones.every((shape) => shape.highlighted));
  assert.equal(viewBox[2], viewBox[3], 'the picture frame should be square');
});

test('flipping the diagram mirrors every x coordinate', () => {
  const hand = buildHand(LETTER_POSES.L);
  const normal = buildDiagramShapes(hand, {}).shapes.find((s) => s.finger === 'thumb');
  const flipped = buildDiagramShapes(hand, { flipX: true }).shapes.find((s) => s.finger === 'thumb');
  assertNear(flipped.from[0], -normal.from[0]);
  assertNear(flipped.from[1], normal.from[1]);
});
