/**
 * features-reference-learning.test.js
 * -----------------------------------
 * Tests for the feature vector (js/features.js), the bundled real-signer
 * reference data (js/reference.js + data/reference-hands.json), the
 * "keep learning" safety rules (js/learning.js), and the fair
 * leave-one-person-out accuracy test (js/classifier.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handFeatures, palmFrame, FEATURE_LENGTH } from '../js/features.js';
import { parseReferenceFile } from '../js/reference.js';
import { shouldLearn, addLearnedSample, countBySource, LEARNED_PER_LETTER } from '../js/learning.js';
import { evaluateUnseenPeople } from '../js/classifier.js';
import { normalizeHand, featuresToPoints } from '../js/landmarks.js';
import { STATIC_LETTERS } from '../js/letters.js';
import { makeFakeHand } from './helpers/fakeHand.js';

/**
 * Rotates every point around the z axis (tilting the hand in the picture).
 * @param {number[][]} points - Points as [x, y, z].
 * @param {number} degrees - How far to tilt.
 * @returns {number[][]} The tilted points.
 */
function tilt(points, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return points.map(([x, y, z]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z]);
}

const referenceFile = JSON.parse(readFileSync(new URL('../data/reference-hands.json', import.meta.url), 'utf8'));
const reference = parseReferenceFile(referenceFile);

// ---------- Features ----------

test('the feature vector has 86 numbers, all real', () => {
  const features = handFeatures(normalizeHand(makeFakeHand({ bends: { index: 40 } })));
  assert.equal(features.length, FEATURE_LENGTH);
  assert.ok(features.every(Number.isFinite));
});

test('the palm frame directions are 1 unit long and at right angles', () => {
  const frame = palmFrame(normalizeHand(makeFakeHand({ bends: { ring: 60 } })));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const v of [frame.across, frame.up, frame.facing]) {
    assert.ok(Math.abs(dot(v, v) - 1) < 1e-9);
  }
  assert.ok(Math.abs(dot(frame.across, frame.up)) < 1e-9);
  assert.ok(Math.abs(dot(frame.up, frame.facing)) < 1e-9);
});

test('tilting the hand does not change the SHAPE part, but does change the DIRECTION part', () => {
  const points = normalizeHand(makeFakeHand({ bends: { middle: 50, pinky: 70 } }));
  const straight = handFeatures(points);
  const tilted = handFeatures(tilt(points, 25));
  for (let i = 0; i < 63; i++) {
    assert.ok(Math.abs(straight[i] - tilted[i]) < 1e-9, 'shape number ' + i + ' changed');
  }
  const directionChange = Math.abs(straight[63] - tilted[63]) + Math.abs(straight[64] - tilted[64]);
  assert.ok(directionChange > 0.1, 'direction should notice the tilt');
});

// ---------- Reference data ----------

test('the reference file covers all 24 letters with plenty of real hands each', () => {
  const counts = {};
  for (const sample of reference.samples) {
    counts[sample.letter] = (counts[sample.letter] ?? 0) + 1;
  }
  for (const letter of STATIC_LETTERS) {
    assert.ok((counts[letter] ?? 0) >= 200, letter + ' has only ' + counts[letter] + ' samples');
  }
});

test('the reference file comes from several different people and credits its sources', () => {
  const groups = new Set(reference.samples.map((s) => s.group));
  assert.ok(groups.size >= 4, 'expected at least 4 people/recordings, got ' + groups.size);
  assert.equal(reference.sources.length, 2);
  for (const source of reference.sources) {
    assert.equal(source.license, 'CC BY 4.0');
    assert.ok(source.doi && source.authors);
  }
});

test('every reference sample is a valid normalized hand (wrist at 0, palm size about 1)', () => {
  for (const sample of reference.samples) {
    assert.equal(sample.features.length, 63);
    const points = featuresToPoints(sample.features);
    assert.deepEqual(points[0], [0, 0, 0]);
    const palm = Math.hypot(...points[9]);
    assert.ok(palm > 0.97 && palm < 1.03, 'palm size ' + palm);
  }
});

test('parseReferenceFile skips broken rows instead of crashing', () => {
  const parsed = parseReferenceFile({ groups: ['g'], sources: [], samples: [['A', 0, 1, 2], ['Z', 0, ...new Array(63).fill(0)], ['B', 0, ...new Array(63).fill(0)]] });
  assert.equal(parsed.samples.length, 1);
  assert.equal(parsed.samples[0].letter, 'B');
});

// ---------- Keep learning ----------

test('the coach only learns when the target, the lock, AND the real signers all agree', () => {
  assert.equal(shouldLearn('B', 'B', { letter: 'B', confidence: 1 }), true);
  assert.equal(shouldLearn('B', 'B', { letter: 'B', confidence: 0.8 }), true);
  assert.equal(shouldLearn('B', 'B', { letter: 'B', confidence: 0.6 }), false, 'real signers not sure enough');
  assert.equal(shouldLearn('B', 'B', { letter: 'D', confidence: 1 }), false, 'real signers disagree');
  assert.equal(shouldLearn('B', 'D', { letter: 'D', confidence: 1 }), false, 'wrong letter was signed');
  assert.equal(shouldLearn('B', 'B', null), false);
});

test('learned samples are capped per letter, dropping the oldest first', () => {
  let samples = [{ letter: 'A', source: 'teacher', id: 't1' }];
  for (let i = 0; i < LEARNED_PER_LETTER + 5; i++) {
    samples = addLearnedSample(samples, { letter: 'A', source: 'learned', id: 'l' + i });
  }
  const learned = samples.filter((s) => s.source === 'learned');
  assert.equal(learned.length, LEARNED_PER_LETTER);
  assert.equal(learned[0].id, 'l5', 'the 5 oldest should be gone');
  assert.ok(samples.some((s) => s.id === 't1'), 'teacher samples are never removed');
  assert.deepEqual(countBySource(samples), { teacher: 1, learned: LEARNED_PER_LETTER });
});

// ---------- Fair accuracy test ----------

test('evaluateUnseenPeople never lets a person be compared with their own samples', () => {
  // Person "p1" signs A at (0,0) and B at (10,10). Person "p2" signs them the
  // same way. Person "p3" is the only one with a C, so with p3 hidden, C can't
  // possibly be recognized: the test must count it as wrong.
  const samples = [];
  for (const group of ['p1', 'p2']) {
    for (let i = 0; i < 3; i++) {
      samples.push({ group, letter: 'A', features: [0, i * 0.1] });
      samples.push({ group, letter: 'B', features: [10, 10 + i * 0.1] });
    }
  }
  samples.push({ group: 'p3', letter: 'C', features: [50, 50] });
  const report = evaluateUnseenPeople(samples, { k: 3 });
  assert.equal(report.perGroup.p1.correct, report.perGroup.p1.total);
  assert.equal(report.perGroup.p3.correct, 0);
  assert.equal(report.total, 13);
});
