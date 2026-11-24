/**
 * storage.js
 * ----------
 * Saves and loads all app data in the browser's localStorage, and turns it
 * into a JSON file you can export (download) and import (load back).
 *
 * Everything we save lives in ONE object:
 *   {
 *     version: 1,
 *     samples:  [ { id, letter, features: [63 numbers], hand, time, source }, ... ],
 *               (source = 'teacher' for samples added on the Add Samples screen,
 *                or 'learned' for samples saved automatically from correct signs)
 *     attempts: [ { letter, correct, mode, time }, ... ],
 *     bestScores: { easy: 0, medium: 0, hard: 0 }   (best Challenge score per difficulty)
 *   }
 *
 * Why export/import? localStorage only lives in ONE browser on ONE laptop.
 * Exporting lets teammates combine their recorded samples, and gives you a
 * backup before competition day.
 *
 * Every localStorage call is wrapped in try/catch because it can fail
 * (private browsing mode, storage full, or blocked by browser settings).
 * When it fails we return a friendly error message instead of crashing.
 */

import { isStaticLetter } from './letters.js';

/** The localStorage "key" (name) our data is saved under. */
export const STORAGE_KEY = 'aslFingerspellingCoach.v1';

/** Each sample has 21 points x 3 numbers = 63 numbers. */
export const FEATURE_LENGTH = 63;

/**
 * Creates a brand-new, empty data object.
 * @returns {{version:number, samples:Array, attempts:Array, bestScores:Object<string,number>}} Empty data.
 */
export function emptyData() {
  return { version: 1, samples: [], attempts: [], bestScores: { easy: 0, medium: 0, hard: 0 } };
}

/**
 * Gets the browser's localStorage, or null if it isn't available.
 * @returns {Storage|null} The storage object, or null.
 */
export function getBrowserStorage() {
  // Just touching window.localStorage can throw an error when the browser
  // blocks storage, so even this needs a try/catch.
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    return null;
  }
}

/**
 * Makes a unique ID for a sample (time + random letters).
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {string} An ID like "lq3x9k-4f8a2c".
 */
export function makeSampleId(nowMs = Date.now()) {
  const timePart = nowMs.toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return timePart + '-' + randomPart;
}

/**
 * Checks that a sample has the right shape, so bad data can't break the app.
 * @param {*} sample - Anything (usually from a file or localStorage).
 * @returns {boolean} True if it is a usable sample.
 */
export function isValidSample(sample) {
  if (!sample || typeof sample !== 'object') {
    return false;
  }
  if (!isStaticLetter(sample.letter)) {
    return false;
  }
  if (!Array.isArray(sample.features) || sample.features.length !== FEATURE_LENGTH) {
    return false;
  }
  for (const value of sample.features) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks that a progress attempt has the right shape.
 * @param {*} attempt - Anything.
 * @returns {boolean} True if it is a usable attempt.
 */
export function isValidAttempt(attempt) {
  if (!attempt || typeof attempt !== 'object') {
    return false;
  }
  return isStaticLetter(attempt.letter)
    && typeof attempt.correct === 'boolean'
    && typeof attempt.time === 'number';
}

/**
 * Builds a clean data object from untrusted input, keeping only valid parts.
 * @param {*} raw - Parsed JSON from localStorage or an imported file.
 * @returns {{version:number, samples:Array, attempts:Array, bestScores:Object<string,number>}} Clean data.
 */
export function cleanData(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') {
    return data;
  }

  if (Array.isArray(raw.samples)) {
    for (const sample of raw.samples) {
      if (isValidSample(sample)) {
        // Older or hand-made files might not have an ID, so we add one.
        const id = sample.id ?? makeSampleId(sample.time ?? Date.now());
        // "learned" = saved automatically from the user's correct signs.
        // Anything else (including old files) counts as added by a teacher.
        const source = sample.source === 'learned' ? 'learned' : 'teacher';
        data.samples.push({ ...sample, id: id, source: source });
      }
    }
  }

  if (Array.isArray(raw.attempts)) {
    data.attempts = raw.attempts.filter(isValidAttempt);
  }

  // Older versions saved one "bestSpellScore"; it was a 60-second game, like Medium.
  if (typeof raw.bestSpellScore === 'number') {
    data.bestScores.medium = raw.bestSpellScore;
  }
  if (raw.bestScores && typeof raw.bestScores === 'object') {
    for (const level of Object.keys(data.bestScores)) {
      if (typeof raw.bestScores[level] === 'number') {
        data.bestScores[level] = raw.bestScores[level];
      }
    }
  }
  return data;
}

/**
 * Loads saved data from localStorage.
 * @param {Storage|null} storage - Where to load from (defaults to the browser's localStorage).
 * @returns {{data:Object, error:string|null}} The data (empty if nothing saved) and any error.
 */
export function loadData(storage = getBrowserStorage()) {
  if (!storage) {
    return { data: emptyData(), error: 'This browser is blocking storage, so your samples will not be saved. Try a normal (not private/incognito) Chrome window.' };
  }
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text === null) {
      return { data: emptyData(), error: null };
    }
    return { data: cleanData(JSON.parse(text)), error: null };
  } catch (error) {
    return { data: emptyData(), error: 'Your saved data could not be read, so the app started fresh. If you exported a backup, use Import to load it.' };
  }
}

/**
 * Saves data to localStorage.
 * @param {Object} data - The full data object.
 * @param {Storage|null} storage - Where to save (defaults to the browser's localStorage).
 * @returns {{ok:boolean, error:string|null}} Whether it worked, and a friendly error if not.
 */
