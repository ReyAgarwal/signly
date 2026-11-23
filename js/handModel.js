/**
 * handModel.js
 * ------------
 * A simple 3D "puppet" hand, used to draw the handshape diagrams.
 *
 * Instead of copying pictures from an ASL chart (which could be copyrighted),
 * we describe each letter with a few numbers: how much each finger bends,
 * how far the fingers spread, where the thumb points, and how the whole hand
 * is turned. This file turns those numbers into 21 points in 3D, in the same
 * order MediaPipe uses (0 = wrist, 1-4 = thumb, 5-8 = index, ...).
 *
 * Coordinates (for a RIGHT hand seen in a mirror, palm facing you):
 *   x = to the right (toward the pinky),  y = up (toward the fingertips),
 *   z = toward the viewer (the direction the palm faces).
 *
 * This file is pure math, so it can be unit tested in Node.
 */

/** Where the wrist, thumb base, and knuckles sit on a flat, open hand. */
export const PALM = {
  wrist: [0, 0, 0],
  wristThumbSide: [-1.05, 0.2, 0],
  wristPinkySide: [1.1, 0.2, 0],
  thumbBase: [-0.95, 0.85, 0.3],
  knuckles: {
    index: [-1.25, 3.6, 0],
    middle: [-0.4, 3.8, 0],
    ring: [0.45, 3.65, 0],
    pinky: [1.22, 3.3, 0],
  },
};

/** Length of each bone, from the base of the finger to the tip. */
export const BONE_LENGTHS = {
  thumb: [1.7, 1.3, 1.0],
  index: [2.0, 1.2, 0.85],
  middle: [2.2, 1.35, 0.9],
  ring: [2.05, 1.25, 0.88],
  pinky: [1.6, 0.95, 0.78],
};

/** First landmark number of each finger (matches MediaPipe's numbering). */
const FIRST_LANDMARK = { thumb: 1, index: 5, middle: 9, ring: 13, pinky: 17 };

/** Which way the thumb's middle joint bulges when the thumb reaches for something. */
const DEFAULT_THUMB_BEND = [-0.5, -0.3, 0.8];

// ---------- Small vector helpers ----------

/**
 * Adds two 3D vectors.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number[]} a + b.
 */
export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Subtracts b from a.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number[]} a - b.
 */
export function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Multiplies a vector by a number (makes it longer or shorter).
 * @param {number[]} v - [x, y, z].
 * @param {number} amount - The multiplier.
 * @returns {number[]} The scaled vector.
 */
