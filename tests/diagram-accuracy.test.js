/**
 * diagram-accuracy.test.js
 * ------------------------
 * Checks that the handshape DIAGRAMS agree with REAL signers.
 *
 * For each letter we compare the diagram (js/handPoses.js) with the average
 * of the real signers in data/reference-hands.json:
 *   1. Each finger (index to pinky) must be bent about as much as real signers bend it.
 *   2. The coach (k-NN trained on real signers) should recognize most diagrams
 *      as the right letter.
 * If someone changes a recipe and the drawing drifts away from how real people
 * sign, these tests fail. See tools/fit-diagrams.mjs for a detailed report.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReferenceFile } from '../js/reference.js';
import { featuresToPoints, normalizeHand } from '../js/landmarks.js';
import { allFingerBends } from '../js/hints.js';
import { handFeatures } from '../js/features.js';
import { classify } from '../js/classifier.js';
import { buildHand } from '../js/handModel.js';
import { LETTER_POSES } from '../js/handPoses.js';
import { STATIC_LETTERS } from '../js/letters.js';

const reference = parseReferenceFile(JSON.parse(readFileSync(new URL('../data/reference-hands.json', import.meta.url), 'utf8'))).samples;

/**
 * Average finger bends of the real signers for one letter.
 * @param {string} letter - The letter.
 * @returns {Object<string, number>} finger -> average bend in degrees.
 */
function realBends(letter) {
  const hands = reference.filter((s) => s.letter === letter);
  const totals = { index: 0, middle: 0, ring: 0, pinky: 0 };
  for (const sample of hands) {
    const bends = allFingerBends(featuresToPoints(sample.features));
    for (const finger of Object.keys(totals)) {
      totals[finger] += bends[finger] / hands.length;
    }
  }
  return totals;
}

/**
 * Turns a diagram into a normalized "camera" hand the coach can classify.
 * The diagram is a right hand seen in a mirror; a camera picture is the
 * mirror image with y pointing down.
 * @param {string} letter - The letter.
 * @returns {number[][]} 21 normalized points.
 */
function diagramAsCameraHand(letter) {
  const points = buildHand(LETTER_POSES[letter]).landmarks;
  const picture = points.map(([x, y, z]) => ({ x: 0.5 - x * 0.05, y: 0.6 - y * 0.05, z: -z * 0.05 }));
  return normalizeHand(picture, { handedness: 'Right' });
}

test('every diagram bends each finger about as much as real signers do', () => {
  const problems = [];
  for (const letter of STATIC_LETTERS) {
    const real = realBends(letter);
    const diagram = allFingerBends(buildHand(LETTER_POSES[letter]).landmarks);
    for (const finger of Object.keys(real)) {
      // MediaPipe never measures a straight finger as perfectly straight
      // (real "straight" fingers read about 25-75 degrees), so a straight
      // diagram finger counts as matching a real finger under 80 degrees.
      const bothStraight = diagram[finger] < 30 && real[finger] < 80;
      const difference = Math.abs(diagram[finger] - real[finger]);
      if (!bothStraight && difference > 70) {
        problems.push(`${letter} ${finger}: diagram ${Math.round(diagram[finger])}°, real ${Math.round(real[finger])}°`);
      }
    }
  }
  assert.deepEqual(problems, [], 'Diagram finger bends far from real signers:\n' + problems.join('\n'));
});

test('the coach recognizes at least 20 of the 24 diagrams as the right letter', () => {
  const pool = reference.map((s) => ({ letter: s.letter, features: handFeatures(featuresToPoints(s.features)) }));
  const wrong = [];
  for (const letter of STATIC_LETTERS) {
    const guess = classify(handFeatures(diagramAsCameraHand(letter)), pool, 9);
    if (guess.letter !== letter) {
      wrong.push(letter + '→' + guess.letter);
    }
  }
  assert.ok(wrong.length <= 4, 'Too many diagrams look like a different letter: ' + wrong.join(', '));
});
