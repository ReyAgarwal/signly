/**
 * landmarks.js
 * ------------
 * Turns MediaPipe's 21 hand points into a clean, comparable "hand shape".
 *
 * MediaPipe gives us 21 landmarks (points) for a hand. Each has x, y, z.
 * But two pictures of the SAME letter can have very different numbers if
 * the hand is in a different spot, closer to the camera, or is a left hand
 * instead of a right hand. So before comparing hands we "normalize" them:
 *
 *   1. Fix the stretched picture (x and y are measured in different units).
 *   2. Move the wrist to (0, 0, 0)          -> position no longer matters.
 *   3. Divide by the palm size              -> distance from camera no longer matters.
 *   4. Mirror left hands into right hands   -> either hand works.
 *
 * After that, the 21 points (x, y, z each) are flattened into a list of
 * 63 numbers called a "feature vector". That's what the k-NN classifier uses.
 *
 * Landmark numbers (from MediaPipe):
 *   0 = wrist
 *   1-4   = thumb  (base -> tip)
 *   5-8   = index  (knuckle -> tip)
 *   9-12  = middle (knuckle -> tip)
 *   13-16 = ring   (knuckle -> tip)
 *   17-20 = pinky  (knuckle -> tip)
 *
 * This file is pure math (no web page code), so it can be unit tested in Node.
 */

/** How many points MediaPipe gives for one hand. */
export const LANDMARK_COUNT = 21;

/** Index of the wrist point. */
export const WRIST = 0;

/** Index of the middle finger's big knuckle (where it meets the palm). */
export const MIDDLE_KNUCKLE = 9;

/** Which landmark numbers belong to each finger, from the base to the tip. */
export const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

/** Finger names in thumb-to-pinky order. */
export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/**
 * Pairs of landmark numbers that are connected by a "bone" line when we
 * draw the hand skeleton. The palm lines connect the knuckles together.
 */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/**
 * Converts MediaPipe landmarks ({x, y, z} objects) into simple [x, y, z]
 * arrays, and fixes the "stretched picture" problem.
 *
 * @param {Array<{x:number, y:number, z:number}>} landmarks - 21 points from MediaPipe.
 * @param {number} aspectRatio - Video width divided by video height (e.g. 640/480).
 * @returns {number[][]} 21 points as [x, y, z] arrays.
 */
export function toPoints(landmarks, aspectRatio = 1) {
  // MediaPipe measures x as "fraction of the video WIDTH" and y as
  // "fraction of the video HEIGHT". On a 640x480 camera, x = 0.1 is 64 pixels
  // but y = 0.1 is only 48 pixels. Multiplying x by the aspect ratio
  // (640 / 480 = 1.33) puts x and y in the same units, so a square stays square.
  // MediaPipe says z uses roughly the same scale as x, so it gets the same fix.
  const points = [];
  for (const landmark of landmarks) {
    points.push([landmark.x * aspectRatio, landmark.y, landmark.z * aspectRatio]);
  }
  return points;
}

/**
 * Subtracts point b from point a (gives the arrow pointing from b to a).
 * @param {number[]} a - Point [x, y, z].
 * @param {number[]} b - Point [x, y, z].
 * @returns {number[]} The difference [ax - bx, ay - by, az - bz].
 */
