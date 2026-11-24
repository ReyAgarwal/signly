/**
 * build-reference.mjs
 * -------------------
 * Builds data/reference-hands.json: the bundled "answer key" of real
 * signers' hands that the coach compares you against.
 *
 * Input: JSON files made by tools/extract-landmarks.html (MediaPipe's 21 hand
 * points for each dataset photo). See tools/README.md for the full process.
 *
 * What this script does:
 *   1. Normalizes every hand exactly like the app does (landmarks.js).
 *   2. Works out which PERSON (or recording) each photo came from.
 *   3. Keeps at most 50 samples per letter per person, so no one person
 *      dominates, and rounds numbers to 2 decimals to keep the file small.
 *   4. Tests the coach on people it has never seen ("leave one person out")
 *      and prints the accuracy.
 *
 * Usage: node tools/build-reference.mjs <dataset1-landmarks.json> <dataset2-landmarks.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeHand, pointsToFeatures, featuresToPoints } from '../js/landmarks.js';
import { handFeatures } from '../js/features.js';
import { classify } from '../js/classifier.js';
import { STATIC_LETTERS } from '../js/letters.js';

const MAX_PER_LETTER_PER_GROUP = 50;
const DECIMALS = 2;

/**
 * Figures out the letter and person-group of a photo from dataset 1
 * (file names like "G_517.jpg": photos 1-500, 501-1000, 1001-1500 are three different people).
 * @param {string} file - The photo's file name.
 * @returns {{letter:string, group:string}} Letter and group.
 */
function describeDataset1(file) {
  const [letter, numberPart] = file.split('_');
  const number = Number(numberPart.split('.')[0]);
  return { letter, group: 'ds1-person' + (1 + Math.floor((number - 1) / 500)) };
}

/**
 * Figures out the letter and recording-group of a photo from dataset 2
 * (file names start with the folder: Dataset_Original Train/Test, or Controlled Evaluation).
 * @param {string} file - The photo's file name (folders joined with "__").
 * @returns {{letter:string, group:string}} Letter and group.
 */
function describeDataset2(file) {
  const parts = file.split('__');
  if (parts[0].startsWith('Controlled')) {
    return { letter: parts[1], group: 'ds2-evaluation' };
  }
  return { letter: parts[2], group: parts[1] === 'Test' ? 'ds2-test' : 'ds2-train' };
}

/**
 * Loads one extraction file and normalizes every detected hand.
 * @param {string} path - The JSON file.
 * @param {function(string):{letter:string, group:string}} describe - Reads letter/group from a file name.
 * @returns {Array<{letter:string, group:string, features:number[]}>} Samples (features = 63 normalized numbers).
 */
function loadSamples(path, describe) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const samples = [];
  for (const entry of raw) {
    if (!entry.found) {
      continue;
    }
    const { letter, group } = describe(entry.file);
    if (!STATIC_LETTERS.includes(letter)) {
      continue;
    }
    const landmarks = entry.lm.map(([x, y, z]) => ({ x, y, z }));
    const points = normalizeHand(landmarks, { aspectRatio: entry.w / entry.h, handedness: entry.hand });
    samples.push({ letter, group, features: pointsToFeatures(points, DECIMALS) });
  }
  return samples;
}

/**
 * Keeps at most `limit` samples per letter per group, spread evenly.
 * @param {Array<Object>} samples - All samples.
 * @param {number} limit - The cap.
 * @returns {Array<Object>} The balanced samples.
 */
function balance(samples, limit) {
  const buckets = new Map();
  for (const sample of samples) {
    const key = sample.letter + '|' + sample.group;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(sample);
  }
  const kept = [];
  for (const bucket of buckets.values()) {
    // Pick evenly spaced samples, e.g. 50 out of 80 = every 1.6th one.
    const count = Math.min(limit, bucket.length);
    for (let k = 0; k < count; k++) {
      kept.push(bucket[Math.floor((k * bucket.length) / count)]);
    }
  }
  return kept;
}

