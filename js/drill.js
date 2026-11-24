/**
 * drill.js
 * --------
 * Practice sets ("drills") for Learn mode: practice one letter, or a few
 * chosen letters, several times in a row instead of the whole alphabet.
 *
 *   - Pick letters yourself, or use a preset like "look-alikes: M N".
 *   - Choose how many times to practice each letter, and whether to shuffle.
 *   - At the end you get a summary: how many tries each letter took.
 *
 * Practicing look-alike letters side by side (like M and N) is one of the
 * best ways to learn the small differences between them.
 *
 * Pure logic (no web page code), so it can be unit tested.
 */

import { shuffle } from './games.js';

/** Ready-made practice sets of letters that are easy to mix up. */
export const DRILL_PRESETS = [
  { name: 'M · N', letters: ['M', 'N'] },
  { name: 'A · S · T · E', letters: ['A', 'S', 'T', 'E'] },
  { name: 'R · U · V', letters: ['R', 'U', 'V'] },
  { name: 'K · P · V', letters: ['K', 'P', 'V'] },
  { name: 'G · H · Q', letters: ['G', 'H', 'Q'] },
  { name: 'C · O', letters: ['C', 'O'] },
  { name: 'D · F · X', letters: ['D', 'F', 'X'] },
  { name: 'I · Y · L', letters: ['I', 'Y', 'L'] },
];

/** Smallest and largest number of repeats per letter. */
export const MIN_REPEATS = 1;
export const MAX_REPEATS = 10;

/**
 * Builds the order of letters to practice.
 * @param {string[]} letters - The chosen letters.
 * @param {number} repeats - How many times to practice each letter.
 * @param {boolean} mixUp - True to shuffle; false keeps each letter's repeats together (A A A, B B B).
 * @param {function(): number} random - Random number source (0 to 1).
 * @returns {string[]} The practice queue.
 */
export function buildDrillQueue(letters, repeats, mixUp, random = Math.random) {
  const count = Math.max(MIN_REPEATS, Math.min(MAX_REPEATS, repeats));
  const queue = [];
  for (const letter of letters) {
    for (let i = 0; i < count; i++) {
      queue.push(letter);
    }
  }
  if (!mixUp) {
    return queue;
  }
  // Mixed up: shuffle the letters once per round (each round has every letter
  // once). If a round would start with the letter the last round ended on,
  // swap its first two letters, so the learner never signs the same letter twice
  // in a row (unless only one letter was chosen).
  const mixed = [];
  for (let round = 0; round < count; round++) {
    const roundLetters = shuffle(letters, random);
    if (roundLetters.length > 1 && roundLetters[0] === mixed[mixed.length - 1]) {
      [roundLetters[0], roundLetters[1]] = [roundLetters[1], roundLetters[0]];
    }
    mixed.push(...roundLetters);
  }
  return mixed;
}

/**
 * Starts a practice set.
 * @param {string[]} letters - The chosen letters.
 * @param {number} repeats - Times to practice each letter.
 * @param {boolean} mixUp - Shuffle or not.
 * @param {function(): number} random - Random number source.
 * @returns {{letters:string[], queue:string[], position:number, results:Object<string,{tries:number, correct:number}>}}
 *   The drill state.
 */
export function createDrill(letters, repeats, mixUp, random = Math.random) {
  const results = {};
  for (const letter of letters) {
    results[letter] = { tries: 0, correct: 0 };
  }
  return { letters: [...letters], queue: buildDrillQueue(letters, repeats, mixUp, random), position: 0, results };
}

/**
 * The letter to practice right now.
 * @param {Object} drill - The drill state.
 * @returns {string|null} The letter, or null if the drill is finished.
 */
export function currentDrillLetter(drill) {
  return drill.queue[drill.position] ?? null;
}

/**
 * Records one locked-in sign during a drill.
 * @param {Object} drill - The drill state (changed in place).
 * @param {boolean} correct - Whether the sign matched the current letter.
 * @returns {boolean} True if the drill moved on to the next letter (only after a correct sign).
 */
export function recordDrillSign(drill, correct) {
  const letter = currentDrillLetter(drill);
  if (letter === null) {
    return false;
  }
  drill.results[letter].tries += 1;
  if (!correct) {
    return false;
  }
  drill.results[letter].correct += 1;
  drill.position += 1;
  return true;
}

/**
 * Skips the current letter (counts as a try, not as correct).
 * @param {Object} drill - The drill state (changed in place).
 * @returns {void}
 */
export function skipDrillLetter(drill) {
  const letter = currentDrillLetter(drill);
  if (letter !== null) {
    drill.results[letter].tries += 1;
    drill.position += 1;
  }
}

/**
 * Checks whether every letter in the queue has been done.
 * @param {Object} drill - The drill state.
 * @returns {boolean} True when finished.
 */
export function isDrillDone(drill) {
  return drill.position >= drill.queue.length;
}

/**
 * Summarizes a finished (or stopped) drill.
 * @param {Object} drill - The drill state.
 * @returns {{rows:Array<{letter:string, tries:number, correct:number, firstTry:boolean}>, needsWork:string[]}}
 *   One row per letter, and the letters that took extra tries.
 */
export function summarizeDrill(drill) {
  const rows = [];
  const needsWork = [];
  for (const letter of drill.letters) {
    const { tries, correct } = drill.results[letter];
    // Every extra try (beyond one per correct sign) means a miss or a skip.
    const perfect = tries > 0 && tries === correct;
    rows.push({ letter, tries, correct, firstTry: perfect });
    if (!perfect) {
      needsWork.push(letter);
    }
  }
  return { rows, needsWork };
}
