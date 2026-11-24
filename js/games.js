/**
 * games.js
 * --------
 * The rules of the timed Challenge (no web page code here, just logic).
 *
 * How the Challenge works:
 *   - Pick a difficulty. It decides how long the words are, how much time
 *     you get, whether picture hints are allowed, and a points multiplier.
 *   - A word appears, like "CAT". Sign it one letter at a time.
 *   - Each correct letter = 10 points, finishing a word = 20 bonus points,
 *     and both are multiplied by the difficulty's multiplier.
 *   - A wrong letter costs nothing, but it is saved in your progress.
 *   - "Skip" moves to the next word. When time runs out, the game is over.
 *
 * Only words made from letters the coach can recognize are used.
 * If no real words fit, we make random "practice words" from those letters.
 *
 * The game "state" is a plain object, so it's easy to test and to inspect.
 */

/** Words with no J or Z (those letters need motion), from 2 to 6 letters long. */
export const WORD_LIST = [
  // 2 letters
  'HI', 'NO', 'OK', 'GO', 'UP', 'ME', 'WE', 'BE', 'DO', 'SO', 'MY', 'IT', 'IS', 'AT', 'IN', 'ON', 'TO', 'US', 'BY', 'OF',
  // 3 letters
  'CAT', 'DOG', 'HAT', 'SUN', 'BED', 'CUP', 'BAG', 'FAN', 'PIG', 'COW', 'BOX', 'YES', 'RED', 'MOM', 'DAD',
  'BUS', 'EGG', 'HOT', 'BIG', 'RUN', 'FUN', 'SEA', 'TEA', 'KEY', 'ICE', 'ART', 'MAP', 'PEN', 'TOY', 'OWL', 'BEE',
  // 4 letters
  'BOOK', 'FISH', 'LOVE', 'HELP', 'PLAY', 'READ', 'SIGN', 'GOOD', 'BLUE', 'MILK', 'HOME', 'TEAM', 'FROG',
  'CAKE', 'STAR', 'TREE', 'WAVE', 'HAND', 'BIRD', 'RAIN', 'SNOW', 'KIND', 'CODE', 'GAME', 'SHOE', 'BOAT',
  'DUCK', 'LION', 'WOLF', 'MOON', 'ROCK', 'LEAF', 'SOUP', 'RICE',
  // 5-6 letters
  'HOUSE', 'WATER', 'HAPPY', 'PLANT', 'MUSIC', 'PHONE', 'LIGHT', 'TABLE', 'CHAIR', 'APPLE', 'BREAD', 'GREEN',
  'BLACK', 'WHITE', 'SMILE', 'THANK', 'WORLD', 'HELLO', 'DANCE', 'TRAIN', 'CLOUD', 'RIVER', 'TIGER', 'HORSE',
  'MOUSE', 'SHEEP', 'CANDY', 'PAPER', 'SPORT', 'FRIEND', 'ORANGE', 'PURPLE', 'SUMMER', 'WINTER', 'GARDEN',
  'FAMILY', 'PEOPLE', 'SISTER', 'MOTHER', 'FATHER', 'LETTER', 'PENCIL', 'ANIMAL', 'YELLOW', 'FLOWER', 'PLANET',
];

/**
 * The difficulty levels. Harder = longer words, less time, no pictures,
 * and a bigger points multiplier so scores reward the extra challenge.
 */
export const DIFFICULTIES = {
  easy: { label: 'Easy', minLength: 2, maxLength: 3, durationMs: 90000, multiplier: 1, pictures: true },
  medium: { label: 'Medium', minLength: 3, maxLength: 4, durationMs: 60000, multiplier: 2, pictures: true },
  hard: { label: 'Hard', minLength: 4, maxLength: 6, durationMs: 45000, multiplier: 3, pictures: false },
};

/** Points for each correct letter (before the multiplier). */
export const POINTS_PER_LETTER = 10;

/** Extra points for finishing a whole word (before the multiplier). */
export const WORD_BONUS = 20;

/**
 * Checks whether every letter of a word is in the allowed set.
 * @param {string} word - For example "CAT".
 * @param {Set<string>} allowedLetters - Letters the coach can recognize.
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
 * Picks the words that can be spelled with the allowed letters and fit the length range.
 * @param {string[]} wordList - Candidate words.
 * @param {Set<string>} allowedLetters - Letters the coach can recognize.
 * @param {number} minLength - Shortest word allowed.
 * @param {number} maxLength - Longest word allowed.
 * @returns {string[]} The playable words.
 */
export function pickPlayableWords(wordList, allowedLetters, minLength = 1, maxLength = Infinity) {
  const playable = [];
  for (const word of wordList) {
    const rightLength = word.length >= minLength && word.length <= maxLength;
    if (rightLength && wordUsesOnly(word, allowedLetters)) {
      playable.push(word);
    }
  }
  return playable;
}

/**
 * Makes a random "practice word" (like "BCA") from the allowed letters.
 * Used when none of the real words can be spelled.
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
 * Looks up a difficulty level, falling back to Medium for unknown names.
 * @param {string} name - "easy", "medium", or "hard".
 * @returns {{label:string, minLength:number, maxLength:number, durationMs:number,
 *   multiplier:number, pictures:boolean}} The settings for that level.
 */
export function getDifficulty(name) {
  return DIFFICULTIES[name] ?? DIFFICULTIES.medium;
}

/**
 * Builds the list of words for one game.
 * @param {string[]} knownLetters - Letters the coach can recognize.
 * @param {string} difficultyName - "easy", "medium", or "hard".
 * @param {function(): number} random - Random number source (0 to 1).
 * @returns {{words:string[], usingPracticeWords:boolean}} Words in play order.
 */
export function chooseGameWords(knownLetters, difficultyName = 'medium', random = Math.random) {
  const level = getDifficulty(difficultyName);
  const allowed = new Set(knownLetters);
  const playable = pickPlayableWords(WORD_LIST, allowed, level.minLength, level.maxLength);
  if (playable.length > 0) {
    return { words: shuffle(playable, random), usingPracticeWords: false };
  }

  // No real words fit, so make 10 practice "words" of random letters.
  const practiceWords = [];
  for (let i = 0; i < 10; i++) {
    practiceWords.push(makePracticeWord(knownLetters, level.minLength, random));
  }
  return { words: practiceWords, usingPracticeWords: true };
}

/**
 * Starts a new Challenge.
 * @param {string[]} words - Words to play, in order (they repeat if we run out).
 * @param {number} nowMs - Current time in milliseconds.
 * @param {number} durationMs - How long the game lasts.
 * @param {number} multiplier - Points multiplier for the difficulty.
 * @returns {Object} The game state.
 */
export function createChallengeGame(words, nowMs, durationMs = DIFFICULTIES.medium.durationMs, multiplier = 1) {
  return {
    words: words,
    wordIndex: 0,
    letterIndex: 0,
    score: 0,
    multiplier: multiplier,
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
  game.score += POINTS_PER_LETTER * game.multiplier;
  game.letterIndex += 1;

  // Did that letter finish the word?
  if (game.letterIndex >= currentWord(game).length) {
    game.score += WORD_BONUS * game.multiplier;
    game.wordsCompleted += 1;
    goToNextWord(game);
    return { outcome: 'word-complete', expected: expected };
  }
  return { outcome: 'correct', expected: expected };
}
