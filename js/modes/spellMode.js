/**
 * spellMode.js
 * ------------
 * The Spell screen: type any word or sentence, and the coach teaches you
 * how to fingerspell it, one letter at a time.
 *
 *   1. phrase.js turns the text into letters ("Hi you" -> H I · Y O U).
 *   2. For each letter, we show its diagram, tip, and "watch out" note.
 *   3. The camera checks your sign (k-NN + smoothing, like Learn mode) and
 *      gives finger hints. Sign it correctly and it moves to the next letter.
 *   4. J and Z need movement, which the coach can't check yet, so they get
 *      written instructions and you press Skip when you've practiced them.
 */

import { LETTER_TIPS, LETTER_MIXUPS } from '../letters.js';
import { parsePhrase, MOTION_LETTER_TIPS } from '../phrase.js';
import { LetterSmoother, HintSmoother } from '../smoothing.js';
import { findFingerToFix, hintMessage } from '../hints.js';
import { renderHandDiagram } from '../diagram.js';
import { byId, makeElement, setMeter, showSuccessBurst, formatPercent } from '../ui.js';

/** After moving to a new letter, give the user this long to change handshape. */
const GET_READY_MS = 1000;

/** Pause after a correct letter (so the user sees the green tile) before moving on. */
const NEXT_LETTER_DELAY_MS = 700;

/** How long a "that looked like X" message stays before finger hints return. */
const WRONG_MESSAGE_MS = 1500;

/** Starting handshape to draw for the two motion letters. */
const MOTION_START_SHAPE = { J: 'I', Z: 'D' };

/**
 * Creates the Spell mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function, handleShortcut:function}} The mode.
 */
