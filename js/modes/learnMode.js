/**
 * learnMode.js
 * ------------
 * The Learn screen: practice one letter at a time with live coaching.
 *
 *   1. Pick a target letter (only letters with recorded samples can be picked).
 *   2. A reference skeleton is drawn from that letter's template (the average
 *      of its recorded samples). No copyrighted pictures needed!
 *   3. While you sign, the coach compares your finger bends to the template
 *      and tells you which finger to fix. That finger turns red.
 *   4. Hold the correct letter steady for 0.5 s: success animation!
 *
 * Every locked-in letter is saved as a progress attempt (right or wrong).
 */

import { STATIC_LETTERS, LETTER_TIPS } from '../letters.js';
import { LetterSmoother, majorityVote } from '../smoothing.js';
import { findFingerToFix, hintMessage } from '../hints.js';
import { drawReferenceHand } from '../draw.js';
import { byId, setMeter, renderLetterGrid, showSuccessBurst, formatPercent } from '../ui.js';

/** How many recent frames vote on which finger hint to show (stops flicker). */
const HINT_WINDOW = 12;

/** After picking a letter, give the user this long to get their hand ready. */
const GET_READY_MS = 1500;

/**
 * Creates the Learn mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function}} The mode.
 */
export function createLearnMode(app) {
  const smoother = new LetterSmoother();
  let targetLetter = null;
  let recentHintFingers = [];
  let getReadyUntilMs = 0;

  const hintText = byId('learn-hint');
  const seeingText = byId('learn-seeing');
  const referenceCanvas = byId('reference-canvas');

  /**
   * Picks a sensible target: keep the current one if it still has samples,
   * otherwise use the first letter that has samples.
   * @returns {string|null} The target letter, or null if nothing is recorded.
   */
  function chooseStartingLetter() {
    const recorded = app.recordedLetters();
    if (targetLetter && recorded.includes(targetLetter)) {
      return targetLetter;
    }
    return recorded.length > 0 ? recorded[0] : null;
  }

  /**
   * Switches to a new target letter and redraws everything for it.
   * @param {string|null} letter - The new target.
   * @returns {void}
   */
  function setTarget(letter) {
    targetLetter = letter;
    smoother.reset();
    recentHintFingers = [];
    // Without this pause, whatever shape the hand is ALREADY holding would
    // lock in right away and count as a wrong attempt for the new letter.
    getReadyUntilMs = performance.now() + GET_READY_MS;
    renderLetterGrid(byId('learn-letter-grid'), {
      counts: app.sampleCounts(),
      selected: targetLetter,
      onPick: setTarget,
      disableEmpty: true,
      showCounts: false,
    });

    if (!targetLetter) {
      byId('learn-letter').textContent = '?';
      byId('learn-tip').textContent = '';
      byId('reference-caption').textContent = 'No reference yet';
      drawReferenceHand(referenceCanvas, null);
      hintText.className = 'hint';
      hintText.textContent = 'No samples recorded yet. Go to Record and record a few letters first.';
      return;
    }

    const template = app.templates[targetLetter];
    byId('learn-letter').textContent = targetLetter;
    byId('learn-tip').textContent = LETTER_TIPS[targetLetter];
    byId('reference-caption').textContent = 'Average of your ' + template.count + ' recorded ' + targetLetter + ' samples';
    drawReferenceHand(referenceCanvas, template.points, { flipX: app.handMirrored });
    hintText.className = 'hint';
    hintText.textContent = 'Make the letter ' + targetLetter + ' and hold it steady.';
    seeingText.textContent = '';
  }

  /**
   * Moves to the next recorded letter in alphabet order (wrapping around).
   * @returns {void}
   */
  function goToNextLetter() {
    const recorded = app.recordedLetters();
    if (recorded.length === 0) {
      return;
    }
    const currentPosition = STATIC_LETTERS.indexOf(targetLetter);
    for (let step = 1; step <= STATIC_LETTERS.length; step++) {
      const candidate = STATIC_LETTERS[(currentPosition + step) % STATIC_LETTERS.length];
      if (recorded.includes(candidate)) {
        setTarget(candidate);
        return;
      }
    }
  }

  /**
   * Decides which finger hint to show, using a vote over recent frames so the
   * hint doesn't jump between fingers every frame.
   * @param {Object|null} fix - This frame's finger to fix (from findFingerToFix).
   * @returns {Object|null} The steady fix to show.
   */
  function steadyFix(fix) {
    recentHintFingers.push(fix ? fix.finger + '|' + fix.action : null);
    if (recentHintFingers.length > HINT_WINDOW) {
      recentHintFingers.shift();
    }
    const winner = majorityVote(recentHintFingers).label;
    if (!winner) {
      return null;
    }
    const [finger, action] = winner.split('|');
    return { finger, action };
  }

  /**
   * Handles a letter that just locked in: success or "try again".
   * @param {string} lockedLetter - The letter the smoother locked in.
   * @returns {void}
   */
  function handleLock(lockedLetter) {
    const correct = lockedLetter === targetLetter;
    app.recordAttempt(targetLetter, correct, 'learn');
    if (correct) {
      showSuccessBurst('You signed ' + targetLetter + '!');
    }
  }

  byId('learn-next').addEventListener('click', goToNextLetter);

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      setTarget(chooseStartingLetter());
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      smoother.reset();
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:string|null}} The finger to draw in red.
     */
    onFrame(hand, nowMs) {
      if (!targetLetter) {
        return { highlightFinger: null };
      }
      const template = app.templates[targetLetter];
      // During the get-ready pause we keep clearing the smoother, so nothing can lock in.
      if (nowMs < getReadyUntilMs) {
        smoother.reset();
      }
      const { guess, smooth } = app.recognize(hand, smoother, nowMs);
      setMeter(byId('learn-hold-bar'), smooth.stableLetter === targetLetter ? smooth.holdProgress : 0);

      if (!hand || !guess) {
        seeingText.textContent = '';
        hintText.className = 'hint';
        hintText.textContent = 'Show your hand to the camera.';
        return { highlightFinger: null };
      }

      seeingText.textContent = 'I see: ' + guess.letter + ' (' + formatPercent(guess.confidence) + ' confident)';
      if (smooth.lockedLetter) {
        handleLock(smooth.lockedLetter);
      }

      // Signing the right letter? Then no finger hint, just encouragement.
      const looksRight = guess.letter === targetLetter && guess.confidence >= app.minConfidence;
      if (looksRight) {
        recentHintFingers = [];
        hintText.className = 'hint good';
        hintText.textContent = smooth.holdProgress >= 1 ? 'Correct! That\'s ' + targetLetter + '. Press Next letter.' : 'Looks like ' + targetLetter + '! Hold it steady...';
        drawReferenceHand(referenceCanvas, template.points, { flipX: hand.mirrored });
        return { highlightFinger: null };
      }

      // Otherwise compare finger bends with the template and coach one finger.
      const fix = steadyFix(findFingerToFix(hand.bends, template.bends));
      hintText.className = 'hint';
      hintText.textContent = hintMessage(fix);
      const highlightFinger = fix ? fix.finger : null;
      drawReferenceHand(referenceCanvas, template.points, { flipX: hand.mirrored, highlightFinger });
      return { highlightFinger };
    },
  };
}