export function scale(v, amount) {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

/**
 * The dot product: multiplies matching parts and adds them up.
 * @param {number[]} a - [x, y, z].
 * @param {number[]} b - [x, y, z].
 * @returns {number} a · b.
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Length of a vector (Pythagorean theorem in 3D).
 * @param {number[]} v - [x, y, z].
 * @returns {number} Its length.
 */
export function length(v) {
  return Math.sqrt(dot(v, v));
}

/**
 * Makes a vector exactly 1 unit long, keeping its direction.
 * @param {number[]} v - [x, y, z] (not all zeros).
 * @returns {number[]} The unit vector.
 */
export function normalize(v) {
  const size = length(v);
  if (size === 0) {
    return [0, 0, 0];
  }
  return scale(v, 1 / size);
}

/**
 * Converts degrees to radians (JavaScript's Math functions use radians).
 * @param {number} degrees - An angle in degrees.
 * @returns {number} The same angle in radians.
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// ---------- Building fingers ----------

/**
 * Builds one finger (not the thumb) as 4 points: knuckle, two joints, tip.
 * @param {number[]} knuckle - Where the finger starts.
 * @param {number[]} lengths - The 3 bone lengths.
 * @param {{spread:number, flex:number[]}} fingerPose
 *   spread = degrees tilted sideways (+ = toward the pinky),
 *   flex = bend at each of the 3 joints in degrees (+ = curl toward the palm).
 * @returns {number[][]} 4 points from knuckle to fingertip.
 */
export function buildFinger(knuckle, lengths, fingerPose) {
  const spread = toRadians(fingerPose.spread);
  // "up" is the direction of the straight finger; "palmSide" is the way it curls.
  const up = [Math.sin(spread), Math.cos(spread), 0];
  const palmSide = [0, 0, 1];

  const points = [knuckle];
  let totalBend = 0;
  let position = knuckle;
  for (let joint = 0; joint < 3; joint++) {
    // Each joint adds its bend to the ones before it, just like a real finger:
    // if the knuckle bends 90 degrees, everything after it is already turned 90.
    totalBend += toRadians(fingerPose.flex[joint]);
    const direction = add(scale(up, Math.cos(totalBend)), scale(palmSide, Math.sin(totalBend)));
    position = add(position, scale(direction, lengths[joint]));
    points.push(position);
  }
  return points;
}

/**
 * Finds the middle joint of a two-bone limb so its end reaches a target.
 * (This is called "two-bone inverse kinematics". It's how the thumb reaches
 * a fingertip in letters like F and O.)
 * @param {number[]} base - Where the first bone starts.
 * @param {number[]} target - Where the end of the second bone should go.
 * @param {number} firstLength - Length of the first bone.
 * @param {number} secondLength - Length of the second bone.
 * @param {number[]} bendDirection - Which way the middle joint should stick out.
 * @returns {number[]} The position of the middle joint.
 */
export function solveTwoBoneJoint(base, target, firstLength, secondLength, bendDirection) {
  const toTarget = subtract(target, base);
  const towardTarget = normalize(toTarget);

  // The two bones and the line to the target make a triangle. If the target
  // is too far (or too close), clamp the distance so the triangle still exists.
  const longest = firstLength + secondLength - 0.0001;
  const shortest = Math.abs(firstLength - secondLength) + 0.0001;
  const distance = Math.min(longest, Math.max(shortest, length(toTarget)));

  // Law of cosines: c^2 = a^2 + b^2 - 2ab cos(C), solved for the angle at the base.
  const cosine = (firstLength ** 2 + distance ** 2 - secondLength ** 2) / (2 * firstLength * distance);
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));

  // Keep only the part of bendDirection that is sideways to the target line.
  let sideways = subtract(bendDirection, scale(towardTarget, dot(bendDirection, towardTarget)));
  if (length(sideways) < 1e-9) {
    sideways = [0, 0, 1];
  }
  sideways = normalize(sideways);

  return add(base, add(scale(towardTarget, firstLength * cosine), scale(sideways, firstLength * sine)));
}

/**
 * Finds a point partway along a finger. 0 = knuckle, 1 = first joint,
 * 2 = second joint, 3 = fingertip; 2.5 = halfway along the last bone.
 * @param {number[][]} fingerPoints - 4 points from buildFinger.
 * @param {number} position - From 0 to 3.
 * @returns {number[]} The point.
 */
export function pointAlongFinger(fingerPoints, position) {
  const segment = Math.min(2, Math.floor(position));
  const fraction = position - segment;
  const start = fingerPoints[segment];
  const end = fingerPoints[segment + 1];
  return add(start, scale(subtract(end, start), fraction));
}

/**
 * Builds the thumb as 4 points: base, knuckle, joint, tip.
 * The thumb either points in given directions, reaches to touch a finger,
 * or reaches for an exact spot.
 * @param {Object} thumbPose - {base, middle, tip} directions, {base, touch, bend}, or {base, reach, bend}.
 * @param {Object<string, number[][]>} fingers - The already-built fingers.
 * @returns {number[][]} 4 thumb points.
 */
export function buildThumb(thumbPose, fingers) {
  const lengths = BONE_LENGTHS.thumb;
  const base = PALM.thumbBase;
  const knuckle = add(base, scale(normalize(thumbPose.base), lengths[0]));

  if (thumbPose.touch || thumbPose.reach) {
    // Reach for a spot: either on another finger (plus an optional nudge), or an exact point.
    let target = thumbPose.reach;
    if (thumbPose.touch) {
      const spot = pointAlongFinger(fingers[thumbPose.touch.finger], thumbPose.touch.at);
      target = add(spot, thumbPose.touch.offset ?? [0, 0, 0]);
    }
    const joint = solveTwoBoneJoint(knuckle, target, lengths[1], lengths[2], thumbPose.bend ?? DEFAULT_THUMB_BEND);
    const tip = add(joint, scale(normalize(subtract(target, joint)), lengths[2]));
    return [base, knuckle, joint, tip];
  }

  const joint = add(knuckle, scale(normalize(thumbPose.middle), lengths[1]));
  const tip = add(joint, scale(normalize(thumbPose.tip), lengths[2]));
  return [base, knuckle, joint, tip];
}

