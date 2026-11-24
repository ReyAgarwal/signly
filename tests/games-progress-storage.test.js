/**
 * games-progress-storage.test.js
 * ------------------------------
 * Smaller tests for the Spell-a-Word rules (js/games.js), progress
 * statistics (js/progress.js), and saving/importing data (js/storage.js).
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChallengeGame, submitLetter, currentTargetLetter, currentWord, goToNextWord,
  timeLeftMs, isGameOver, chooseGameWords, POINTS_PER_LETTER, WORD_BONUS, DIFFICULTIES, getDifficulty,
} from '../js/games.js';
import { makeAttempt, statsByLetter, statsByDay, overallStats, addAttempt, letterHistory } from '../js/progress.js';
import {
  loadData, saveData, emptyData, parseImportJson, makeExportJson, mergeData, isValidSample, STORAGE_KEY,
} from '../js/storage.js';

/**
 * A pretend localStorage that keeps data in memory, for testing.
 * @returns {{getItem:function, setItem:function, data:Map}} The fake storage.
 */
function makeFakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

/**
 * Makes a valid-looking sample.
 * @param {string} letter - The letter.
 * @param {string} id - The sample ID.
 * @returns {Object} A sample with 63 features.
 */
function fakeSample(letter, id) {
  return { id, letter, features: new Array(63).fill(0.5), hand: 'Right', time: 1 };
}

// ---------- Spell-a-Word game ----------

test('spelling a word letter by letter scores points and a word bonus', () => {
  const game = createChallengeGame(['CAT', 'HI'], 0, 60000);
  assert.equal(currentTargetLetter(game), 'C');
  assert.equal(submitLetter(game, 'C', 1000).outcome, 'correct');
  assert.equal(submitLetter(game, 'X', 2000).outcome, 'wrong');
  assert.equal(submitLetter(game, 'A', 3000).outcome, 'correct');
  assert.equal(submitLetter(game, 'T', 4000).outcome, 'word-complete');
  assert.equal(game.score, 3 * POINTS_PER_LETTER + WORD_BONUS);
  assert.equal(game.lettersWrong, 1);
  assert.equal(currentWord(game), 'HI');
});

test('the game ends when time runs out', () => {
  const game = createChallengeGame(['HI'], 0, 60000);
  assert.equal(timeLeftMs(game, 59000), 1000);
  assert.equal(isGameOver(game, 60000), true);
  assert.equal(submitLetter(game, 'H', 61000).outcome, 'game-over');
});

test('skipping moves to the next word and the word list wraps around', () => {
  const game = createChallengeGame(['NO', 'OK'], 0, 60000);
  goToNextWord(game);
  assert.equal(currentWord(game), 'OK');
  goToNextWord(game);
  assert.equal(currentWord(game), 'NO');
});

test('chooseGameWords only uses known letters and the difficulty\'s word lengths', () => {
  const easy = chooseGameWords(['C', 'A', 'T', 'H', 'I'], 'easy', () => 0.5);
  assert.equal(easy.usingPracticeWords, false);
  assert.deepEqual([...easy.words].sort(), ['AT', 'CAT', 'HAT', 'HI', 'IT']);

  const allLetters = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split('');
  const hard = chooseGameWords(allLetters, 'hard', Math.random);
  assert.ok(hard.words.every((word) => word.length >= 4 && word.length <= 6));
  assert.ok(hard.words.every((word) => !word.includes('J') && !word.includes('Z')));
});

test('chooseGameWords makes practice words when no real word fits', () => {
  const { words, usingPracticeWords } = chooseGameWords(['Q', 'X'], 'medium', () => 0);
  assert.equal(usingPracticeWords, true);
  assert.equal(words[0], 'QQQ');
});

test('harder levels give less time, longer words, and more points per letter', () => {
  assert.ok(DIFFICULTIES.easy.durationMs > DIFFICULTIES.medium.durationMs);
  assert.ok(DIFFICULTIES.medium.durationMs > DIFFICULTIES.hard.durationMs);
  assert.equal(DIFFICULTIES.hard.pictures, false);
  assert.equal(getDifficulty('nonsense'), DIFFICULTIES.medium);

  const game = createChallengeGame(['HI'], 0, 45000, DIFFICULTIES.hard.multiplier);
  submitLetter(game, 'H', 1000);
  assert.equal(game.score, POINTS_PER_LETTER * 3);
});

