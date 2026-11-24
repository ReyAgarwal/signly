/**
 * phrase.test.js
 * --------------
 * Tests for turning typed text into fingerspelling steps (js/phrase.js),
 * used by the Spell screen.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhrase, MAX_PHRASE_LENGTH } from '../js/phrase.js';

test('letters become uppercase steps, split into words', () => {
  const { steps, words } = parsePhrase('Hi you');
  assert.deepEqual(words, ['HI', 'YOU']);
  assert.deepEqual(steps.map((s) => s.letter).join(''), 'HIYOU');
  assert.deepEqual(steps.map((s) => s.wordIndex), [0, 0, 1, 1, 1]);
});

test('J and Z are marked as motion letters', () => {
  const { steps } = parsePhrase('jazz');
  assert.deepEqual(steps.map((s) => s.kind), ['motion', 'static', 'motion', 'motion']);
});

test('numbers and punctuation are skipped and reported', () => {
  const { words, skipped } = parsePhrase('Hello, world 2!');
  assert.deepEqual(words, ['HELLO', 'WORLD']);
  assert.deepEqual(skipped.sort(), ['!', ',', '2']);
});

test('extra spaces and empty input are handled', () => {
  assert.deepEqual(parsePhrase('   a    b  ').words, ['A', 'B']);
  assert.equal(parsePhrase('').steps.length, 0);
  assert.equal(parsePhrase('123 ?!').steps.length, 0);
});

test('very long text is cut to the maximum length', () => {
  const result = parsePhrase('A'.repeat(MAX_PHRASE_LENGTH + 10));
  assert.equal(result.tooLong, true);
  assert.equal(result.steps.length, MAX_PHRASE_LENGTH);
});