// ---------- Turning the whole hand ----------

/**
 * Rotates a point around the x, y, or z axis (through the wrist).
 * @param {number[]} point - [x, y, z].
 * @param {'x'|'y'|'z'} axis - Which axis to spin around.
 * @param {number} degrees - How far (positive = counterclockwise looking down the axis).
 * @returns {number[]} The rotated point.
 */
export function rotatePoint(point, axis, degrees) {
  const angle = toRadians(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x, y, z] = point;
  // These are the standard rotation formulas from trigonometry: spinning
  // around one axis leaves that coordinate alone and turns the other two.
  if (axis === 'x') {
    return [x, y * cos - z * sin, y * sin + z * cos];
  }
  if (axis === 'y') {
    return [x * cos + z * sin, y, -x * sin + z * cos];
  }
  return [x * cos - y * sin, x * sin + y * cos, z];
}

/**
 * Applies a list of rotations, in order, to a point.
 * @param {number[]} point - [x, y, z].
 * @param {Array<[string, number]>} rotations - e.g. [['y', 180], ['z', 90]].
 * @returns {number[]} The turned point.
 */
export function applyRotations(point, rotations) {
  let result = point;
  for (const [axis, degrees] of rotations) {
    result = rotatePoint(result, axis, degrees);
  }
  return result;
}

/**
 * Finds which way the fingernail faces (the BACK of the fingertip).
 * @param {{spread:number, flex:number[]}} fingerPose - The finger's pose.
 * @returns {number[]} A direction [x, y, z] pointing out of the nail.
 */
export function fingernailDirection(fingerPose) {
  const spread = toRadians(fingerPose.spread);
  const up = [Math.sin(spread), Math.cos(spread), 0];
  const totalBend = toRadians(fingerPose.flex[0] + fingerPose.flex[1] + fingerPose.flex[2]);
  // A straight finger's nail faces away from the palm (-z). As the finger
  // curls, the nail turns with it, by the same total angle.
  return add(scale(up, Math.sin(totalBend)), scale([0, 0, -1], Math.cos(totalBend)));
}

/**
 * Builds the whole posed hand for one letter.
 * @param {Object} pose - A letter pose from handPoses.js.
 * @returns {{landmarks:number[][], wristThumbSide:number[], wristPinkySide:number[],
 *   forearmEnd:number[], palmFacing:number[], nailFacing:Object<string, number[]>}}
 *   21 points in MediaPipe order, plus a few extra things used for drawing.
 */
export function buildHand(pose) {
  const fingers = {};
  const nailFacing = {};
  for (const fingerName of ['index', 'middle', 'ring', 'pinky']) {
    fingers[fingerName] = buildFinger(PALM.knuckles[fingerName], BONE_LENGTHS[fingerName], pose.fingers[fingerName]);
    nailFacing[fingerName] = fingernailDirection(pose.fingers[fingerName]);
  }
  fingers.thumb = buildThumb(pose.thumb, fingers);

  const landmarks = new Array(21);
  landmarks[0] = PALM.wrist;
  for (const fingerName of Object.keys(FIRST_LANDMARK)) {
    for (let i = 0; i < 4; i++) {
      landmarks[FIRST_LANDMARK[fingerName] + i] = fingers[fingerName][i];
    }
  }

  const rotations = pose.view ?? [];
  const turn = (point) => applyRotations(point, rotations);
  const turnedNails = {};
  for (const fingerName of Object.keys(nailFacing)) {
    turnedNails[fingerName] = turn(nailFacing[fingerName]);
  }
  return {
    landmarks: landmarks.map(turn),
    wristThumbSide: turn(PALM.wristThumbSide),
    wristPinkySide: turn(PALM.wristPinkySide),
    forearmEnd: turn([0.05, -5, 0]),
    palmFacing: turn([0, 0, 1]),
    nailFacing: turnedNails,
  };
}
