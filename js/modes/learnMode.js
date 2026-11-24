/**
 * learnMode.js
 * ------------
 * The Learn screen: practice letters with live coaching. Two ways to practice:
 *
 *   WHOLE ALPHABET: go through A to Y one letter at a time (Enter = next).
 *     Turn off "go to the next letter" to repeat the same letter as many
 *     times as you like; a counter shows how many times in a row you got it.
 *
 *   PRACTICE SET: pick one letter or a few (or a look-alike group like M · N),
 *     choose how many times each, and drill them. At the end you get a
 *     summary and can practice just the tricky ones again (drill.js).
 *
 * For each letter: a diagram (drag it to turn the 3D hand), photos of real
 * signers, the real signers' average skeleton, live finger hints (the finger
 * to fix turns red), and a success animation when you hold it correctly.
 */

import { STATIC_LETTERS, LETTER_MIXUPS } from '../letters.js';
import { LetterSmoother, HintSmoother } from '../smoothing.js';
import { findFingerToFix, hintMessage } from '../hints.js';
import { drawReferenceHand } from '../draw.js';
import { renderHandDiagram, enableDragToTurn } from '../diagram.js';
import {
  createDrill, currentDrillLetter, recordDrillSign, skipDrillLetter, isDrillDone, summarizeDrill,
  DRILL_PRESETS, MIN_REPEATS, MAX_REPEATS,
} from '../drill.js';
import {
  byId, makeElement, setMeter, renderLetterGrid, showSuccessBurst, formatPercent, renderLetterPhotos, renderSteps,
} from '../ui.js';

/** After picking a letter, give the user this long to get their hand ready. */
const GET_READY_MS = 1500;

/** Wait this long after a correct sign before moving on (so the success shows). */
const ADVANCE_DELAY_MS = 1400;

/**
 * Creates the Learn mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {Object} The mode (enter, exit, onFrame, handleShortcut, selectLetter, refreshDiagrams).
 */
