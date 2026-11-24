/**
 * rank-photos.mjs
 * ---------------
 * Step 1 of picking the letter photos shown in the app (js/letterPhotos.js).
 *
 * For each letter and each of the 3 people in dataset 1, it ranks that
 * person's photos by how TYPICAL the hand shape is: the average distance from
 * the photo's hand to every OTHER person's hands for the same letter. A small
 * distance means "this is how most people make the letter", so it's a good
 * photo to learn from (and not someone's unusual version).
 *
 * Input:  tools/landmarks-photos.json  (MediaPipe hand points for candidate
 *         photos, made with tools/extract-landmarks.html; not in the repo)
 * Output: tools/photo-candidates.json  (the best 4 photos per letter per person)
 *
 * Run from the project folder:  node tools/rank-photos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeHand } from '../js/landmarks.js';
import { handFeatures } from '../js/features.js';
import { euclideanDistance } from '../js/classifier.js';

const INPUT = new URL('landmarks-photos.json', import.meta.url);
const OUTPUT = new URL('photo-candidates.json', import.meta.url);

/** Dataset 1 numbers its photos 1-1500: 1-500 person 1, 501-1000 person 2, 1001-1500 person 3. */
const PHOTOS_PER_PERSON = 500;

/** How many top photos to keep per letter per person. */
const KEEP = 4;

/**
 * Turns one MediaPipe result into a feature vector with its letter and person.
 * @param {{file:string, lm:number[][], w:number, h:number, hand:string}} result - e.g. file "A_12.jpg".
 * @returns {{file:string, letter:string, person:number, vector:number[]}} The photo's info.
 */
function describePhoto(result) {
  const [letter, rest] = result.file.split('_');
  const number = Number(rest.split('.')[0]);
  const landmarks = result.lm.map(([x, y, z]) => ({ x, y, z }));
  const points = normalizeHand(landmarks, { aspectRatio: result.w / result.h, handedness: result.hand });
  return { file: result.file, letter, person: 1 + Math.floor((number - 1) / PHOTOS_PER_PERSON), vector: handFeatures(points) };
}

/**
 * Ranks one person's photos of a letter, most typical first.
 * @param {Array<Object>} photos - All photos of this letter (every person).
 * @param {number} person - Which person's photos to rank.
 * @returns {Array<{file:string, score:number}>} The best photos, lowest score first.
 */
function rankPerson(photos, person) {
  const mine = photos.filter((photo) => photo.person === person);
  const others = photos.filter((photo) => photo.person !== person);
  const scored = mine.map((photo) => {
    let total = 0;
    for (const other of others) {
      total += euclideanDistance(photo.vector, other.vector);
    }
    return { file: photo.file, score: total / others.length };
  });
  scored.sort((first, second) => first.score - second.score);
  return scored.slice(0, KEEP);
}

const photos = JSON.parse(readFileSync(INPUT, 'utf8')).filter((result) => result.found).map(describePhoto);
const ranking = {};
for (const letter of [...new Set(photos.map((photo) => photo.letter))].sort()) {
  const ofLetter = photos.filter((photo) => photo.letter === letter);
  ranking[letter] = {};
  for (const person of [1, 2, 3]) {
    ranking[letter][person] = rankPerson(ofLetter, person);
  }
}
writeFileSync(OUTPUT, JSON.stringify(ranking, null, 1));
console.log('Ranked photos for', Object.keys(ranking).length, 'letters ->', OUTPUT.pathname);
