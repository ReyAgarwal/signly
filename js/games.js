/**
 * games.js
 * --------
 * The rules of the Spell-a-Word game (no web page code here, just logic).
 *
 * How the game works:
 *   - You get 60 seconds.
 *   - A short word appears, like "CAT". Sign it one letter at a time.
 *   - Each correct letter = +10 points. Finishing a word = +20 bonus.
 *   - A wrong letter costs nothing, but it is saved in your progress.
 *   - "Skip" moves to the next word.
 *   - When time runs out, the game is over.
 *
 * Only words made from letters you have recorded samples for are used.
 * If no real words fit, we make random "practice words" from your letters.
 *
 * The game "state" is a plain object, so it's easy to test and to inspect.
 */

/** Short words with no J or Z (those letters need motion). */
export const WORD_LIST = [
  'HI', 'NO', 'OK', 'CAT', 'DOG', 'HAT', 'SUN', 'BED', 'CUP', 'BAG',
  'FAN', 'PIG', 'COW', 'BOX', 'YES', 'RED', 'MOM', 'DAD', 'BUS', 'EGG',
  'BOOK', 'FISH', 'LOVE', 'HELP', 'PLAY', 'READ', 'SIGN', 'GOOD', 'BLUE',
  'MILK', 'HOME', 'TEAM', 'FROG', 'CAKE', 'STAR', 'TREE', 'WAVE', 'HAND',
];

/** Length of one game, in milliseconds (60 seconds). */
export const GAME_DURATION_MS = 60000;

/** Points for each correct letter. */
export const POINTS_PER_LETTER = 10;

/** Extra points for finishing a whole word. */
export const WORD_BONUS = 20;

/**
 * Checks whether every letter of a word is in the allowed set.
 * @param {string} word - For example "CAT".
 * @param {Set<string>} allowedLetters - Letters that have recorded samples.
 * @returns {boolean} True if the word can be played.
 */
export function wordUsesOnly(word, allowedLetters) {
  for (const letter of word) {
    if (!allowedLetters.has(letter)) {
      return false;
    }
  }
  return true;
}

/**
 * Picks the words from a list that can be spelled with the allowed letters.
 * @param {string[]} wordList - Candidate words.
 * @param {Set<string>} allowedLetters - Letters that have recorded samples.
 * @returns {string[]} The playable words.
 */
export function pickPlayableWords(wordList, allowedLetters) {
  const playable = [];
  for (const word of wordList) {
    if (wordUsesOnly(word, allowedLetters)) {
      playable.push(word);
    }
  }
  return playable;
}

/**
 * Makes a random "practice word" (like "BCA") from the allowed letters.
 * Used when none of the real words can be spelled yet.
 * @param {string[]} letters - Letters to choose from.
 * @param {number} length - How many letters long.
 * @param {function(): number} random - Random number source (0 to 1), e.g. Math.random.
 * @returns {string} The practice word.
 */
export function makePracticeWord(letters, length, random = Math.random) {
  let word = '';
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random() * letters.length);
    word += letters[index];
  }
  return word;
}

/**
 * Shuffles a list into a random order (Fisher-Yates shuffle).
 * @param {Array} items - The list to shuffle (it is not changed).
 * @param {function(): number} random - Random number source (0 to 1).
 * @returns {Array} A new, shuffled list.
 */
export function shuffle(items, random = Math.random) {
  const result = [...items];
  // Walk backwards; swap each item with a random item at or before it.
  // This gives every possible order an equal chance.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temporary = result[i];
    result[i] = result[j];
    result[j] = temporary;
  }
  return result;
}

/**
 * Builds the list of words for one game.
 * @param {string[]} recordedLetters - Letters that have recorded samples.
 * @param {function(): number} random - Random number source (0 to 1).
 * @returns {{words:string[], usingPracticeWords:boolean}} Words in play order.
 */
export function chooseGameWords(recordedLetters, random = Math.random) {
  const allowed = new Set(recordedLetters);
  const playable = pickPlayableWords(WORD_LIST, allowed);
  if (playable.length > 0) {
    return { words: shuffle(playable, random), usingPracticeWords: false };
  }

  // No real words fit, so make 10 practice "words" of 3 random letters each.
  const practiceWords = [];
  for (let i = 0; i < 10; i++) {
    practiceWords.push(makePracticeWord(recordedLetters, 3, random));
  }
  return { words: practiceWords, usingPracticeWords: true };
}

/**
 * Starts a new game.
 * @param {string[]} words - Words to play, in order (they repeat if we run out).
 * @param {number} nowMs - Current time in milliseconds.
 * @param {number} durationMs - How long the game lasts.
 * @returns {Object} The game state.
 */
export function createSpellGame(words, nowMs, durationMs = GAME_DURATION_MS) {
  return {
    words: words,
    wordIndex: 0,
    letterIndex: 0,
    score: 0,
    wordsCompleted: 0,
    lettersCorrect: 0,
    lettersWrong: 0,
    startTimeMs: nowMs,
    durationMs: durationMs,
  };
}

/**
 * Gets the word the player is spelling right now.
 * @param {Object} game - The game state.
 * @returns {string} The current word.
 */
export function currentWord(game) {
  // The % (remainder) makes the list wrap around: after the last word,
  // we go back to the first one instead of running off the end.
  return game.words[game.wordIndex % game.words.length];
}

/**
 * Gets the letter the player should sign next.
 * @param {Object} game - The game state.
 * @returns {string} The target letter.
 */
export function currentTargetLetter(game) {
  return currentWord(game)[game.letterIndex];
}

/**
 * How much time is left.
 * @param {Object} game - The game state.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {number} Milliseconds left (never below 0).
 */
export function timeLeftMs(game, nowMs) {
  const elapsed = nowMs - game.startTimeMs;
  return Math.max(0, game.durationMs - elapsed);
}

/**
 * Checks whether time has run out.
 * @param {Object} game - The game state.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {boolean} True if the game is over.
 */
export function isGameOver(game, nowMs) {
  return timeLeftMs(game, nowMs) === 0;
}

/**
 * Moves on to the next word.
 * @param {Object} game - The game state (changed in place).
 * @returns {void}
 */
export function goToNextWord(game) {
  game.wordIndex += 1;
  game.letterIndex = 0;
}

/**
 * Handles a letter the player locked in.
 * @param {Object} game - The game state (changed in place).
 * @param {string} letter - The letter that was recognized.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {{outcome:'correct'|'wrong'|'word-complete'|'game-over', expected:string|null}}
 *   What happened, plus which letter was expected.
 */
export function submitLetter(game, letter, nowMs) {
  if (isGameOver(game, nowMs)) {
    return { outcome: 'game-over', expected: null };
  }

  const expected = currentTargetLetter(game);
  if (letter !== expected) {
    game.lettersWrong += 1;
    return { outcome: 'wrong', expected: expected };
  }

  game.lettersCorrect += 1;
  game.score += POINTS_PER_LETTER;
  game.letterIndex += 1;

  // Did that letter finish the word?
  if (game.letterIndex >= currentWord(game).length) {
    game.score += WORD_BONUS;
    game.wordsCompleted += 1;
    goToNextWord(game);
    return { outcome: 'word-complete', expected: expected };
  }
  return { outcome: 'correct', expected: expected };
}