/**
 * Leave-one-group-out test: for each person, train on everyone else.
 * @param {Array<Object>} samples - Balanced samples.
 * @returns {{groups:Object<string,number>, letters:Object<string,number>, overall:number}} Accuracies (0-1).
 */
function testOnUnseenPeople(samples) {
  const withVectors = samples.map((s) => ({ ...s, vector: handFeatures(featuresToPoints(s.features)) }));
  const groups = [...new Set(samples.map((s) => s.group))];
  const groupAccuracy = {};
  const letterCounts = {};
  let correctTotal = 0;
  for (const group of groups) {
    const train = withVectors.filter((s) => s.group !== group).map((s) => ({ letter: s.letter, features: s.vector }));
    const test = withVectors.filter((s) => s.group === group);
    let correct = 0;
    for (const sample of test) {
      const right = classify(sample.vector, train).letter === sample.letter;
      correct += right ? 1 : 0;
      letterCounts[sample.letter] = letterCounts[sample.letter] ?? { right: 0, total: 0 };
      letterCounts[sample.letter].right += right ? 1 : 0;
      letterCounts[sample.letter].total += 1;
    }
    groupAccuracy[group] = correct / test.length;
    correctTotal += correct;
  }
  const letters = {};
  for (const letter of Object.keys(letterCounts).sort()) {
    letters[letter] = letterCounts[letter].right / letterCounts[letter].total;
  }
  return { groups: groupAccuracy, letters, overall: correctTotal / samples.length };
}

const [dataset1Path, dataset2Path] = process.argv.slice(2);
const allSamples = [...loadSamples(dataset1Path, describeDataset1), ...loadSamples(dataset2Path, describeDataset2)];
const samples = balance(allSamples, MAX_PER_LETTER_PER_GROUP);
const groups = [...new Set(samples.map((s) => s.group))].sort();

const output = {
  about: 'Normalized MediaPipe hand landmarks (21 points x 3) of real people signing the 24 static ASL letters. '
    + 'Made from photos in two public datasets (see sources). No images are included. '
    + 'Each sample: [letter, group number, 63 numbers]. Numbers are already normalized by js/landmarks.js.',
  license: 'CC BY 4.0 (derived from the datasets below; see data/ATTRIBUTION.md)',
  sources: [
    {
      name: 'Images of American Sign Language (ASL) Alphabet Gestures',
      authors: 'Ab. Rahim Ahmed Sowrow, Md Iftekhar Alam Sarker Iftekhar, Sadia Islam Prova, Mohammad Rezwanul Huq (East West University)',
      doi: '10.17632/48dg9vhmyk.2',
      url: 'https://data.mendeley.com/datasets/48dg9vhmyk/2',
      license: 'CC BY 4.0',
    },
    {
      name: 'American Sign Language Image Dataset (fingerspelling original + keypoints + evaluation)',
      authors: 'Elisa Cabana Garceran del Vall (Colegio Universitario de Estudios Financieros)',
      doi: '10.17632/97yd3b5f5h.1',
      url: 'https://data.mendeley.com/datasets/97yd3b5f5h/1',
      license: 'CC BY 4.0',
    },
  ],
  groups,
  samples: samples.map((s) => [s.letter, groups.indexOf(s.group), ...s.features]),
};
writeFileSync(new URL('../data/reference-hands.json', import.meta.url), JSON.stringify(output));

console.log('samples kept:', samples.length, 'of', allSamples.length);
const perLetter = {};
for (const s of samples) {
  perLetter[s.letter] = (perLetter[s.letter] ?? 0) + 1;
}
console.log('per letter:', JSON.stringify(perLetter));
const report = testOnUnseenPeople(samples);
console.log('accuracy on unseen people, by group:', Object.fromEntries(Object.entries(report.groups).map(([g, a]) => [g, (a * 100).toFixed(1) + '%'])));
console.log('overall:', (report.overall * 100).toFixed(1) + '%');
console.log('by letter:', Object.entries(report.letters).map(([l, a]) => l + ' ' + Math.round(a * 100) + '%').join(', '));