export function createLearnMode(app) {
  const smoother = new LetterSmoother();
  const hints = new HintSmoother();
  let practice = 'alphabet'; // 'alphabet' or 'set'
  let targetLetter = STATIC_LETTERS[0];
  let getReadyUntilMs = 0;
  let advanceTimer = null;
  let shownDiagramKey = '';
  let turn = { yaw: 0, pitch: 0 };
  let correctInARow = 0;

  // Practice set state
  let chosenLetters = new Set(['M', 'N']);
  let repeats = 3;
  let drill = null;

  const hintText = byId('learn-hint');
  const seeingText = byId('learn-seeing');
  const referenceCanvas = byId('reference-canvas');
  const diagram = byId('learn-diagram');
  const autoAdvanceBox = byId('learn-auto-advance');

  // ---------- Drawing the current letter ----------

  /**
   * Draws the diagram, but only if something changed (redrawing every frame is wasteful).
   * @param {string|null} highlightFinger - Finger to draw in red, or null.
   * @returns {void}
   */
  function showDiagram(highlightFinger) {
    const flipX = app.settings.flipDiagrams;
    const key = [targetLetter, highlightFinger, flipX, turn.yaw, turn.pitch].join('|');
    if (key === shownDiagramKey) {
      return;
    }
    shownDiagramKey = key;
    renderHandDiagram(diagram, targetLetter, { flipX, highlightFinger, turn, labels: true });
  }

  /**
   * Redraws the letter picker and the "letters mastered" bar.
   * @returns {void}
   */
  function showLetterGrid() {
    const mastered = app.masteredLetters();
    renderLetterGrid(byId('learn-letter-grid'), {
      counts: app.sampleCounts(),
      selected: targetLetter,
      onPick: (letter) => {
        if (practice === 'alphabet') {
          setTarget(letter);
        }
      },
      showCounts: false,
      mastered: mastered,
    });
    byId('learn-mastery').textContent = mastered.size + ' / ' + STATIC_LETTERS.length;
    setMeter(byId('learn-mastery-bar'), mastered.size / STATIC_LETTERS.length);
  }

  /**
   * Shows the live-checking area, or a notice if there's no reference for this letter.
   * @param {Object|undefined} template - The letter's template, if it has samples.
   * @returns {void}
   */
  function showCheckingArea(template) {
    const hasSamples = Boolean(template);
    byId('learn-check').hidden = !hasSamples;
    byId('learn-no-samples').hidden = hasSamples;
    if (hasSamples) {
      byId('reference-caption').textContent = 'Average of ' + template.count + ' real signers';
      drawReferenceHand(referenceCanvas, template.points, { flipX: app.handMirrored });
      hintText.className = 'hint';
      hintText.textContent = 'Make the letter ' + targetLetter + ' and hold it steady.';
      return;
    }
    byId('reference-caption').textContent = 'No reference yet';
    drawReferenceHand(referenceCanvas, null);
    byId('learn-no-samples-text').textContent = 'The coach can\'t check ' + targetLetter + ' right now because it has no reference hands for it.';
  }

  /**
   * Shows the "Letter 3 of 24" or "Set: 4 of 12" position.
   * @returns {void}
   */
  function showPosition() {
    if (practice === 'set' && drill) {
      const done = drill.position;
      const total = drill.queue.length;
      byId('learn-position').textContent = 'Set: ' + Math.min(done + 1, total) + ' of ' + total;
      byId('learn-set-progress').textContent = drill.letters.join(' · ') + ' — ' + done + ' of ' + total + ' done';
      setMeter(byId('learn-set-bar'), done / total);
      return;
    }
    byId('learn-position').textContent = 'Letter ' + (STATIC_LETTERS.indexOf(targetLetter) + 1) + ' of ' + STATIC_LETTERS.length;
  }

  /**
   * Shows the "signed correctly N times in a row" chip.
   * @returns {void}
   */
  function showRepeatCounter() {
    const chip = byId('learn-repeat');
    chip.hidden = correctInARow === 0;
    chip.textContent = '✓ ' + correctInARow + '× in a row';
  }

  /**
   * Switches to a new target letter and redraws everything for it.
   * @param {string} letter - The new target.
   * @returns {void}
   */
  function setTarget(letter) {
    clearTimeout(advanceTimer);
    if (letter !== targetLetter) {
      correctInARow = 0;
    }
    targetLetter = letter;
    smoother.reset();
    hints.reset();
    setMeter(byId('learn-hold-bar'), 0);
    seeingText.textContent = '';
    // Without this pause, whatever shape the hand is ALREADY holding would
    // lock in right away and count as a wrong attempt for the new letter.
    getReadyUntilMs = performance.now() + GET_READY_MS;

    byId('learn-letter').textContent = letter;
    renderSteps(byId('learn-steps'), letter);
    byId('learn-mixup').textContent = LETTER_MIXUPS[letter];
    renderLetterPhotos(byId('learn-photos'), letter, app.settings.flipDiagrams);
    showPosition();
    showRepeatCounter();
    showLetterGrid();
    showDiagram(null);
    showCheckingArea(app.templates[letter]);
  }

  /**
   * Moves forward or backward through the alphabet (wrapping around).
   * In a practice set, "next" skips the current letter instead.
   * @param {number} step - +1 for the next letter, -1 for the previous one.
   * @returns {void}
   */
  function moveLetter(step) {
    if (practice === 'set') {
      if (drill && step > 0 && !isDrillDone(drill)) {
        skipDrillLetter(drill);
        continueDrill();
      }
      return;
    }
    const count = STATIC_LETTERS.length;
    const index = STATIC_LETTERS.indexOf(targetLetter);
    // Adding "count" before % keeps the result positive when going back from A.
    setTarget(STATIC_LETTERS[(index + step + count) % count]);
  }

  // ---------- Practice sets ----------

  /**
   * Shows the right parts of the practice card for the current state.
   * @returns {void}
   */
  function showPracticeCard() {
    for (const button of byId('learn-practice-switch').querySelectorAll('button')) {
      button.setAttribute('aria-checked', String(button.dataset.practice === practice));
    }
    const inSet = practice === 'set';
    const finished = inSet && drill !== null && isDrillDone(drill);
    byId('learn-set-setup').hidden = !inSet || drill !== null;
    byId('learn-set-running').hidden = !inSet || drill === null || finished;
    byId('learn-summary').hidden = !finished;
    // While choosing letters or reading the summary, the coach card would only distract.
    byId('learn-coach-card').hidden = inSet && (drill === null || finished);
    byId('learn-alphabet-card').hidden = inSet;
    byId('learn-alphabet-options').hidden = inSet;
    byId('learn-previous').hidden = inSet;
    byId('learn-next').hidden = finished || (inSet && drill === null);
    byId('learn-next-text').textContent = inSet ? 'Skip letter' : 'Next letter';
    if (inSet && drill === null) {
      showSetChooser();
    }
  }

  /**
   * Draws the letter chooser for practice sets (tap to add or remove a letter).
   * @returns {void}
   */
  function showSetChooser() {
    renderLetterGrid(byId('learn-set-grid'), {
      counts: app.sampleCounts(),
      selected: null,
      onPick: (letter) => {
        if (chosenLetters.has(letter)) {
          chosenLetters.delete(letter);
        } else {
          chosenLetters.add(letter);
        }
        showSetChooser();
      },
      showCounts: false,
      mastered: new Set(),
      pressed: chosenLetters,
    });
    byId('learn-reps').textContent = String(repeats);
    const count = chosenLetters.size;
    byId('learn-set-start').disabled = count === 0;
    byId('learn-set-note').textContent = count === 0
      ? 'Choose at least one letter.'
      : count + (count === 1 ? ' letter' : ' letters') + ' × ' + repeats + ' = ' + count * repeats + ' signs';
  }

  /**
   * Starts a practice set with the given letters.
   * @param {string[]} letters - Letters to practice (in alphabet order).
   * @returns {void}
   */
  function startDrill(letters) {
    drill = createDrill(letters, repeats, byId('learn-set-mix').checked);
    correctInARow = 0;
    showPracticeCard();
    setTarget(currentDrillLetter(drill));
  }

  /**
   * Moves to the next letter of the practice set, or shows the summary at the end.
   * @returns {void}
   */
  function continueDrill() {
    if (isDrillDone(drill)) {
      showDrillSummary();
      return;
    }
    setTarget(currentDrillLetter(drill));
  }

  /**
   * Shows how the practice set went.
   * @returns {void}
   */
  function showDrillSummary() {
    // Ending early still counts the letters that were left as not done.
    drill.position = drill.queue.length;
    showPracticeCard();
    const { rows, needsWork } = summarizeDrill(drill);
    const perfect = rows.length - needsWork.length;
    byId('learn-summary-title').textContent = perfect === rows.length
      ? 'Perfect! Every letter with no misses.'
      : perfect + ' of ' + rows.length + ' letters with no misses. The tricky ones are highlighted.';
    const container = byId('learn-summary-rows');
    container.replaceChildren();
    for (const row of rows) {
      const item = makeElement('div', row.firstTry ? 'summary-row good' : 'summary-row tricky');
      item.append(makeElement('strong', '', row.letter));
      item.append(makeElement('span', '', row.correct + ' correct in ' + row.tries + (row.tries === 1 ? ' try' : ' tries')));
      container.append(item);
    }
    byId('learn-summary-missed').hidden = needsWork.length === 0;
    byId('learn-position').textContent = 'Set finished';
    hintText.className = 'hint good';
    hintText.textContent = 'Practice set finished! Your results are above.';
    if (perfect > 0) {
      showSuccessBurst('Set complete!');
    }
  }

  /**
   * Shows the quick-pick buttons: weakest letters, this letter, and look-alike groups.
   * @returns {void}
   */
  function showPresets() {
    const container = byId('learn-presets');
    container.replaceChildren();
    const presets = [];
    const weakest = app.weakestLetters(4);
    if (weakest.length > 0) {
      presets.push({ name: '★ My weakest: ' + weakest.join(' · '), letters: weakest });
    }
    presets.push({ name: 'Just ' + targetLetter, letters: [targetLetter] });
    for (const preset of DRILL_PRESETS) {
      presets.push({ name: preset.name, letters: preset.letters });
    }
    for (const preset of presets) {
      const chip = makeElement('button', 'chip-button', preset.name);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        chosenLetters = new Set(preset.letters);
        showSetChooser();
      });
      container.append(chip);
    }
  }

  /**
   * Switches between "whole alphabet" and "practice set".
   * @param {'alphabet'|'set'} mode - Which way to practice.
   * @returns {void}
   */
  function setPractice(mode) {
    practice = mode;
    drill = null;
    correctInARow = 0;
    if (mode === 'set') {
      showPresets();
    }
    showPracticeCard();
    setTarget(targetLetter);
  }

  // ---------- Signing ----------

  /**
   * Handles a letter that just locked in.
   * @param {string} lockedLetter - The letter the smoother locked in.
   * @param {Object} hand - The hand at that moment (used for "keep learning").
   * @returns {void}
   */
  function handleLock(lockedLetter, hand) {
    const correct = lockedLetter === targetLetter;
    app.recordAttempt(targetLetter, correct, 'learn');
    if (!correct) {
      if (practice === 'set' && drill) {
        recordDrillSign(drill, false);
      }
      correctInARow = 0;
      showRepeatCounter();
      return;
    }

    app.learnFrom(hand, targetLetter, lockedLetter);
    correctInARow += 1;
    showRepeatCounter();
    showSuccessBurst('You signed ' + targetLetter + '!');
    if (practice === 'set' && drill) {
      recordDrillSign(drill, true);
      showPosition();
      advanceTimer = setTimeout(continueDrill, ADVANCE_DELAY_MS);
      return;
    }
    showLetterGrid();
    if (app.settings.autoAdvance) {
      advanceTimer = setTimeout(() => moveLetter(1), ADVANCE_DELAY_MS);
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
    } else if (practice === 'set' || app.settings.autoAdvance) {
      hintText.textContent = 'Correct! Next letter coming up...';
    } else {
      hintText.textContent = 'Correct! Relax your hand and sign ' + targetLetter + ' again, or press Enter for the next letter.';
    }
  }

  // ---------- Buttons ----------

  byId('learn-next').addEventListener('click', () => moveLetter(1));
  byId('learn-previous').addEventListener('click', () => moveLetter(-1));
  byId('learn-record-this').addEventListener('click', () => app.openRecord(targetLetter));
  autoAdvanceBox.addEventListener('change', () => app.setSetting('autoAdvance', autoAdvanceBox.checked));
  for (const button of byId('learn-practice-switch').querySelectorAll('button')) {
    button.addEventListener('click', () => setPractice(button.dataset.practice));
  }
  byId('learn-reps-minus').addEventListener('click', () => {
    repeats = Math.max(MIN_REPEATS, repeats - 1);
    showSetChooser();
  });
  byId('learn-reps-plus').addEventListener('click', () => {
    repeats = Math.min(MAX_REPEATS, repeats + 1);
    showSetChooser();
  });
  byId('learn-set-start').addEventListener('click', () => {
    startDrill(STATIC_LETTERS.filter((letter) => chosenLetters.has(letter)));
  });
  byId('learn-set-end').addEventListener('click', () => {
    clearTimeout(advanceTimer);
    showDrillSummary();
  });
  byId('learn-summary-again').addEventListener('click', () => startDrill(drill.letters));
  byId('learn-summary-missed').addEventListener('click', () => startDrill(summarizeDrill(drill).needsWork));
  byId('learn-summary-new').addEventListener('click', () => setPractice('set'));
  enableDragToTurn(diagram, (newTurn) => {
    turn = { ...newTurn };
    showDiagram(null);
  });

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      autoAdvanceBox.checked = app.settings.autoAdvance;
      shownDiagramKey = '';
      if (practice === 'set' && drill === null) {
        showPresets();
      }
      showPracticeCard();
      setTarget(targetLetter);
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      clearTimeout(advanceTimer);
      smoother.reset();
    },

    /** Redraws the diagram and photos (after the Right / Left hand switch changes). @returns {void} */
    refreshDiagrams() {
      shownDiagramKey = '';
      showDiagram(null);
      renderLetterPhotos(byId('learn-photos'), targetLetter, app.settings.flipDiagrams);
    },

    /**
     * Jumps to a letter (used by the Alphabet screen); switches to whole-alphabet practice.
     * @param {string} letter - The letter to practice.
     * @returns {void}
     */
    selectLetter(letter) {
      practice = 'alphabet';
      drill = null;
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
      } else if (action.startsWith('pick:') && practice === 'alphabet') {
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
      const notPracticing = practice === 'set' && (drill === null || isDrillDone(drill));
      if (!template || notPracticing) {
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
