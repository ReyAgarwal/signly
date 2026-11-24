/**
 * drill-quiz.test.js
 * ------------------
 * Tests for practice sets (js/drill.js) and the reading quiz (js/quiz.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrillQueue, createDrill, currentDrillLetter, recordDrillSign, skipDrillLetter,
  isDrillDone, summarizeDrill, DRILL_PRESETS,
} from '../js/drill.js';
import { makeQuestion, lookAlikesOf } from '../js/quiz.js';
import { STATIC_LETTERS } from '../js/letters.js';

test('a drill queue repeats each letter the chosen number of times', () => {
  assert.deepEqual(buildDrillQueue(['M', 'N'], 3, false), ['M', 'M', 'M', 'N', 'N', 'N']);
  const mixed = buildDrillQueue(['M', 'N'], 3, true, Math.random);
  assert.equal(mixed.length, 6);
  assert.equal(mixed.filter((l) => l === 'M').length, 3);
});

test('a mixed-up drill avoids the same letter twice in a row when it can', () => {
  for (let run = 0; run < 20; run++) {
    const queue = buildDrillQueue(['A', 'S', 'T'], 2, true, Math.random);
    for (let i = 1; i < queue.length; i++) {
      assert.notEqual(queue[i], queue[i - 1], 'back-to-back repeat in ' + queue.join(''));
    }
  }
});

test('repeats are clamped between 1 and 10', () => {
  assert.equal(buildDrillQueue(['A'], 0, false).length, 1);
  assert.equal(buildDrillQueue(['A'], 99, false).length, 10);
});

test('a drill only moves on after a correct sign and summarizes the tries', () => {
  const drill = createDrill(['M', 'N'], 1, false);
  assert.equal(currentDrillLetter(drill), 'M');
  assert.equal(recordDrillSign(drill, false), false);
  assert.equal(currentDrillLetter(drill), 'M');
  assert.equal(recordDrillSign(drill, true), true);
  assert.equal(currentDrillLetter(drill), 'N');
  skipDrillLetter(drill);
  assert.equal(isDrillDone(drill), true);
  const { rows, needsWork } = summarizeDrill(drill);
  assert.deepEqual(rows[0], { letter: 'M', tries: 2, correct: 1, firstTry: false });
  assert.deepEqual(needsWork, ['M', 'N']);
});

test('presets only use the 24 letters the coach can check', () => {
  for (const preset of DRILL_PRESETS) {
    assert.ok(preset.letters.every((l) => STATIC_LETTERS.includes(l)), preset.name);
  }
});

test('quiz questions have 4 different choices including the answer, with look-alikes', () => {
  for (let i = 0; i < 50; i++) {
    const q = makeQuestion(STATIC_LETTERS, Math.random, 'A');
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.ok(q.choices.includes(q.answer));
    assert.notEqual(q.answer, 'A');
  }
  assert.ok(lookAlikesOf('M').includes('N'));
  const q = makeQuestion(['M', 'N', 'B', 'C', 'L'], () => 0);
  assert.ok(q.answer === 'M' && q.choices.includes('N'), 'M should come with its look-alike N');
});
