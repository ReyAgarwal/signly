/**
 * recordMode.js
 * -------------
 * The Record Samples screen: this is how the coach LEARNS.
 *
 * We have no dataset, so we make our own. You pick a letter, make the sign,
 * and press Record. After a 3-2-1 countdown, the coach saves a snapshot of
 * your normalized hand (63 numbers) every 100 ms for 3 seconds, so about
 * 30 samples per press. k-NN later compares live hands to these samples.
 */

import { STATIC_LETTERS, LETTER_TIPS } from '../letters.js';
import { makeSampleId } from '../storage.js';
import { byId, renderLetterGrid, setCountdown, makeConfirmButton } from '../ui.js';

/** Seconds of 3-2-1 countdown before recording starts. */
const COUNTDOWN_SECONDS = 3;

/** How long one recording lasts. */
const RECORDING_MS = 3000;

/** Minimum time between two saved samples (100 ms = 10 per second). */
const CAPTURE_EVERY_MS = 100;

/**
 * Creates the Record Samples mode.
 * @param {Object} app - Shared app helpers and data (see main.js).
 * @returns {{enter:function, exit:function, onFrame:function}} The mode.
 */
export function createRecordMode(app) {
  let selectedLetter = STATIC_LETTERS[0];
  let phase = 'idle'; // 'idle', 'countdown', or 'recording'
  let countdownTimer = null;
  let recordingEndsAt = 0;
  let lastCaptureAt = 0;
  let captured = [];

  const startButton = byId('record-start');
  const statusText = byId('record-status');

  /**
   * Redraws the letter grid, the selected letter, and the sample counts.
   * @returns {void}
   */
  function refresh() {
    const counts = app.sampleCounts();
    renderLetterGrid(byId('record-letter-grid'), {
      counts: counts,
      selected: selectedLetter,
      onPick: pickLetter,
    });
    byId('record-selected').textContent = selectedLetter;
    byId('record-tip').textContent = LETTER_TIPS[selectedLetter];
    byId('record-count').textContent = (counts[selectedLetter] ?? 0) + ' samples recorded for ' + selectedLetter;

    const letterCount = app.recordedLetters().length;
    byId('record-total').textContent = 'Total: ' + app.data.samples.length + ' samples across ' + letterCount + ' of 24 letters.';
  }

  /**
   * Selects a letter to record (ignored while recording).
   * @param {string} letter - The letter that was clicked.
   * @returns {void}
   */
  function pickLetter(letter) {
    if (phase !== 'idle') {
      return;
    }
    selectedLetter = letter;
    statusText.textContent = '';
    refresh();
  }

  /**
   * Starts the 3-2-1 countdown, then recording.
   * @returns {void}
   */
  function startCountdown() {
    if (phase !== 'idle') {
      return;
    }
    if (!app.isTrackerReady()) {
      statusText.textContent = 'The camera is not ready yet. Wait for the video to appear, then try again.';
      return;
    }

    phase = 'countdown';
    startButton.disabled = true;
    statusText.textContent = 'Get ready to sign ' + selectedLetter + '...';
    let secondsLeft = COUNTDOWN_SECONDS;
    setCountdown(String(secondsLeft));

    countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        setCountdown(String(secondsLeft));
        return;
      }
      clearInterval(countdownTimer);
      beginRecording();
    }, 1000);
  }

  /**
   * Switches from countdown to actually saving samples.
   * @returns {void}
   */
  function beginRecording() {
    phase = 'recording';
    captured = [];
    recordingEndsAt = performance.now() + RECORDING_MS;
    lastCaptureAt = 0;
    setCountdown('● Recording ' + selectedLetter + '... move your hand a little', true);
    statusText.textContent = 'Recording ' + selectedLetter + '. Hold the sign and move your hand slightly.';
  }

  /**
   * Saves what was captured and goes back to idle.
   * @returns {void}
   */
  function finishRecording() {
    phase = 'idle';
    setCountdown('');
    startButton.disabled = false;

    if (captured.length === 0) {
      statusText.textContent = 'No hand was detected while recording, so nothing was saved. Hold your hand up inside the video and try again.';
      return;
    }
    app.addSamples(captured);
    statusText.textContent = 'Saved ' + captured.length + ' samples of ' + selectedLetter + '. Record more from different angles, or pick another letter.';
    captured = [];
    refresh();
  }

  /**
   * Stops any countdown or recording without saving (used when leaving the screen).
   * @returns {void}
   */
  function cancel() {
    clearInterval(countdownTimer);
    phase = 'idle';
    captured = [];
    setCountdown('');
    startButton.disabled = false;
  }

  /**
   * Turns the current hand into a sample object.
   * @param {Object} hand - The processed hand from main.js.
   * @returns {{id:string, letter:string, features:number[], hand:string, time:number}} A sample.
   */
  function makeSample(hand) {
    const now = Date.now();
    return {
      id: makeSampleId(now),
      letter: selectedLetter,
      features: hand.features,
      hand: hand.handedness,
      time: now,
    };
  }

  startButton.addEventListener('click', startCountdown);

  makeConfirmButton(byId('record-delete-letter'), () => {
    const count = app.sampleCounts()[selectedLetter] ?? 0;
    app.deleteSamplesFor(selectedLetter);
    statusText.textContent = 'Deleted ' + count + ' samples of ' + selectedLetter + '.';
    refresh();
  });

  return {
    /** Called when this screen opens. @returns {void} */
    enter() {
      statusText.textContent = '';
      refresh();
    },

    /** Called when leaving this screen. @returns {void} */
    exit() {
      cancel();
    },

    /**
     * Called for every video frame.
     * @param {Object|null} hand - The processed hand, or null if none is visible.
     * @param {number} nowMs - performance.now() time of this frame.
     * @returns {{highlightFinger:null}} Nothing to highlight in this mode.
     */
    onFrame(hand, nowMs) {
      if (phase !== 'recording') {
        return { highlightFinger: null };
      }
      if (nowMs >= recordingEndsAt) {
        finishRecording();
        return { highlightFinger: null };
      }
      // Only save if a hand is visible, and not more often than every 100 ms
      // (the camera runs ~30 frames per second; back-to-back frames are nearly identical).
      if (hand && nowMs - lastCaptureAt >= CAPTURE_EVERY_MS) {
        captured.push(makeSample(hand));
        lastCaptureAt = nowMs;
        setCountdown('● Recording ' + selectedLetter + '... ' + captured.length + ' samples', true);
      }
      return { highlightFinger: null };
    },
  };
}
