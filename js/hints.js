/**
 * hints.js
 * --------
 * Finger hints: figures out WHICH finger to fix and says how to fix it,
 * for example "Curl your index finger more."
 *
 * How it works:
 *   1. For every finger we measure its "bend angle" in degrees.
 *      A straight finger is about 0 degrees. A tightly curled finger is
 *      about 180-250 degrees (it bends at three joints, and we add them up).
 *   2. A letter's "template" is the AVERAGE hand of all the samples we
 *      recorded for that letter. It has an average bend for every finger.
 *   3. We compare the live hand's bends with the template's bends.
 *      The finger with the biggest difference (if it's big enough to
 *      matter) is the one we tell the user to fix.
 *
 * The template's average points are also used to draw the reference
 * skeleton in Learn mode.
 *
 * This file is pure math, so it can be unit tested in Node.
 */

import { FINGERS, FINGER_NAMES, WRIST, featuresToPoints, averagePoints, subtractPoints } from './landmarks.js';

/** A finger has to be off by at least this many degrees before we mention it. */
export const HINT_THRESHOLD_DEGREES = 30;

/**
 * Measures the length of a 3D arrow (vector).
 * @param {number[]} vector - [x, y, z].
 * @returns {number} Its length.
 */
export function vectorLength(vector) {
  return Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
}

/**
 * Finds the angle between two arrows, in degrees.
 * @param {number[]} u - First arrow [x, y, z].
 * @param {number[]} v - Second arrow [x, y, z].
 * @returns {number} Angle from 0 (same direction) to 180 (opposite directions).
 */
export function angleBetweenVectors(u, v) {
  // The "dot product" formula from geometry: u · v = |u| |v| cos(angle).
  // So cos(angle) = (u · v) / (|u| |v|), and angle = arccos of that.
  const dotProduct = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const lengths = vectorLength(u) * vectorLength(v);

  // An arrow of length 0 has no direction, so there's no angle to measure.
  if (lengths === 0) {
    return 0;
  }

  // Tiny rounding errors can make the cosine 1.0000001, and arccos of a
  // number above 1 is "not a number". Clamping to [-1, 1] prevents that.
  let cosine = dotProduct / lengths;
  cosine = Math.max(-1, Math.min(1, cosine));

  const radians = Math.acos(cosine);
  return radians * (180 / Math.PI);
}

/**
 * Measures how much a joint is bent.
 * @param {number[]} before - The point before the joint (closer to the wrist).
 * @param {number[]} joint - The joint itself (a knuckle).
 * @param {number[]} after - The point after the joint (closer to the fingertip).
 * @returns {number} Bend in degrees: 0 = perfectly straight, 90 = an L shape.
 */
export function jointBend(before, joint, after) {
  // Arrow 1 points along the bone coming INTO the joint.
  // Arrow 2 points along the bone going OUT of the joint.
  // If the finger is straight, both arrows point the same way: angle 0.
  // If the finger bends into an L, the arrows are at 90 degrees.
  const incomingBone = subtractPoints(joint, before);
  const outgoingBone = subtractPoints(after, joint);
  return angleBetweenVectors(incomingBone, outgoingBone);
}

/**
 * Measures the total bend of one finger by adding up its three joints.
 * @param {number[][]} points - 21 hand points as [x, y, z].
 * @param {string} fingerName - "thumb", "index", "middle", "ring", or "pinky".
 * @returns {number} Total bend in degrees (0 = straight finger).
 */
export function fingerBend(points, fingerName) {
  // The chain is: wrist -> base -> joint -> joint -> tip.
  // That gives 3 joints in the middle of the chain, and we add up their bends.
  const chain = [WRIST, ...FINGERS[fingerName]];
  let totalBend = 0;
  for (let i = 1; i < chain.length - 1; i++) {
    const before = points[chain[i - 1]];
    const joint = points[chain[i]];
    const after = points[chain[i + 1]];
    totalBend += jointBend(before, joint, after);
  }
  return totalBend;
}

/**
 * Measures the bend of all five fingers.
 * @param {number[][]} points - 21 hand points as [x, y, z].
 * @returns {{thumb:number, index:number, middle:number, ring:number, pinky:number}}
 *   Bend in degrees for each finger.
 */
export function allFingerBends(points) {
  const bends = {};
  for (const fingerName of FINGER_NAMES) {
    bends[fingerName] = fingerBend(points, fingerName);
  }
  return bends;
}

