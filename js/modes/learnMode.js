/**
 * learnMode.js
 * ------------
 * The Learn screen: practice one letter at a time with live coaching.
 *
 *   1. Pick a target letter (click it, type it, or press Enter for the next one).
 *   2. A diagram shows how to make the handshape (drawn by diagram.js), and a
 *      small skeleton shows the AVERAGE hand of real signers for this letter.
 *   3. While you sign, the coach compares your finger bends to the template
 *      (the real signers' average) and tells you which finger to fix.
 *      That finger turns red on the camera AND on the diagram.
 *   4. Hold the correct letter steady for 0.5 s: success animation! With
 *      auto-advance on, the next letter comes up by itself.
 *
 * If the reference data failed to load, letters can still be studied from
 * the diagram, but the coach can't check them.
 *
 * Every locked-in letter is saved as a progress attempt (right or wrong).
 * Correct signs may also be learned from (see learning.js).
 */

import { STATIC_LETTERS, LETTER_TIPS, LETTER_MIXUPS } from '../letters.js';
import { LetterSmoother, HintSmoother } from '../smoothing.js';
import { findFingerToFix, hintMessage } from '../hints.js';
import { drawReferenceHand } from '../draw.js';
import { renderHandDiagram } from '../diagram.js';
import { byId, setMeter, renderLetterGrid, showSuccessBurst, formatPercent } from '../ui.js';

/** After picking a letter, give the user this long to get their hand ready. */
const GET_READY_MS = 1500;

/** With auto-advance on, wait this long after a correct sign before moving on. */
const AUTO_ADVANCE_DELAY_MS = 1800;

/**
 * Creates the Learn mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function, handleShortcut:function, selectLetter:function}} The mode.
 */
