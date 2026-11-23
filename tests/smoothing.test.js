/**
 * smoothing.test.js
 * -----------------
 * Tests for the majority vote and hold-to-lock logic (js/smoothing.js).
 * We pretend frames arrive every 33 ms (about 30 frames per second).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { majorityVote, LetterSmoother } from '../js/smoothing.js';

const FRAME_MS = 33;

/**
 * Feeds a list of guesses into a smoother, one frame at a time.
 * @param {LetterSmoother} smoother - The smoother to feed.
 * @param {Array<string|null>} guesses - One guess per frame.
 * @param {number} startMs - Time of the first frame.
 * @returns {{results:Array<Object>, endMs:number}} Every frame's result and the next frame time.
 */
function feed(smoother, guesses, startMs = 0) {
  const results = [];
  let now = startMs;
  for (const guess of guesses) {
    results.push(smoother.update(guess, now));
    now += FRAME_MS;
  }
  return { results, endMs: now };
}

/**
 * Makes a list with the same value repeated.
 * @param {*} value - The value.
 * @param {number} count - How many times.
 * @returns {Array} The list.
 */
function repeat(value, count) {
  return new Array(count).fill(value);
}

test('majorityVote finds the most common label', () => {
  assert.deepEqual(majorityVote(['A', 'B', 'A', 'A', 'C']), { label: 'A', count: 3 });
  assert.deepEqual(majorityVote([null, null, 'B']), { label: null, count: 2 });
  assert.deepEqual(majorityVote([]), { label: null, count: 0 });
});

test('a letter is not stable until enough of the window agrees', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const { results } = feed(smoother, repeat('B', 6));
  // Frames 1-5 are not enough (5/10 = 50%), frame 6 makes 60%.
  assert.equal(results[4].stableLetter, null);
  assert.equal(results[5].stableLetter, 'B');
});

test('a letter locks in only after being held for the hold time', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const { results } = feed(smoother, repeat('B', 40));
  const lockFrames = results
    .map((result, index) => (result.lockedLetter ? index : -1))
    .filter((index) => index >= 0);

  // Exactly one lock, even though B was held for 40 frames.
  assert.equal(lockFrames.length, 1);
  // B becomes stable at frame 5 (time 165 ms), so it locks at 165 + 500 = 665 ms or later.
  const lockTimeMs = lockFrames[0] * FRAME_MS;
  assert.ok(lockTimeMs >= 665, `locked too early at ${lockTimeMs} ms`);
  assert.ok(lockTimeMs <= 665 + FRAME_MS, `locked too late at ${lockTimeMs} ms`);
  assert.equal(results[lockFrames[0]].lockedLetter, 'B');
});

test('holdProgress goes from 0 up to 1 while holding', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const { results } = feed(smoother, repeat('A', 30));
  assert.equal(results[0].holdProgress, 0);
  assert.ok(results[12].holdProgress > 0 && results[12].holdProgress < 1);
  assert.equal(results[29].holdProgress, 1);
});

test('one wobbly frame does not break the hold', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const guesses = [...repeat('C', 10), 'O', ...repeat('C', 20)];
  const { results } = feed(smoother, guesses);
  const locks = results.filter((result) => result.lockedLetter === 'C');
  assert.equal(locks.length, 1);
  assert.equal(results[10].stableLetter, 'C');
});

test('switching letters restarts the hold timer and can lock the new letter', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const { results } = feed(smoother, [...repeat('A', 30), ...repeat('B', 30)]);
  const locked = results.map((result) => result.lockedLetter).filter((letter) => letter !== null);
  assert.deepEqual(locked, ['A', 'B']);
});

test('no hand (null) never locks', () => {
  const smoother = new LetterSmoother();
  const { results } = feed(smoother, repeat(null, 50));
  assert.equal(results.some((result) => result.lockedLetter !== null), false);
  assert.equal(results[49].stableLetter, null);
});

test('reset() lets the same letter lock again (needed for double letters like "BOOK")', () => {
  const smoother = new LetterSmoother({ windowSize: 10, minAgreement: 0.6, holdMs: 500 });
  const first = feed(smoother, repeat('O', 30));
  assert.equal(first.results.filter((r) => r.lockedLetter === 'O').length, 1);

  smoother.reset();
  const second = feed(smoother, repeat('O', 30), first.endMs);
  assert.equal(second.results.filter((r) => r.lockedLetter === 'O').length, 1);
});