export function createSpellMode(app) {
  const smoother = new LetterSmoother();
  const hints = new HintSmoother();
  let steps = [];
  let progress = []; // one entry per step: 'todo', 'done', or 'skipped'
  let position = 0;
  let finished = false;
  let waitingToAdvance = false;
  let getReadyUntilMs = 0;
  let advanceTimer = null;
  let shownDiagramKey = '';
  let keepMessageUntilMs = 0;

  const input = byId('spell-input');
  const hintText = byId('spell-hint');
  const seeingText = byId('spell-seeing');
  const diagram = byId('spell-diagram');

  /**
   * Shows a message in the hint area.
   * @param {string} text - The message.
   * @param {boolean} isGood - True for green (encouraging), false for red (fix something).
   * @returns {void}
   */
  function setHint(text, isGood) {
    hintText.textContent = text;
    hintText.className = isGood ? 'hint good' : 'hint';
  }

  /**
   * Like setHint, but doesn't cover up a recent "that looked like X" message.
   * @param {string} text - The message.
   * @param {boolean} isGood - True for green, false for red.
   * @param {number} nowMs - performance.now() time.
   * @returns {void}
   */
  function setLiveHint(text, isGood, nowMs) {
    if (nowMs >= keepMessageUntilMs) {
      setHint(text, isGood);
    }
  }

  /**
   * Draws the diagram for the current letter, only if something changed.
   * @param {string|null} highlightFinger - Finger to draw in red, or null.
   * @returns {void}
   */
  function showDiagram(highlightFinger) {
    const step = steps[position];
    const shape = step.kind === 'motion' ? MOTION_START_SHAPE[step.letter] : step.letter;
    const key = shape + '|' + highlightFinger + '|' + app.settings.flipDiagrams;
    if (key !== shownDiagramKey) {
      shownDiagramKey = key;
      renderHandDiagram(diagram, shape, { flipX: app.settings.flipDiagrams, highlightFinger });
    }
  }

  /**
   * Draws the whole phrase as small tiles, grouped by word.
   * @returns {void}
   */
  function renderPhrase() {
    const container = byId('spell-phrase');
    container.replaceChildren();
    let wordBox = null;
    let currentWordIndex = -1;
    steps.forEach((step, index) => {
      if (step.wordIndex !== currentWordIndex) {
        currentWordIndex = step.wordIndex;
        wordBox = makeElement('span', 'phrase-word');
        container.append(wordBox);
      }
      const tile = makeElement('span', 'phrase-letter', step.letter);
      if (progress[index] !== 'todo') {
        tile.classList.add(progress[index]);
      }
      if (step.kind === 'motion') {
        tile.classList.add('motion');
      }
      if (index === position && !finished) {
        tile.classList.add('current');
      }
      wordBox.append(tile);
    });
  }

  /**
   * Shows everything for the current letter: big letter, diagram, tips.
   * @returns {void}
   */
  function renderCurrentLetter() {
    const step = steps[position];
    byId('spell-current-letter').textContent = step.letter;
    byId('spell-step').textContent = 'Letter ' + (position + 1) + ' of ' + steps.length;
    shownDiagramKey = '';
    showDiagram(null);
    diagram.nextElementSibling.textContent = step.kind === 'motion' ? 'Starting handshape' : 'How to make it';

    if (step.kind === 'motion') {
      byId('spell-tip').textContent = MOTION_LETTER_TIPS[step.letter];
      byId('spell-mixup').textContent = '';
      setHint(step.letter + ' is signed with a movement, so the coach can\'t check it yet. Practice it, then press Skip (→).', true);
      return;
    }
    byId('spell-tip').textContent = LETTER_TIPS[step.letter];
    byId('spell-mixup').textContent = LETTER_MIXUPS[step.letter];
    setHint('Make the letter ' + step.letter + ' and hold it steady.', true);
  }

  /**
   * Moves to a letter of the phrase.
   * @param {number} index - Which letter (0 = first).
   * @returns {void}
   */
  function goToStep(index) {
    clearTimeout(advanceTimer);
    waitingToAdvance = false;
    finished = false;
    position = Math.max(0, Math.min(steps.length - 1, index));
    // Going back to a letter means practicing it again.
    progress[position] = 'todo';
    smoother.reset();
    hints.reset();
    // Without this pause, the shape the hand is already holding could lock in right away.
    getReadyUntilMs = performance.now() + GET_READY_MS;
    setMeter(byId('spell-hold-bar'), 0);
    seeingText.textContent = '';
    renderPhrase();
    renderCurrentLetter();
  }

  /**
   * Marks the current letter as done or skipped, then moves on (or finishes).
   * @param {'done'|'skipped'} result - How the letter ended.
   * @returns {void}
   */
  function completeCurrentLetter(result) {
    progress[position] = result;
    if (position >= steps.length - 1) {
      finishPhrase();
      return;
    }
    goToStep(position + 1);
  }

  /**
   * Shows the "all done" state.
   * @returns {void}
   */
  function finishPhrase() {
    finished = true;
    waitingToAdvance = false;
    clearTimeout(advanceTimer);
    renderPhrase();
    const signed = progress.filter((p) => p === 'done').length;
    byId('spell-current-letter').textContent = '✓';
    byId('spell-step').textContent = 'Finished';
    setMeter(byId('spell-hold-bar'), 0);
    setHint('Done! You signed ' + signed + ' of ' + steps.length + ' letters. Type a new phrase, or press Start over.', true);
    showSuccessBurst('You spelled it!');
  }

  /**
   * Starts teaching a new phrase.
   * @param {string} text - What the user typed.
   * @returns {void}
   */
  function startLesson(text) {
    const parsed = parsePhrase(text);
    const note = byId('spell-form-note');
    if (parsed.steps.length === 0) {
      note.textContent = 'Type at least one letter (A to Z).';
      return;
    }
    const notes = [];
    if (parsed.skipped.length > 0) {
      notes.push('Skipped ' + parsed.skipped.join(' ') + ' (numbers and punctuation have their own signs).');
    }
    if (parsed.tooLong) {
      notes.push('Only the first 60 characters are used.');
    }
    note.textContent = notes.join(' ');

    steps = parsed.steps;
    progress = steps.map(() => 'todo');
    byId('spell-empty').hidden = true;
    byId('spell-lesson').hidden = false;
    // Take the cursor out of the text box so the arrow-key shortcuts work.
    input.blur();
    goToStep(0);
  }

  /**
   * Handles a letter that just locked in: move on if right, coach if wrong.
   * @param {string} lockedLetter - The letter the coach locked in.
   * @param {Object} hand - The hand at that moment (used for "keep learning").
   * @returns {void}
   */
  function handleLock(lockedLetter, hand) {
    const target = steps[position].letter;
    const correct = lockedLetter === target;
    app.recordAttempt(target, correct, 'spell');
    if (!correct) {
      setHint('That looked like ' + lockedLetter + '. Check the picture and try again.', false);
      keepMessageUntilMs = performance.now() + WRONG_MESSAGE_MS;
      return;
    }
    app.learnFrom(hand, target, lockedLetter);
    progress[position] = 'done';
    renderPhrase();
    setHint('Yes! That\'s ' + target + '.', true);
    waitingToAdvance = true;
    advanceTimer = setTimeout(() => completeCurrentLetter('done'), NEXT_LETTER_DELAY_MS);
  }

  byId('spell-form').addEventListener('submit', (event) => {
    // Stop the browser from reloading the page (the default for forms).
    event.preventDefault();
    startLesson(input.value);
  });
  for (const chip of document.querySelectorAll('#panel-spell [data-phrase]')) {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.phrase;
      startLesson(chip.dataset.phrase);
    });
  }
  byId('spell-skip').addEventListener('click', () => {
    if (steps.length > 0 && !finished) {
      completeCurrentLetter('skipped');
    }
  });
  byId('spell-back').addEventListener('click', () => goToStep(position - 1));
  byId('spell-restart').addEventListener('click', () => {
    progress = steps.map(() => 'todo');
    goToStep(0);
  });

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      if (steps.length === 0) {
        byId('spell-empty').hidden = false;
        byId('spell-lesson').hidden = true;
        input.focus();
        return;
      }
      shownDiagramKey = '';
      renderPhrase();
      if (!finished) {
        renderCurrentLetter();
      }
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      clearTimeout(advanceTimer);
      if (waitingToAdvance) {
        completeCurrentLetter('done');
      }
      smoother.reset();
    },

    /**
     * Handles a keyboard shortcut (see keyboard.js).
     * @param {string} action - "next-letter", "previous-letter", or "focus-input".
     * @returns {void}
     */
    handleShortcut(action) {
      if (action === 'focus-input') {
        input.focus();
        input.select();
      } else if (steps.length === 0) {
        return;
      } else if (action === 'next-letter' && !finished) {
        completeCurrentLetter(progress[position] === 'done' ? 'done' : 'skipped');
      } else if (action === 'previous-letter') {
        goToStep(finished ? steps.length - 1 : position - 1);
      }
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:string|null}} The finger to draw in red.
     */
    onFrame(hand, nowMs) {
      if (steps.length === 0 || finished || waitingToAdvance) {
        return { highlightFinger: null };
      }
      const step = steps[position];
      const template = app.templates[step.letter];
      if (step.kind === 'motion' || !template) {
        return { highlightFinger: null };
      }

      // During the get-ready pause we keep clearing the smoother, so nothing can lock in.
      if (nowMs < getReadyUntilMs) {
        smoother.reset();
      }
      const { guess, smooth } = app.recognize(hand, smoother, nowMs);
      setMeter(byId('spell-hold-bar'), smooth.stableLetter === step.letter ? smooth.holdProgress : 0);

      if (!hand || !guess) {
        seeingText.textContent = '';
        setLiveHint('Show your hand to the camera.', false, nowMs);
        showDiagram(null);
        return { highlightFinger: null };
      }
      seeingText.textContent = 'I see: ' + guess.letter + ' (' + formatPercent(guess.confidence) + ' confident)';

      if (smooth.lockedLetter) {
        handleLock(smooth.lockedLetter, hand);
        if (waitingToAdvance) {
          showDiagram(null);
          return { highlightFinger: null };
        }
      }

      if (guess.letter === step.letter && guess.confidence >= app.minConfidence) {
        hints.reset();
        setLiveHint('Looks like ' + step.letter + '! Hold it steady...', true, nowMs);
        showDiagram(null);
        return { highlightFinger: null };
      }

      // Otherwise compare finger bends with the real signers' template and coach one finger.
      const fix = hints.update(findFingerToFix(hand.bends, template.bends));
      setLiveHint(hintMessage(fix), false, nowMs);
      const highlightFinger = fix ? fix.finger : null;
      showDiagram(highlightFinger);
      return { highlightFinger };
    },
  };
}