/**
 * Averages a list of finger-bend measurements.
 * @param {Array<Object<string, number>>} bendList - Many results from allFingerBends.
 * @returns {Object<string, number>|null} Average bend for each finger, or null if empty.
 */
export function averageBends(bendList) {
  if (bendList.length === 0) {
    return null;
  }
  const average = {};
  for (const fingerName of FINGER_NAMES) {
    let total = 0;
    for (const bends of bendList) {
      total += bends[fingerName];
    }
    average[fingerName] = total / bendList.length;
  }
  return average;
}

/**
 * Builds the template (the "average hand") for one letter from its samples.
 * @param {Array<{letter:string, features:number[]}>} samples - All recorded samples.
 * @param {string} letter - Which letter to build, e.g. "B".
 * @returns {{letter:string, count:number, points:number[][], bends:Object<string,number>}|null}
 *   The template, or null if this letter has no samples yet.
 */
export function buildTemplate(samples, letter) {
  const hands = [];
  const bendList = [];
  for (const sample of samples) {
    if (sample.letter === letter) {
      const points = featuresToPoints(sample.features);
      hands.push(points);
      // We average the BENDS of every sample, instead of measuring the bends
      // of the average hand, because averaging points can blur the shape.
      bendList.push(allFingerBends(points));
    }
  }

  if (hands.length === 0) {
    return null;
  }

  return {
    letter: letter,
    count: hands.length,
    points: averagePoints(hands),
    bends: averageBends(bendList),
  };
}

/**
 * Builds templates for every letter that has samples.
 * @param {Array<{letter:string, features:number[]}>} samples - All recorded samples.
 * @returns {Object<string, Object>} letter -> template.
 */
export function buildAllTemplates(samples) {
  const letters = new Set();
  for (const sample of samples) {
    letters.add(sample.letter);
  }
  const templates = {};
  for (const letter of letters) {
    templates[letter] = buildTemplate(samples, letter);
  }
  return templates;
}

/**
 * Picks the one finger that is the most "off" compared to the template.
 * @param {Object<string, number>} userBends - The live hand's bends (from allFingerBends).
 * @param {Object<string, number>} templateBends - The target letter's average bends.
 * @param {number} threshold - Minimum difference in degrees worth mentioning.
 * @returns {{finger:string, difference:number, action:'curl'|'straighten'}|null}
 *   The finger to fix, or null if every finger is close enough.
 */
export function findFingerToFix(userBends, templateBends, threshold = HINT_THRESHOLD_DEGREES) {
  let worstFinger = null;
  let worstDifference = 0;

  for (const fingerName of FINGER_NAMES) {
    // Positive difference = the user's finger is bent MORE than it should be.
    // Negative difference = the user's finger is bent LESS (too straight).
    const difference = userBends[fingerName] - templateBends[fingerName];
    if (Math.abs(difference) > Math.abs(worstDifference)) {
      worstDifference = difference;
      worstFinger = fingerName;
    }
  }

  // Small differences are normal (everyone's hands are a little different),
  // so we stay quiet unless the biggest one passes the threshold.
  if (worstFinger === null || Math.abs(worstDifference) < threshold) {
    return null;
  }

  let action = 'curl';
  if (worstDifference > 0) {
    action = 'straighten';
  }
  return { finger: worstFinger, difference: worstDifference, action: action };
}

/**
 * Turns a finger name into friendly words.
 * @param {string} fingerName - "thumb", "index", "middle", "ring", or "pinky".
 * @returns {string} For example "index finger" or "thumb".
 */
export function fingerDisplayName(fingerName) {
  if (fingerName === 'thumb' || fingerName === 'pinky') {
    return fingerName;
  }
  return fingerName + ' finger';
}

/**
 * Writes the hint sentence the user sees.
 * @param {{finger:string, action:string}|null} fix - Result from findFingerToFix.
 * @returns {string} A sentence like "Curl your index finger more."
 */
export function hintMessage(fix) {
  if (fix === null) {
    return 'Your finger bends look right. Check your thumb position and the angle of your hand.';
  }
  const name = fingerDisplayName(fix.finger);
  if (fix.action === 'curl') {
    return 'Curl your ' + name + ' more.';
  }
  return 'Straighten your ' + name + '.';
}