// ---------- Progress ----------

test('statsByLetter and overallStats compute accuracy', () => {
  const attempts = [
    makeAttempt('A', true, 'learn', 0),
    makeAttempt('A', false, 'learn', 1),
    makeAttempt('B', true, 'spell', 2),
  ];
  const byLetter = statsByLetter(attempts);
  assert.equal(byLetter.A.accuracy, 0.5);
  assert.equal(byLetter.B.accuracy, 1);
  const overall = overallStats(attempts);
  assert.equal(overall.total, 3);
  assert.equal(overall.lettersPracticed, 2);
});

test('statsByDay groups attempts by calendar day, oldest first', () => {
  const day1 = new Date(2026, 10, 20, 10).getTime();
  const day2 = new Date(2026, 10, 21, 10).getTime();
  const rows = statsByDay([
    makeAttempt('A', true, 'learn', day2),
    makeAttempt('A', false, 'learn', day1),
    makeAttempt('A', true, 'learn', day1),
  ]);
  assert.deepEqual(rows.map((row) => row.day), ['2026-11-20', '2026-11-21']);
  assert.equal(rows[0].accuracy, 0.5);
  assert.equal(letterHistory([makeAttempt('A', true, 'learn', day1)], 'A').length, 1);
});

test('addAttempt drops the oldest attempts past the limit', () => {
  let attempts = [];
  for (let i = 0; i < 5; i++) {
    attempts = addAttempt(attempts, makeAttempt('A', true, 'learn', i), 3);
  }
  assert.deepEqual(attempts.map((attempt) => attempt.time), [2, 3, 4]);
});

// ---------- Storage ----------

test('saveData then loadData gives back the same data', () => {
  const storage = makeFakeStorage();
  const data = emptyData();
  data.samples.push(fakeSample('B', 's1'));
  assert.equal(saveData(data, storage).ok, true);
  const loaded = loadData(storage);
  assert.equal(loaded.error, null);
  assert.equal(loaded.data.samples.length, 1);
  assert.equal(loaded.data.samples[0].letter, 'B');
});

test('loadData recovers from broken saved data with a friendly message', () => {
  const storage = makeFakeStorage();
  storage.setItem(STORAGE_KEY, '{ this is not json');
  const loaded = loadData(storage);
  assert.equal(loaded.data.samples.length, 0);
  assert.match(loaded.error, /could not be read/);
});

test('saveData reports a friendly error when storage is full', () => {
  const fullStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const result = saveData(emptyData(), fullStorage);
  assert.equal(result.ok, false);
  assert.match(result.error, /full/);
});

test('import rejects bad files and keeps only valid samples', () => {
  assert.match(parseImportJson('nope').error, /not valid JSON/);
  const text = JSON.stringify({ samples: [fakeSample('A', 'a1'), { letter: 'J', features: [] }] });
  const result = parseImportJson(text);
  assert.equal(result.error, null);
  assert.equal(result.data.samples.length, 1);
  assert.equal(isValidSample({ letter: 'Z', features: new Array(63).fill(0) }), false);
});

test('export then import round-trips, and merging skips duplicates', () => {
  const current = emptyData();
  current.samples.push(fakeSample('A', 'a1'));
  const incoming = parseImportJson(makeExportJson({
    ...emptyData(),
    samples: [fakeSample('A', 'a1'), fakeSample('B', 'b1')],
    bestScores: { easy: 10, medium: 90, hard: 0 },
  })).data;
  const merged = mergeData(current, incoming);
  assert.equal(merged.addedSamples, 1);
  assert.equal(merged.data.samples.length, 2);
  assert.deepEqual(merged.data.bestScores, { easy: 10, medium: 90, hard: 0 });
});

test('an old saved "bestSpellScore" becomes the Medium best score', () => {
  const text = JSON.stringify({ samples: [fakeSample('A', 'a1')], bestSpellScore: 70 });
  assert.equal(parseImportJson(text).data.bestScores.medium, 70);
});
