/**
 * quiz.js
 * -------
 * The reading quiz: "Which letter is this?"
 *
 * Signing is only half of fingerspelling; you also need to READ it when
 * someone else signs. The quiz shows a real photo (or a diagram) of a letter
 * and four choices. Wrong choices are usually look-alike letters, because
 * those are the ones people actually confuse.
 *
 * Pure logic (no web page code), so it can be unit tested.
 */

import { shuffle } from './games.js';
import { DRILL_PRESETS } from './drill.js';

/**
 * Finds letters that look similar to a letter (from the look-alike groups).
 * @param {string} letter - The letter.
 * @returns {string[]} Its look-alikes (may be empty).
 */
export function lookAlikesOf(letter) {
  const similar = new Set();
  for (const preset of DRILL_PRESETS) {
    if (preset.letters.includes(letter)) {
      for (const other of preset.letters) {
        if (other !== letter) {
          similar.add(other);
        }
      }
    }
  }
  return Array.from(similar);
}

/**
 * Makes one quiz question.
 * @param {string[]} letters - Letters that can be asked about.
 * @param {function(): number} random - Random number source (0 to 1).
 * @param {string|null} avoid - A letter not to ask (the previous answer), or null.
 * @returns {{answer:string, choices:string[]}} The right answer and 4 shuffled choices.
 */
export function makeQuestion(letters, random = Math.random, avoid = null) {
  const pool = letters.filter((letter) => letter !== avoid);
  const answer = pool[Math.floor(random() * pool.length)];

  // Prefer tricky wrong answers (look-alikes), then fill with random letters.
  const wrong = [];
  for (const letter of shuffle(lookAlikesOf(answer), random)) {
    if (letters.includes(letter) && wrong.length < 2) {
      wrong.push(letter);
    }
  }
  for (const letter of shuffle(letters, random)) {
    if (wrong.length >= 3) {
      break;
    }
    if (letter !== answer && !wrong.includes(letter)) {
      wrong.push(letter);
    }
  }
  return { answer, choices: shuffle([answer, ...wrong], random) };
}
