/**
 * phrase.js
 * ---------
 * Turns text the user types ("Hello world!") into the list of letters to
 * fingerspell, for the Spell screen.
 *
 *   - Letters become UPPERCASE ("hello" -> H E L L O).
 *   - Spaces split the text into words (the Spell screen shows a gap).
 *   - J and Z are "motion letters": they're signed by moving your hand, which
 *     the coach can't check yet, so they get written instructions instead.
 *   - Numbers and punctuation are skipped (they have their own signs).
 *
 * Pure logic (no web page code), so it can be unit tested.
 */

import { isStaticLetter } from './letters.js';

/** Longest phrase we accept (about one sentence). */
export const MAX_PHRASE_LENGTH = 60;

/**
 * Splits typed text into fingerspelling steps.
 * @param {string} text - What the user typed.
 * @returns {{steps:Array<{letter:string, kind:'static'|'motion', wordIndex:number}>,
 *   words:string[], skipped:string[], tooLong:boolean}}
 *   steps = every letter in order; words = the cleaned-up words;
 *   skipped = characters we left out; tooLong = text was cut to the maximum length.
 */
export function parsePhrase(text) {
  const tooLong = text.length > MAX_PHRASE_LENGTH;
  const trimmed = text.slice(0, MAX_PHRASE_LENGTH);

  const words = [];
  const skipped = new Set();
  // Split on any run of spaces, so "hi   there" is still two words.
  for (const rawWord of trimmed.split(/\s+/)) {
    let word = '';
    for (const character of rawWord.toUpperCase()) {
      if (character >= 'A' && character <= 'Z') {
        word += character;
      } else if (character !== '') {
        skipped.add(character);
      }
    }
    if (word !== '') {
      words.push(word);
    }
  }

  const steps = [];
  words.forEach((word, wordIndex) => {
    for (const letter of word) {
      const kind = isStaticLetter(letter) ? 'static' : 'motion';
      steps.push({ letter, kind, wordIndex });
    }
  });

  return { steps, words, skipped: Array.from(skipped), tooLong };
}