export function createLearnMode(app) {
  const smoother = new LetterSmoother();
  const hints = new HintSmoother();
  let targetLetter = STATIC_LETTERS[0];
  let getReadyUntilMs = 0;
  let autoAdvanceTimer = null;
  let shownDiagramKey = '';

  const hintText = byId('learn-hint');
  const seeingText = byId('learn-seeing');
  const referenceCanvas = byId('reference-canvas');
  const diagram = byId('learn-diagram');
  const autoAdvanceBox = byId('learn-auto-advance');
  const flipBox = byId('learn-flip');

  /**
   * Draws the diagram, but only if something changed (redrawing every frame is wasteful).
   * @param {string|null} highlightFinger - Finger to draw in red, or null.
   * @returns {void}
   */
  function showDiagram(highlightFinger) {
    const flipX = app.settings.flipDiagrams;
    const key = targetLetter + '|' + highlightFinger + '|' + flipX;
    if (key === shownDiagramKey) {
      return;
    }
    shownDiagramKey = key;
    renderHandDiagram(diagram, targetLetter, { flipX, highlightFinger });
  }

  /**
   * Redraws the letter picker (check marks change after a correct sign).
   * @returns {void}
   */
  function showLetterGrid() {
    renderLetterGrid(byId('learn-letter-grid'), {
      counts: app.sampleCounts(),
      selected: targetLetter,
      onPick: setTarget,
      showCounts: false,
      mastered: app.masteredLetters(),
    });
  }

  /**
   * Shows either the live-checking area, or the "study only" notice for
   * letters nobody has recorded yet.
   * @param {Object|undefined} template - The letter's template, if it has samples.
   * @returns {void}
   */
  function showCheckingArea(template) {
    const hasSamples = Boolean(template);
    byId('learn-check').hidden = !hasSamples;
    byId('learn-no-samples').hidden = hasSamples;

    if (hasSamples) {
      byId('reference-caption').textContent = 'Average of ' + template.count + ' real signers\' hands';
      drawReferenceHand(referenceCanvas, template.points, { flipX: app.handMirrored });
      hintText.className = 'hint';
      hintText.textContent = 'Make the letter ' + targetLetter + ' and hold it steady.';
      return;
    }
    byId('reference-caption').textContent = 'No samples yet';
    drawReferenceHand(referenceCanvas, null);
    byId('learn-no-samples-text').textContent = 'Study the picture! The coach can\'t check ' + targetLetter
      + ' right now because it has no reference hands for it.';
    byId('learn-record-this').textContent = '⏺ Record ' + targetLetter + ' now';
  }

  /**
   * Switches to a new target letter and redraws everything for it.
   * @param {string} letter - The new target.
   * @returns {void}
   */
  function setTarget(letter) {
    clearTimeout(autoAdvanceTimer);
    targetLetter = letter;
    smoother.reset();
    hints.reset();
    setMeter(byId('learn-hold-bar'), 0);
    seeingText.textContent = '';
    // Without this pause, whatever shape the hand is ALREADY holding would
    // lock in right away and count as a wrong attempt for the new letter.
    getReadyUntilMs = performance.now() + GET_READY_MS;

    const position = STATIC_LETTERS.indexOf(letter) + 1;
    byId('learn-position').textContent = 'Letter ' + position + ' of ' + STATIC_LETTERS.length;
    byId('learn-letter').textContent = letter;
    byId('learn-tip').textContent = LETTER_TIPS[letter];
    byId('learn-mixup').textContent = LETTER_MIXUPS[letter];
    showLetterGrid();
    showDiagram(null);
    showCheckingArea(app.templates[letter]);
  }

  /**
   * Moves forward or backward through the alphabet (wrapping around).
   * @param {number} step - +1 for the next letter, -1 for the previous one.
   * @returns {void}
   */
  function moveLetter(step) {
    const count = STATIC_LETTERS.length;
    const index = STATIC_LETTERS.indexOf(targetLetter);
    // Adding "count" before % keeps the result positive when going back from A.
    setTarget(STATIC_LETTERS[(index + step + count) % count]);
  }

  /**
   * Handles a letter that just locked in: success (maybe auto-advance) or "try again".
   * @param {string} lockedLetter - The letter the smoother locked in.
   * @param {Object} hand - The hand at that moment (used for "keep learning").
   * @returns {void}
   */
  function handleLock(lockedLetter, hand) {
    const correct = lockedLetter === targetLetter;
    app.recordAttempt(targetLetter, correct, 'learn');
    if (!correct) {
      return;
    }
    app.learnFrom(hand, targetLetter, lockedLetter);
    showSuccessBurst('You signed ' + targetLetter + '!');
    showLetterGrid();
    if (app.settings.autoAdvance) {
      autoAdvanceTimer = setTimeout(() => moveLetter(1), AUTO_ADVANCE_DELAY_MS);
    }
  }

  /**
   * Shows the "looks right" message instead of a finger hint.
   * @param {number} holdProgress - 0 to 1, from the smoother.
   * @returns {void}
   */
  function showLooksRight(holdProgress) {
    hintText.className = 'hint good';
    if (holdProgress < 1) {
      hintText.textContent = 'Looks like ' + targetLetter + '! Hold it steady...';
    } else if (app.settings.autoAdvance) {
      hintText.textContent = 'Correct! Next letter coming up...';
    } else {
      hintText.textContent = 'Correct! Press Enter for the next letter.';
    }
  }

  byId('learn-next').addEventListener('click', () => moveLetter(1));
  byId('learn-previous').addEventListener('click', () => moveLetter(-1));
  byId('learn-record-this').addEventListener('click', () => app.openRecord(targetLetter));
  autoAdvanceBox.addEventListener('change', () => app.setSetting('autoAdvance', autoAdvanceBox.checked));
  flipBox.addEventListener('change', () => {
    app.setSetting('flipDiagrams', flipBox.checked);
    showDiagram(null);
  });

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      autoAdvanceBox.checked = app.settings.autoAdvance;
      flipBox.checked = app.settings.flipDiagrams;
      shownDiagramKey = '';
      setTarget(targetLetter);
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      clearTimeout(autoAdvanceTimer);
      smoother.reset();
    },

    /**
     * Jumps to a letter (used by the Alphabet screen).
     * @param {string} letter - The letter to practice.
     * @returns {void}
     */
    selectLetter(letter) {
      targetLetter = letter;
    },

    /**
     * Handles a keyboard shortcut (see keyboard.js).
     * @param {string} action - e.g. "next-letter" or "pick:B".
     * @returns {void}
     */
    handleShortcut(action) {
      if (action === 'next-letter') {
        moveLetter(1);
      } else if (action === 'previous-letter') {
        moveLetter(-1);
      } else if (action.startsWith('pick:')) {
        setTarget(action.slice(5));
      }
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:string|null}} The finger to draw in red.
     */
    onFrame(hand, nowMs) {
      const template = app.templates[targetLetter];
      // No samples for this letter = study only; the coach can't check it.
      if (!template) {
        return { highlightFinger: null };
      }
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
        showDiagram(null);
        return { highlightFinger: null };
      }

      seeingText.textContent = 'I see: ' + guess.letter + ' (' + formatPercent(guess.confidence) + ' confident)';
      if (smooth.lockedLetter) {
        handleLock(smooth.lockedLetter, hand);
      }
      drawReferenceHand(referenceCanvas, template.points, { flipX: hand.mirrored });

      // Signing the right letter? Then no finger hint, just encouragement.
      const looksRight = guess.letter === targetLetter && guess.confidence >= app.minConfidence;
      if (looksRight) {
        hints.reset();
        showLooksRight(smooth.holdProgress);
        showDiagram(null);
        return { highlightFinger: null };
      }

      // Otherwise compare finger bends with the template and coach one finger.
      // The hint smoother stops the hint from jumping between fingers every frame.
      const fix = hints.update(findFingerToFix(hand.bends, template.bends));
      hintText.className = 'hint';
      hintText.textContent = hintMessage(fix);
      const highlightFinger = fix ? fix.finger : null;
      showDiagram(highlightFinger);
      return { highlightFinger };
    },
  };
}
