/**
 * reference.js
 * ------------
 * Loads the coach's "answer key": data/reference-hands.json.
 *
 * That file holds about 6,000 hands of REAL people signing the 24 static
 * letters, taken from two public research datasets (see data/ATTRIBUTION.md).
 * Only the 21 hand points of each photo are stored (already normalized), no
 * pictures. Because the coach compares you against real signers, it can't
 * "learn" a wrong handshape from you the way it could if it only used your
 * own recordings.
 *
 * parseReferenceFile() is pure (unit tested). loadReferenceHands() uses
 * fetch(), so it only runs in the browser.
 */

import { STATIC_LETTERS } from './letters.js';

/** Where the reference file lives (relative to index.html). */
export const REFERENCE_URL = 'data/reference-hands.json';

/** Each reference sample has 21 points x 3 numbers. */
const POINT_NUMBERS = 63;

/**
 * Turns the compact file format into easy-to-use sample objects.
 * In the file, each sample is a list: [letter, group number, 63 numbers].
 * @param {Object} file - The parsed JSON file.
 * @returns {{samples:Array<{letter:string, group:string, features:number[], source:string}>,
 *   groups:string[], sources:Array<Object>}} The reference samples and where they came from.
 */
export function parseReferenceFile(file) {
  const samples = [];
  for (const row of file.samples) {
    const letter = row[0];
    const numbers = row.slice(2);
    // Skip anything broken, so one bad row can't crash the app.
    if (!STATIC_LETTERS.includes(letter) || numbers.length !== POINT_NUMBERS) {
      continue;
    }
    samples.push({ letter, group: file.groups[row[1]], features: numbers, source: 'reference' });
  }
  return { samples, groups: file.groups, sources: file.sources };
}

/**
 * Downloads (from our own local server) and parses the reference file.
 * @returns {Promise<{samples:Array<Object>, groups:string[], sources:Array<Object>}>} The reference data.
 */
export async function loadReferenceHands() {
  const response = await fetch(REFERENCE_URL);
  if (!response.ok) {
    throw new Error('Could not load ' + REFERENCE_URL + ' (status ' + response.status + ')');
  }
  return parseReferenceFile(await response.json());
}
