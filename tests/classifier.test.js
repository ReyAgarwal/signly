/**
 * classifier.test.js
 * ------------------
 * Tests for k-nearest neighbors and the accuracy test (js/classifier.js).
 * We use tiny 2-number "features" so the answers are easy to check by hand.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  euclideanDistance, findNearestNeighbors, countVotes, classify,
  splitHoldout, evaluateAccuracy, listConfusions,
} from '../js/classifier.js';

/**
 * Makes a sample with simple features.
 * @param {string} letter - The label.
 * @param {number[]} features - The numbers.
 * @param {number} time - When it was "recorded".
 * @returns {{letter:string, features:number[], time:number}} A sample.
 */
function sample(letter, features, time = 0) {
  return { letter, features, time };
}

// Two clear groups: "A" samples near (0, 0) and "B" samples near (10, 10).
const twoGroups = [
  sample('A', [0, 0]), sample('A', [1, 0]), sample('A', [0, 1]),
  sample('B', [10, 10]), sample('B', [9, 10]), sample('B', [10, 9]),
];

test('euclideanDistance uses the Pythagorean theorem (3-4-5 triangle)', () => {
  assert.equal(euclideanDistance([0, 0], [3, 4]), 5);
  assert.equal(euclideanDistance([1, 2, 3], [1, 2, 3]), 0);
});

test('findNearestNeighbors returns the k closest samples, closest first', () => {
  const neighbors = findNearestNeighbors([0.2, 0.1], twoGroups, 2);
  assert.equal(neighbors.length, 2);
  assert.equal(neighbors[0].letter, 'A');
  assert.ok(neighbors[0].distance <= neighbors[1].distance);
});

test('classify picks the letter of the nearby group', () => {
  assert.equal(classify([0.5, 0.5], twoGroups, 3).letter, 'A');
  assert.equal(classify([9.5, 9.5], twoGroups, 3).letter, 'B');
});

test('confidence is winning votes divided by k', () => {
  // With k = 5 near the A group: the 3 A's are closest, then 2 B's.
  const result = classify([0, 0], twoGroups, 5);
  assert.equal(result.letter, 'A');
  assert.equal(result.confidence, 3 / 5);
  // With k = 3 every neighbor is an A, so confidence is 100%.
  assert.equal(classify([0, 0], twoGroups, 3).confidence, 1);
});

test('classify still works when there are fewer samples than k', () => {
  const result = classify([0, 0], [sample('C', [1, 1])], 5);
  assert.equal(result.letter, 'C');
  assert.equal(result.confidence, 1);
});

test('classify returns null when there are no samples yet', () => {
  assert.equal(classify([0, 0], [], 5), null);
});

test('countVotes breaks a tie using the single closest sample', () => {
  const votes = countVotes([
    { letter: 'X', distance: 2 },
    { letter: 'Y', distance: 1 },
    { letter: 'X', distance: 3 },
    { letter: 'Y', distance: 4 },
  ]);
  // X and Y both have 2 votes, but Y has the closest sample (distance 1).
  assert.equal(votes[0].letter, 'Y');
  assert.equal(votes[0].votes, 2);
});

test('splitHoldout puts the newest 20% of each letter in the test set', () => {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    samples.push(sample('A', [i, 0], i));
    samples.push(sample('B', [i, 5], i));
  }
  samples.push(sample('C', [0, 9], 0)); // only one C sample

  const { train, test: testSet } = splitHoldout(samples, 0.2);
  assert.equal(testSet.filter((s) => s.letter === 'A').length, 2);
  assert.equal(testSet.filter((s) => s.letter === 'B').length, 2);
  // The held-out A samples are the newest ones (times 8 and 9).
  const heldOutTimes = testSet.filter((s) => s.letter === 'A').map((s) => s.time);
  assert.deepEqual(heldOutTimes, [8, 9]);
  // A letter with only 1 sample stays in training.
  assert.equal(testSet.some((s) => s.letter === 'C'), false);
  assert.equal(train.length + testSet.length, samples.length);
});

test('evaluateAccuracy scores 100% when letters are easy to tell apart', () => {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    samples.push(sample('A', [i * 0.1, 0]));
    samples.push(sample('B', [50 + i * 0.1, 50]));
  }
  const report = evaluateAccuracy(samples, { k: 3 });
  assert.equal(report.total, 4);
  assert.equal(report.accuracy, 1);
  assert.deepEqual(report.topConfusions, []);
});

test('evaluateAccuracy records which letters get confused', () => {
  // "M" samples are recorded first, then the last "N" samples are almost
  // identical to the M's, so they should be mistaken for M.
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(sample('M', [i * 0.01, 0]));
  }
  for (let i = 0; i < 8; i++) {
    samples.push(sample('N', [5, 5]));
  }
  samples.push(sample('N', [0.03, 0]));
  samples.push(sample('N', [0.04, 0]));

  const report = evaluateAccuracy(samples, { k: 3, testFraction: 0.2 });
  assert.ok(report.confusion.N.M >= 1, 'N should be confused with M at least once');
  assert.equal(report.topConfusions[0].actual, 'N');
  assert.equal(report.topConfusions[0].predicted, 'M');
  assert.ok(report.accuracy < 1);
});

test('listConfusions ignores correct answers and sorts mistakes by count', () => {
  const mistakes = listConfusions({ A: { A: 9, S: 1 }, M: { N: 3, M: 2 } });
  assert.deepEqual(mistakes, [
    { actual: 'M', predicted: 'N', count: 3 },
    { actual: 'A', predicted: 'S', count: 1 },
  ]);
});
