/**
 * fakeHand.js (test helper)
 * -------------------------
 * Builds pretend MediaPipe hand landmarks so tests don't need a camera.
 *
 * The fake hand is a "fan": each finger starts at the wrist and points
 * outward in a straight line, like the spokes of a hand fan. If a finger
 * gets a bend angle, each of its 3 joints bends by that much toward the
 * camera, so the finger's TOTAL bend is exactly 3 x the angle. Knowing the
 * exact answer ahead of time is what makes this useful for testing.
 */

/** Direction each finger points, in degrees away from straight up. */
const FINGER_DIRECTIONS = { thumb: -50, index: -15, middle: 0, ring: 15, pinky: 30 };

/** First landmark number of each finger. */
const FINGER_START = { thumb: 1, index: 5, middle: 9, ring: 13, pinky: 17 };

/** Distance from wrist to the finger's first point, then each bone length. */
const FINGER_LENGTHS = {
  thumb: [0.35, 0.35, 0.3, 0.25],
  index: [1.0, 0.45, 0.3, 0.25],
  middle: [1.0, 0.5, 0.3, 0.25],
  ring: [1.0, 0.45, 0.3, 0.25],
  pinky: [1.0, 0.35, 0.25, 0.2],
};

/**
 * Rotates a direction toward the camera (the -z direction) by some degrees.
 * @param {number[]} direction - A length-1 direction [x, y, z] with z = 0.
 * @param {number} degrees - How far to rotate.
 * @returns {number[]} The rotated direction.
 */
function bendTowardCamera(direction, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return [
    direction[0] * Math.cos(radians),
    direction[1] * Math.cos(radians),
    -Math.sin(radians),
  ];
}

/**
 * Builds 21 fake landmarks.
 * @param {{bends?:Object<string,number>, wrist?:number[], size?:number,
 *   aspectRatio?:number, mirror?:boolean}} options
 *   bends = degrees PER JOINT for each finger (total bend = 3x),
 *   wrist = wrist position in the picture, size = palm size in the picture,
 *   aspectRatio = video width / height, mirror = flip left/right.
 * @returns {Array<{x:number, y:number, z:number}>} Landmarks like MediaPipe gives.
 */
export function makeFakeHand(options = {}) {
  const bends = options.bends ?? {};
  const wrist = options.wrist ?? [0.5, 0.8];
  const size = options.size ?? 0.1;
  const aspectRatio = options.aspectRatio ?? 1;
  const mirrorSign = options.mirror ? -1 : 1;

  // Build the hand in "true" units first, where the palm size is 1.
  const truePoints = new Array(21);
  truePoints[0] = [0, 0, 0];

  for (const finger of Object.keys(FINGER_DIRECTIONS)) {
    const angle = (FINGER_DIRECTIONS[finger] * Math.PI) / 180;
    // Up in a picture is NEGATIVE y, because picture y counts downward.
    const baseDirection = [Math.sin(angle) * mirrorSign, -Math.cos(angle), 0];
    const lengths = FINGER_LENGTHS[finger];
    const bendPerJoint = bends[finger] ?? 0;

    let position = [0, 0, 0];
    for (let segment = 0; segment < 4; segment++) {
      const direction = bendTowardCamera(baseDirection, bendPerJoint * segment);
      position = [
        position[0] + direction[0] * lengths[segment],
        position[1] + direction[1] * lengths[segment],
        position[2] + direction[2] * lengths[segment],
      ];
      truePoints[FINGER_START[finger] + segment] = position;
    }
  }

  // Convert to MediaPipe-style picture coordinates. x and z are divided by
  // the aspect ratio because MediaPipe measures them as a fraction of the
  // picture's WIDTH, which is wider than its height.
  return truePoints.map((point) => ({
    x: wrist[0] + (point[0] * size) / aspectRatio,
    y: wrist[1] + point[1] * size,
    z: (point[2] * size) / aspectRatio,
  }));
}
