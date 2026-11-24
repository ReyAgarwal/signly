/**
 * crop-photos.mjs
 * ---------------
 * Step 3 of preparing the letter photos (after rank-photos.mjs and
 * orient-photos.mjs): makes every photo a clean square of the same size, so
 * they look tidy side by side.
 *
 * The dataset's photos are 300 x 300, but most of them are really a narrower
 * (or wider) photo with WHITE bars added to make them square, and a few also
 * have black bars. So for each photo listed in js/letterPhotos.js we:
 *   1. find the real photo inside the bars (ffmpeg's "cropdetect" finds
 *      black borders, so we look for white ones by first turning the picture
 *      into its negative, where white becomes black),
 *   2. cut the real photo out and mirror it if letterPhotos.js says "mirrored",
 *   3. fit it into a 300 x 300 square, filling the empty space with a blurred,
 *      zoomed-in copy of the same photo (instead of plain white bars),
 *   4. save it as a JPEG in images/letters/.
 *
 * Input:  tools/photos/<original file>  (photos from dataset 1, not in the repo)
 * Needs:  ffmpeg installed (it does the detecting, cutting, blurring, and resizing).
 *
 * Run from the project folder:  node tools/crop-photos.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { LETTER_PHOTOS } from '../js/letterPhotos.js';

const PROJECT = new URL('../', import.meta.url);
const PHOTOS = new URL('photos/', import.meta.url);

/** Size of the saved photos, in pixels. */
const OUTPUT_SIZE = 300;

/**
 * Asks ffmpeg's cropdetect for the box that is NOT border.
 * @param {string} input - The photo file.
 * @param {string} before - Filters to run first (for example a crop or "negate").
 * @param {number} limit - How dark (0 to 1) a pixel can be and still count as border.
 * @returns {{width:number, height:number, x:number, y:number}} The box, in pixels.
 */
function detectBox(input, before, limit) {
  const filters = (before ? before + ',' : '') + 'cropdetect=limit=' + limit + ':round=2:skip=0:reset=0';
  // cropdetect reports on stderr (ffmpeg's message output), so we read that.
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loop', '1', '-i', input, '-frames:v', '3', '-vf', filters, '-f', 'null', '-'],
    { encoding: 'utf8' });
  const matches = (result.stderr ?? '').match(/crop=\d+:\d+:\d+:\d+/g);
  if (!matches) {
    throw new Error('cropdetect found nothing for ' + input);
  }
  const [width, height, x, y] = matches[matches.length - 1].slice(5).split(':').map(Number);
  return { width, height, x, y };
}

/**
 * Finds the real photo inside the white and black bars.
 * @param {string} input - The photo file.
 * @returns {{width:number, height:number, x:number, y:number}} The photo's box, in pixels.
 */
function findPhotoInsideBars(input) {
  // White bars: in the negative, white becomes black, so cropdetect can find it.
  const white = detectBox(input, 'negate', 0.12);
  // Black bars, looking only inside the box we just found.
  const crop = 'crop=' + white.width + ':' + white.height + ':' + white.x + ':' + white.y;
  const black = detectBox(input, crop, 0.08);
  return { width: black.width, height: black.height, x: white.x + black.x, y: white.y + black.y };
}

/**
 * Builds the ffmpeg filter that makes the final square picture.
 * @param {{width:number, height:number, x:number, y:number}} box - The real photo.
 * @param {boolean} mirrored - True to flip it left-right.
 * @returns {string} The filter (a small "graph" of steps, joined with semicolons).
 */
function squareFilter(box, mirrored) {
  const size = OUTPUT_SIZE;
  const cut = 'crop=' + box.width + ':' + box.height + ':' + box.x + ':' + box.y + (mirrored ? ',hflip' : '');
  return [
    // Two copies of the cut-out photo: one for the background, one for the front.
    '[0]' + cut + ',split[back][front]',
    // Background: zoomed in to fill the whole square, blurred, and a bit faded.
    '[back]scale=' + size + ':' + size + ':force_original_aspect_ratio=increase,crop=' + size + ':' + size
      + ',boxblur=16:2,eq=brightness=0.06:saturation=0.6[blurred]',
    // Front: the whole photo, as big as fits inside the square.
    '[front]scale=' + size + ':' + size + ':force_original_aspect_ratio=decrease:flags=lanczos[photo]',
    // Put the photo in the middle of the blurred background.
    '[blurred][photo]overlay=(W-w)/2:(H-h)/2',
  ].join(';');
}

for (const [letter, photos] of Object.entries(LETTER_PHOTOS)) {
  for (const photo of photos) {
    const input = new URL(photo.original, PHOTOS).pathname;
    const box = findPhotoInsideBars(input);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input,
      '-filter_complex', squareFilter(box, photo.mirrored), '-frames:v', '1', '-q:v', '3',
      new URL(photo.src, PROJECT).pathname]);
    console.log(letter, photo.src, 'photo inside bars:', box.width + 'x' + box.height, photo.mirrored ? '(mirrored)' : '');
  }
}
