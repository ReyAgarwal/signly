/**
 * progress.js
 * -----------
 * Keeps score of how well you sign each letter over time.
 *
 * Every time you lock in a letter during Learn mode or the Spell-a-Word
 * game, we save an "attempt":
 *     { letter: 'B', correct: true, mode: 'learn', time: 1735000000000 }
 *
 * This file turns that list of attempts into statistics:
 *   - accuracy for each letter (correct / total)
 *   - accuracy for each day (so you can see if you're improving)
 *   - a letter's accuracy over its most recent practice days
 *
 * No web page code here, so it can be unit tested in Node.
 */

/** We keep at most this many attempts so localStorage doesn't fill up. */
export const MAX_SAVED_ATTEMPTS = 5000;

/**
 * Creates one attempt record.
 * @param {string} letter - The letter the user was supposed to sign.
 * @param {boolean} correct - Whether they signed it correctly.
 * @param {string} mode - Where it happened: "learn" or "spell".
 * @param {number} timeMs - When it happened (milliseconds since 1970).
 * @returns {{letter:string, correct:boolean, mode:string, time:number}} The attempt.
 */
export function makeAttempt(letter, correct, mode, timeMs) {
  return { letter: letter, correct: correct, mode: mode, time: timeMs };
}

/**
 * Adds an attempt to the list, dropping the oldest ones if the list is too long.
 * @param {Array<Object>} attempts - Existing attempts (not changed).
 * @param {Object} attempt - The new attempt.
 * @param {number} maxAttempts - The most attempts to keep.
 * @returns {Array<Object>} A new list including the new attempt.
 */
export function addAttempt(attempts, attempt, maxAttempts = MAX_SAVED_ATTEMPTS) {
  const updated = [...attempts, attempt];
  if (updated.length > maxAttempts) {
    // Keep only the newest ones (the end of the list).
    return updated.slice(updated.length - maxAttempts);
  }
  return updated;
}

/**
 * Turns a time into a calendar day label like "2026-11-23" (local time).
 * @param {number} timeMs - Milliseconds since 1970.
 * @returns {string} The day as YYYY-MM-DD.
 */
export function dayKey(timeMs) {
  const date = new Date(timeMs);
  const year = date.getFullYear();
  // getMonth() counts from 0 (January = 0), so we add 1.
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * Calculates accuracy safely.
 * @param {number} correct - Number correct.
 * @param {number} total - Number of tries.
 * @returns {number} A fraction from 0 to 1 (0 if there were no tries).
 */
export function accuracyOf(correct, total) {
  if (total === 0) {
    return 0;
  }
  return correct / total;
}

/**
 * Adds one attempt to a {total, correct} counter.
 * @param {{total:number, correct:number}} counter - The counter to update.
 * @param {{correct:boolean}} attempt - The attempt to count.
 * @returns {void}
 */
function countAttempt(counter, attempt) {
  counter.total += 1;
  if (attempt.correct) {
    counter.correct += 1;
  }
}

/**
 * Computes accuracy for each letter.
 * @param {Array<{letter:string, correct:boolean}>} attempts - All attempts.
 * @returns {Object<string, {total:number, correct:number, accuracy:number}>} letter -> stats.
 */
export function statsByLetter(attempts) {
  const stats = {};
  for (const attempt of attempts) {
    if (!stats[attempt.letter]) {
      stats[attempt.letter] = { total: 0, correct: 0, accuracy: 0 };
    }
    countAttempt(stats[attempt.letter], attempt);
  }
  for (const letter of Object.keys(stats)) {
    stats[letter].accuracy = accuracyOf(stats[letter].correct, stats[letter].total);
  }
  return stats;
}

/**
 * Computes accuracy for each day, oldest day first.
 * @param {Array<{correct:boolean, time:number}>} attempts - Attempts to group.
 * @returns {Array<{day:string, total:number, correct:number, accuracy:number}>} One row per day.
 */
export function statsByDay(attempts) {
  const days = new Map();
  for (const attempt of attempts) {
    const key = dayKey(attempt.time);
    if (!days.has(key)) {
      days.set(key, { day: key, total: 0, correct: 0, accuracy: 0 });
    }
    countAttempt(days.get(key), attempt);
  }

  const rows = Array.from(days.values());
  for (const row of rows) {
    row.accuracy = accuracyOf(row.correct, row.total);
  }
  // "2026-11-01" < "2026-11-23" as text, so sorting the labels sorts by date.
  rows.sort((first, second) => first.day.localeCompare(second.day));
  return rows;
}

/**
 * Accuracy for one letter on each of its most recent practice days.
 * @param {Array<Object>} attempts - All attempts.
 * @param {string} letter - Which letter.
 * @param {number} maxDays - How many recent days to return.
 * @returns {Array<{day:string, total:number, correct:number, accuracy:number}>} Oldest first.
 */
export function letterHistory(attempts, letter, maxDays = 5) {
  const letterAttempts = attempts.filter((attempt) => attempt.letter === letter);
  const rows = statsByDay(letterAttempts);
  return rows.slice(Math.max(0, rows.length - maxDays));
}

/**
 * Totals for all attempts together.
 * @param {Array<{letter:string, correct:boolean}>} attempts - All attempts.
 * @returns {{total:number, correct:number, accuracy:number, lettersPracticed:number}} Summary.
 */
export function overallStats(attempts) {
  const counter = { total: 0, correct: 0 };
  const letters = new Set();
  for (const attempt of attempts) {
    countAttempt(counter, attempt);
    letters.add(attempt.letter);
  }
  return {
    total: counter.total,
    correct: counter.correct,
    accuracy: accuracyOf(counter.correct, counter.total),
    lettersPracticed: letters.size,
  };
}

/** One day in milliseconds (24 hours x 60 minutes x 60 seconds x 1000). */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts how many days in a row the user has practiced (with at least one
 * correct sign). If they haven't practiced yet today, the streak is still
 * alive from yesterday, so we start counting from yesterday.
 * @param {Array<{correct:boolean, time:number}>} attempts - All attempts.
 * @param {number} nowMs - The current time.
 * @returns {number} Days in a row (0 if no streak).
 */
export function practiceStreak(attempts, nowMs) {
  const goodDays = new Set();
  for (const attempt of attempts) {
    if (attempt.correct) {
      goodDays.add(dayKey(attempt.time));
    }
  }

  let day = nowMs;
  if (!goodDays.has(dayKey(day))) {
    day -= DAY_MS;
  }
  let streak = 0;
  while (goodDays.has(dayKey(day))) {
    streak += 1;
    day -= DAY_MS;
  }
  return streak;
}

/**
 * Suggests which letters to practice next: tried letters below 80%
 * accuracy (lowest first), then letters never practiced.
 * @param {Array<{letter:string, correct:boolean}>} attempts - All attempts.
 * @param {string[]} letters - Letters that can be practiced, in alphabet order.
 * @param {number} count - How many suggestions to return.
 * @returns {string[]} Letters to practice.
 */
export function lettersToPractice(attempts, letters, count = 5) {
  const stats = statsByLetter(attempts);
  const struggling = letters
    .filter((letter) => stats[letter] && stats[letter].accuracy < 0.8)
    .sort((first, second) => stats[first].accuracy - stats[second].accuracy);
  const neverTried = letters.filter((letter) => !stats[letter]);
  return [...struggling, ...neverTried].slice(0, count);
}
