/**
 * freeMode.js
 * -----------
 * The Free Sign screen: sign anything and watch the coach recognize it live.
 *
 * Shows:
 *   - the recognized letter (big)
 *   - the confidence (how many of the 5 nearest neighbors agree)
 *   - the actual neighbor votes, so you can SEE k-NN working
 *   - a "hold steady" bar; when it fills, the letter is typed out
 */

import { LetterSmoother } from '../smoothing.js';
import { byId, setMeter, renderVotes, formatPercent } from '../ui.js';

/**
 * Creates the Free Sign mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function, handleShortcut:function}} The mode.
 */
export function createFreeMode(app) {
  const smoother = new LetterSmoother();
  let typedText = '';

  const letterBox = byId('free-letter');
  const message = byId('free-message');

  /**
   * Shows the typed text (or a placeholder if it's empty).
   * @returns {void}
   */
  function showTypedText() {
    byId('free-text').textContent = typedText === '' ? ' ' : typedText;
  }

  /**
   * Resets the live display to its "nothing recognized" look.
   * @param {string} text - What to show in the message line.
   * @returns {void}
   */
  function showNothing(text) {
    letterBox.textContent = '?';
    letterBox.classList.remove('locked');
    byId('free-confidence').textContent = '-';
    setMeter(byId('free-confidence-bar'), 0);
    setMeter(byId('free-hold-bar'), 0);
    renderVotes(byId('free-votes'), []);
    message.textContent = text;
  }

  /**
   * Edits the typed text: adds a space, deletes one letter, or clears it all.
   * @param {'space'|'backspace'|'clear'} edit - Which edit to make.
   * @returns {void}
   */
  function editText(edit) {
    if (edit === 'space') {
      typedText += ' ';
    } else if (edit === 'backspace') {
      typedText = typedText.slice(0, -1);
    } else if (edit === 'clear') {
      typedText = '';
    }
    showTypedText();
  }

  byId('free-space').addEventListener('click', () => editText('space'));
  byId('free-backspace').addEventListener('click', () => editText('backspace'));
  byId('free-clear').addEventListener('click', () => editText('clear'));

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      smoother.reset();
      showTypedText();
      if (app.pool.length === 0) {
        showNothing('The coach has no reference hands loaded. Reload the page (see the message at the top).');
      } else {
        showNothing('');
      }
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      smoother.reset();
    },

    /**
     * Handles a keyboard shortcut (see keyboard.js).
     * @param {string} action - "space", "backspace", or "clear".
     * @returns {void}
     */
    handleShortcut(action) {
      editText(action);
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:null}} Free Sign doesn't highlight fingers.
     */
    onFrame(hand, nowMs) {
      if (app.pool.length === 0) {
        return { highlightFinger: null };
      }

      const { guess, smooth } = app.recognize(hand, smoother, nowMs);
      if (!hand || !guess) {
        showNothing('Show one hand to the camera.');
        return { highlightFinger: null };
      }

      // Prefer the smoothed (steady) letter. If there isn't one yet, show this
      // frame's guess, or "?" if the neighbors disagree too much.
      let shownLetter = '?';
      if (smooth.stableLetter) {
        shownLetter = smooth.stableLetter;
      } else if (guess.confidence >= app.minConfidence) {
        shownLetter = guess.letter;
      }

      letterBox.textContent = shownLetter;
      letterBox.classList.toggle('locked', smooth.holdProgress >= 1);
      byId('free-confidence').textContent = guess.letter + ': ' + formatPercent(guess.confidence) + ' of neighbors agree';
      setMeter(byId('free-confidence-bar'), guess.confidence);
      setMeter(byId('free-hold-bar'), smooth.holdProgress);
      renderVotes(byId('free-votes'), guess.votes);

      if (guess.confidence < app.minConfidence) {
        message.textContent = 'Not sure... the nearest samples belong to different letters.';
      } else {
        message.textContent = '';
      }

      if (smooth.lockedLetter) {
        typedText += smooth.lockedLetter;
        showTypedText();
      }
      return { highlightFinger: null };
    },
  };
}