export function saveData(data, storage = getBrowserStorage()) {
  if (!storage) {
    return { ok: false, error: 'Storage is blocked in this browser, so changes were not saved. Use Export to keep a copy.' };
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, error: null };
  } catch (error) {
    // The most common reason is that the storage is full (about 5 MB).
    return { ok: false, error: 'Could not save: browser storage may be full. Export your data, then delete some samples.' };
  }
}

/**
 * Turns the data into nicely formatted JSON text for downloading.
 * @param {Object} data - The full data object.
 * @param {number} nowMs - Current time in milliseconds (recorded in the file).
 * @returns {string} The JSON text.
 */
export function makeExportJson(data, nowMs = Date.now()) {
  const fileContents = {
    app: 'asl-fingerspelling-coach',
    exportedAt: new Date(nowMs).toISOString(),
    ...data,
  };
  return JSON.stringify(fileContents, null, 2);
}

/**
 * Reads an imported JSON file's text into clean data.
 * @param {string} text - The file's contents.
 * @returns {{data:Object|null, error:string|null}} The clean data, or a friendly error.
 */
export function parseImportJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { data: null, error: 'That file is not valid JSON. Pick a file that was made with the Export button.' };
  }

  const data = cleanData(raw);
  if (data.samples.length === 0 && data.attempts.length === 0) {
    return { data: null, error: 'That file has no samples or progress in it. Pick a file that was made with the Export button.' };
  }
  return { data: data, error: null };
}

/**
 * Combines imported data into the current data without making duplicates.
 * @param {Object} current - The data already in the app.
 * @param {Object} incoming - The clean data from an imported file.
 * @returns {{data:Object, addedSamples:number, addedAttempts:number}} Merged data and counts.
 */
export function mergeData(current, incoming) {
  // Samples have IDs, so a sample that's already here is skipped.
  const knownSampleIds = new Set(current.samples.map((sample) => sample.id));
  const newSamples = incoming.samples.filter((sample) => !knownSampleIds.has(sample.id));

  // Attempts don't have IDs, so we treat "same letter + same time + same mode"
  // as the same attempt.
  const attemptKey = (attempt) => attempt.letter + '|' + attempt.time + '|' + attempt.mode;
  const knownAttempts = new Set(current.attempts.map(attemptKey));
  const newAttempts = incoming.attempts.filter((attempt) => !knownAttempts.has(attemptKey(attempt)));

  // Keep attempts in time order, because the progress code drops the
  // OLDEST attempts first when the list gets too long.
  const allAttempts = [...current.attempts, ...newAttempts];
  allAttempts.sort((first, second) => first.time - second.time);

  const merged = {
    version: 1,
    samples: [...current.samples, ...newSamples],
    attempts: allAttempts,
    bestScores: {
      easy: Math.max(current.bestScores.easy, incoming.bestScores.easy),
      medium: Math.max(current.bestScores.medium, incoming.bestScores.medium),
      hard: Math.max(current.bestScores.hard, incoming.bestScores.hard),
    },
  };
  return { data: merged, addedSamples: newSamples.length, addedAttempts: newAttempts.length };
}

// ---------- Settings (saved separately, because they belong to this laptop) ----------

/** The localStorage key for settings. */
export const SETTINGS_KEY = 'aslFingerspellingCoach.settings';

/** Settings used when nothing has been saved yet. */
export const DEFAULT_SETTINGS = {
  challengeDifficulty: 'medium',
  keepLearning: true,
  flipDiagrams: false,
  autoAdvance: true,
  spellPictureHints: true,
  // Photos of real signers: 'off' by default, because the labeled diagrams
  // are clearer for most learners. (A text value, so an older saved "true"
  // from before this change doesn't turn them back on.)
  photos: 'off',
  quickStartSeen: false,
};

/** Settings that must be one of a fixed list of values. */
const ALLOWED_VALUES = {
  challengeDifficulty: ['easy', 'medium', 'hard'],
  photos: ['on', 'off'],
};

/**
 * Loads settings, filling in defaults for anything missing or broken.
 * @param {Storage|null} storage - Where to load from (defaults to the browser's localStorage).
 * @returns {{challengeDifficulty:string, keepLearning:boolean, flipDiagrams:boolean, autoAdvance:boolean,
 *   spellPictureHints:boolean, photos:string, quickStartSeen:boolean}} The settings.
 */
export function loadSettings(storage = getBrowserStorage()) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!storage) {
    return settings;
  }
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}');
    // Only copy settings we know about, and only if they're the right type
    // (and, for settings with a fixed list of values, one of those values).
    for (const name of Object.keys(DEFAULT_SETTINGS)) {
      const sameType = typeof saved[name] === typeof DEFAULT_SETTINGS[name];
      const allowed = !ALLOWED_VALUES[name] || ALLOWED_VALUES[name].includes(saved[name]);
      if (sameType && allowed) {
        settings[name] = saved[name];
      }
    }
  } catch (error) {
    // Broken settings aren't worth bothering the user about; just use the defaults.
  }
  return settings;
}

/**
 * Saves settings. Failing to save settings is not serious, so errors are ignored.
 * @param {Object} settings - The settings object.
 * @param {Storage|null} storage - Where to save (defaults to the browser's localStorage).
 * @returns {boolean} True if it was saved.
 */
export function saveSettings(settings, storage = getBrowserStorage()) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    return false;
  }
}