export function subtractPoints(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Straight-line distance between two 3D points.
 * @param {number[]} a - Point [x, y, z].
 * @param {number[]} b - Point [x, y, z].
 * @returns {number} The distance (always 0 or more).
 */
export function distance3d(a, b) {
  // This is the Pythagorean theorem extended to 3D:
  // distance = square root of (dx^2 + dy^2 + dz^2)
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Moves the hand so the wrist sits exactly at (0, 0, 0).
 * @param {number[][]} points - 21 points as [x, y, z].
 * @returns {number[][]} New points; the wrist is now [0, 0, 0].
 */
export function centerOnWrist(points) {
  // If your hand is in the top-left of the video or the bottom-right,
  // the letter is the same. Subtracting the wrist position from every
  // point "slides" the whole hand so the wrist is at the origin.
  const wrist = points[WRIST];
  const centered = [];
  for (const point of points) {
    centered.push(subtractPoints(point, wrist));
  }
  return centered;
}

/**
 * Measures the palm size: the distance from the wrist to the middle knuckle.
 * @param {number[][]} points - 21 points as [x, y, z].
 * @returns {number} The palm size in the same units as the points.
 */
export function palmSize(points) {
  return distance3d(points[WRIST], points[MIDDLE_KNUCKLE]);
}

/**
 * Resizes the hand so the palm size becomes exactly 1.
 * @param {number[][]} points - 21 points, already centered on the wrist.
 * @returns {number[][]} New points where wrist-to-middle-knuckle distance is 1.
 */
export function scaleByPalmSize(points) {
  // A hand close to the camera looks big; far away it looks small.
  // Dividing every coordinate by the palm size makes every hand
  // "1 palm" big, so size stops mattering, only SHAPE matters.
  const size = palmSize(points);

  // Guard: a palm size of 0 would mean dividing by zero (broken data).
  // In that case we return the points unchanged instead of crashing.
  if (size === 0) {
    return points.map((point) => [...point]);
  }

  const scaled = [];
  for (const point of points) {
    scaled.push([point[0] / size, point[1] / size, point[2] / size]);
  }
  return scaled;
}

/**
 * Flips the hand left-to-right (like looking in a mirror).
 * @param {number[][]} points - 21 points, centered on the wrist.
 * @returns {number[][]} New points with every x multiplied by -1.
 */
export function mirrorX(points) {
  // A left hand is a mirror image of a right hand. Since the wrist is at
  // x = 0, flipping the sign of x mirrors the hand across the wrist.
  // Now a left-hand "B" looks just like a right-hand "B".
  const mirrored = [];
  for (const point of points) {
    mirrored.push([-point[0], point[1], point[2]]);
  }
  return mirrored;
}

/**
 * Decides whether a hand should be mirrored, based on MediaPipe's label.
 * @param {string} handednessLabel - "Left" or "Right", as MediaPipe reports it.
 * @returns {boolean} True if this hand should be flipped.
 */
export function shouldMirror(handednessLabel) {
  // We flip every hand MediaPipe calls "Left" so ALL hands end up facing
  // the same way. (Because our video is not mirrored before MediaPipe sees
  // it, the label may be the opposite of the hand you think you're using.
  // That's OK! All that matters is that we flip the same way every time.)
  return handednessLabel === 'Left';
}

/**
 * Runs the full normalization: fix stretch, center, scale, and mirror.
 * @param {Array<{x:number, y:number, z:number}>} landmarks - 21 MediaPipe points.
 * @param {{aspectRatio?: number, handedness?: string}} options
 *   aspectRatio = video width / height; handedness = "Left" or "Right".
 * @returns {number[][]} 21 normalized points as [x, y, z].
 */
export function normalizeHand(landmarks, options = {}) {
  const aspectRatio = options.aspectRatio ?? 1;
  const handedness = options.handedness ?? 'Right';

  const points = toPoints(landmarks, aspectRatio);
  const centered = centerOnWrist(points);
  const scaled = scaleByPalmSize(centered);

  if (shouldMirror(handedness)) {
    return mirrorX(scaled);
  }
  return scaled;
}

/**
 * Turns 21 points into one flat list of 63 numbers: [x0, y0, z0, x1, y1, z1, ...].
 * @param {number[][]} points - 21 points as [x, y, z].
 * @param {number} decimals - How many decimal places to keep (saves storage space).
 * @returns {number[]} The 63-number feature vector.
 */
export function pointsToFeatures(points, decimals = 4) {
  // Rounding to 4 decimal places keeps plenty of detail (1/10000 of a palm)
  // while making saved samples much smaller in localStorage.
  const factor = 10 ** decimals;
  const features = [];
  for (const point of points) {
    for (const value of point) {
      features.push(Math.round(value * factor) / factor);
    }
  }
  return features;
}

/**
 * The reverse of pointsToFeatures: turns 63 numbers back into 21 points.
 * @param {number[]} features - 63 numbers.
 * @returns {number[][]} 21 points as [x, y, z].
 */
export function featuresToPoints(features) {
  const points = [];
  for (let i = 0; i < features.length; i += 3) {
    points.push([features[i], features[i + 1], features[i + 2]]);
  }
  return points;
}

/**
 * Averages many hands point-by-point to get one "typical" hand.
 * Used to draw the reference skeleton for a letter.
 * @param {number[][][]} hands - A list of hands, each one 21 points as [x, y, z].
 * @returns {number[][]|null} The average hand, or null if the list is empty.
 */
export function averagePoints(hands) {
  if (hands.length === 0) {
    return null;
  }

  // Start with 21 points at [0, 0, 0], add up every hand, then divide by
  // how many hands there were. This works because every hand has already
  // been normalized, so point #8 always means "index fingertip".
  const totals = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    totals.push([0, 0, 0]);
  }

  for (const hand of hands) {
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      totals[i][0] += hand[i][0];
      totals[i][1] += hand[i][1];
      totals[i][2] += hand[i][2];
    }
  }

  const count = hands.length;
  const average = [];
  for (const total of totals) {
    average.push([total[0] / count, total[1] / count, total[2] / count]);
  }
  return average;
}
