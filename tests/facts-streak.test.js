/**
 * facts-streak.test.js
 * --------------------
 * Tests for the fun-fact deck (js/facts.js), the practice streak and
 * "practice next" suggestions (js/progress.js), and J / Z letter data.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FactDeck, FUN_FACTS } from '../js/facts.js';
import { practiceStreak, lettersToPractice, makeAttempt } from '../js/progress.js';
import { ALPHABET, LETTER_TIPS, LETTER_MIXUPS, isMotionLetter, isStaticLetter } from '../js/letters.js';
import { MOTION_POSES } from '../js/handPoses.js';
import { buildHand } from '../js/handModel.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 24, 15, 0).getTime();

test('the fact deck shows every fact once before repeating any', () => {
  const deck = new FactDeck(FUN_FACTS, () => 0.42);
  const seen = new Set();
  for (let i = 0; i < FUN_FACTS.length; i++) {
    seen.add(deck.next().text);
  }
  assert.equal(seen.size, FUN_FACTS.length);
  assert.ok(deck.next().text, 'the deck reshuffles and keeps going');
  assert.match(deck.find('Left-handed signers').text, /left hand/i);
});

test('the streak counts days in a row with a correct sign', () => {
  const attempts = [
    makeAttempt('A', true, 'learn', NOW),
    makeAttempt('B', true, 'learn', NOW - DAY),
    makeAttempt('C', true, 'learn', NOW - 2 * DAY),
    makeAttempt('D', true, 'learn', NOW - 4 * DAY), // gap on day 3, so it doesn't count
  ];
  assert.equal(practiceStreak(attempts, NOW), 3);
});

test('the streak stays alive until the end of today, and wrong-only days don\'t count', () => {
  const yesterdayOnly = [makeAttempt('A', true, 'learn', NOW - DAY), makeAttempt('B', true, 'learn', NOW - 2 * DAY)];
  assert.equal(practiceStreak(yesterdayOnly, NOW), 2);
  assert.equal(practiceStreak([makeAttempt('A', false, 'learn', NOW)], NOW), 0);
  assert.equal(practiceStreak([], NOW), 0);
});

test('practice suggestions put the weakest letters first, then untried ones', () => {
  const attempts = [
    makeAttempt('A', true, 'learn', 1), makeAttempt('A', true, 'learn', 2),
    makeAttempt('B', false, 'learn', 3), makeAttempt('B', true, 'learn', 4),
    makeAttempt('C', false, 'learn', 5), makeAttempt('C', false, 'learn', 6),
  ];
  assert.deepEqual(lettersToPractice(attempts, ['A', 'B', 'C', 'D', 'E'], 4), ['C', 'B', 'D', 'E']);
  // A letter tried once and missed counts as struggling too.
  assert.deepEqual(lettersToPractice([makeAttempt('E', false, 'learn', 7)], ['A', 'E'], 2), ['E', 'A']);
});

test('J and Z are in the alphabet with tips, but are not checkable static letters', () => {
  assert.equal(ALPHABET.length, 26);
  for (const letter of ['J', 'Z']) {
    assert.ok(isMotionLetter(letter));
    assert.equal(isStaticLetter(letter), false);
    assert.ok(LETTER_TIPS[letter] && LETTER_MIXUPS[letter]);
    const hand = buildHand(MOTION_POSES[letter]);
    assert.ok(hand.landmarks.every((p) => p.every(Number.isFinite)));
    assert.ok(MOTION_POSES[letter].motion.path.length >= 2);
  }
});
