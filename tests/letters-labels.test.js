/**
 * letters-labels.test.js
 * ----------------------
 * Tests for the written instructions (js/letters.js), the finger name tags
 * on the diagrams (placeFingerLabels in js/diagram.js), and two facts we
 * checked against ASL sources.
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, LETTER_STEPS, LETTER_TIPS, LETTER_MIXUPS } from '../js/letters.js';
import { placeFingerLabels } from '../js/diagram.js';
import { buildHand } from '../js/handModel.js';
import { LETTER_POSES, MOTION_POSES } from '../js/handPoses.js';

test('every letter has 2-3 short steps, a one-line tip, and a mix-up warning', () => {
  for (const letter of ALPHABET) {
    const steps = LETTER_STEPS[letter];
    assert.ok(steps.length >= 2 && steps.length <= 3, letter + ' has ' + steps.length + ' steps');
    for (const step of steps) {
      assert.ok(step.length <= 95, letter + ' step is too long to read quickly: ' + step);
    }
    assert.equal(LETTER_TIPS[letter], steps.join(' '));
    assert.ok(LETTER_MIXUPS[letter].length > 0, letter + ' needs a mix-up warning');
  }
});

test('fact-checked details are in the instructions', () => {
  assert.match(LETTER_TIPS.R, /behind the index/);
  assert.match(LETTER_TIPS.M, /between your ring finger and pinky/);
  assert.match(LETTER_TIPS.N, /between your middle and ring fingers/);
  assert.match(LETTER_TIPS.T, /between your index and middle fingers/);
  assert.match(LETTER_TIPS.G, /Palm faces you/);
  assert.match(LETTER_TIPS.J, /mirror-image/);
  assert.match(LETTER_TIPS.Z, /mirror-image/);
});

test('R diagram: the index finger is in front of the middle finger where they cross', () => {
  // In the diagram, a bigger z means closer to the viewer.
  const points = buildHand(LETTER_POSES.R).landmarks;
  assert.ok(points[7][2] > points[11][2], 'index top joint should be in front of the middle finger');
});

/**
 * Checks whether two tags overlap.
 * @param {Object} a - A tag from placeFingerLabels.
 * @param {Object} b - Another tag.
 * @returns {boolean} True if their boxes overlap.
 */
function overlaps(a, b) {
  return Math.abs(a.at[0] - b.at[0]) < (a.width + b.width) / 2 && Math.abs(a.at[1] - b.at[1]) < (a.height + b.height) / 2;
}

test('finger name tags: one per finger, none overlapping, all outside the hand', () => {
  const poses = { ...LETTER_POSES, ...MOTION_POSES };
  for (const [letter, pose] of Object.entries(poses)) {
    for (const flipX of [false, true]) {
      const hand = buildHand(pose);
      const labels = placeFingerLabels(hand, flipX, pose.forearm !== false);
      assert.deepEqual(labels.map((l) => l.finger), ['thumb', 'index', 'middle', 'ring', 'pinky'], letter);
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          assert.ok(!overlaps(labels[i], labels[j]), letter + ': ' + labels[i].name + ' overlaps ' + labels[j].name);
        }
      }
      // Outside = the tag's center is not inside the box around the hand points.
      const xs = hand.landmarks.map((p) => (flipX ? -p[0] : p[0]));
      const ys = hand.landmarks.map((p) => -p[1]);
      for (const label of labels) {
        const inside = label.at[0] > Math.min(...xs) && label.at[0] < Math.max(...xs)
          && label.at[1] > Math.min(...ys) && label.at[1] < Math.max(...ys);
        assert.ok(!inside, letter + ': the ' + label.name + ' tag covers the hand');
      }
    }
  }
});
