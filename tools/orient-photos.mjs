/**
 * orient-photos.mjs
 * -----------------
 * Step 2 of picking the letter photos (after rank-photos.mjs): decides
 * whether each candidate photo needs to be MIRRORED (flipped left-right) so
 * that it matches the app's diagrams (a right hand, as seen in the mirror video).
 *
 * WHY not just use MediaPipe's "Left"/"Right" label? On tightly cropped hand
 * photos that label was often wrong. Instead we compare the photo's 21 hand
 * points with the diagram's 21 points, both as-is and flipped, and keep the
 * version that lines up better. To compare fairly, both are centered and
 * scaled to the same size, then the photo is turned to the best-matching
 * angle (this is called a "Procrustes" fit, here rotation only).
 *
 * Input:  tools/landmarks-photos.json and tools/photo-candidates.json
 * Output: tools/photo-orientation.json  (per photo: flip or not, and how well it matched)
 *
 * Run from the project folder:  node tools/orient-photos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { buildHand } from '../js/handModel.js';
import { LETTER_POSES, MOTION_POSES } from '../js/handPoses.js';

const LANDMARKS = new URL('landmarks-photos.json', import.meta.url);
const CANDIDATES = new URL('photo-candidates.json', import.meta.url);
const OUTPUT = new URL('photo-orientation.json', import.meta.url);

/** How many of each person's top photos to check. */
const CHECK_PER_PERSON = 3;

/**
 * Moves 2D points so their center is at (0, 0) and scales them to size 1.
 * @param {number[][]} points - [x, y] points.
 * @returns {number[][]} The centered, scaled points.
 */
function centerAndScale(points) {
  let centerX = 0;
  let centerY = 0;
  for (const [x, y] of points) {
    centerX += x / points.length;
    centerY += y / points.length;
  }
  const moved = points.map(([x, y]) => [x - centerX, y - centerY]);
  let sumOfSquares = 0;
  for (const [x, y] of moved) {
    sumOfSquares += x * x + y * y;
  }
  const size = Math.sqrt(sumOfSquares / moved.length);
  return moved.map(([x, y]) => [x / size, y / size]);
}

/**
 * How badly two point sets match after turning the second one to its best angle.
 * @param {number[][]} target - Centered, scaled points (the diagram).
 * @param {number[][]} points - Centered, scaled points (the photo).
 * @returns {number} The leftover squared distance (0 = perfect match).
 */
function errorAfterBestTurn(target, points) {
  // The best angle has a known formula (from the "dot" and "cross" sums).
  let dotSum = 0;
  let crossSum = 0;
  for (let i = 0; i < target.length; i++) {
    dotSum += target[i][0] * points[i][0] + target[i][1] * points[i][1];
    crossSum += target[i][1] * points[i][0] - target[i][0] * points[i][1];
  }
  const angle = Math.atan2(crossSum, dotSum);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let error = 0;
  for (let i = 0; i < target.length; i++) {
    const x = cos * points[i][0] - sin * points[i][1];
    const y = sin * points[i][0] + cos * points[i][1];
    error += (target[i][0] - x) ** 2 + (target[i][1] - y) ** 2;
  }
  return error;
}

const photos = JSON.parse(readFileSync(LANDMARKS, 'utf8')).filter((result) => result.found);
const photoByFile = Object.fromEntries(photos.map((photo) => [photo.file, photo]));
const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8'));
const result = {};

for (const letter of Object.keys(candidates)) {
  const pose = LETTER_POSES[letter] ?? MOTION_POSES[letter];
  // Diagram y points up, photo y points down, so flip the diagram's y.
  const diagram = centerAndScale(buildHand(pose).landmarks.map((point) => [point[0], -point[1]]));
  result[letter] = [];
  for (const person of Object.keys(candidates[letter])) {
    for (const candidate of candidates[letter][person].slice(0, CHECK_PER_PERSON)) {
      const landmarks = photoByFile[candidate.file].lm;
      const asIs = errorAfterBestTurn(diagram, centerAndScale(landmarks.map(([x, y]) => [x, y])));
      const flipped = errorAfterBestTurn(diagram, centerAndScale(landmarks.map(([x, y]) => [-x, y])));
      result[letter].push({
        file: candidate.file,
        person: Number(person),
        mirror: flipped < asIs,
        error: Number(Math.min(asIs, flipped).toFixed(2)),
        // A big margin means we're confident about mirroring; a small one means "check by eye".
        margin: Number(Math.abs(asIs - flipped).toFixed(2)),
      });
    }
  }
}
writeFileSync(OUTPUT, JSON.stringify(result, null, 1));
console.log('Checked orientation for', Object.keys(result).length, 'letters ->', OUTPUT.pathname);
