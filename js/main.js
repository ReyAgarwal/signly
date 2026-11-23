/**
 * main.js
 * -------
 * The starting point of the app. It:
 *   1. Loads saved data and builds the letter templates.
 *   2. Sets up navigation between screens.
 *   3. Starts the webcam and hand tracker when a camera screen opens.
 *   4. Runs the "frame loop": for every new video frame, find the hand,
 *      normalize it, hand it to the active mode, and draw the skeleton.
 *   5. Wires up the Progress and Test & Data screens.
 *
 * The "app" object below is shared with every mode. It holds the data and
 * small helper functions, so modes don't each need to know about storage.
 */

import { startCamera, createHandTracker, detectHand, friendlyCameraError } from './camera.js';
import { normalizeHand, pointsToFeatures, shouldMirror } from './landmarks.js';
import { classify, evaluateAccuracy } from './classifier.js';
import { allFingerBends, buildAllTemplates } from './hints.js';
import { STATIC_LETTERS } from './letters.js';
import { addAttempt, makeAttempt } from './progress.js';
import {
  loadData, saveData, emptyData, makeExportJson, parseImportJson, mergeData,
} from './storage.js';
import {
  byId, showScreen, showBanner, hideBanner, setCameraStatus, renderProgress,
  renderAccuracyReport, makeConfirmButton, downloadTextFile, CAMERA_SCREENS,
} from './ui.js';
import { drawLiveHand, clearCanvas, matchCanvasToVideo } from './draw.js';
import { createRecordMode } from './modes/recordMode.js';
import { createFreeMode } from './modes/freeMode.js';
import { createLearnMode } from './modes/learnMode.js';
import { createSpellMode } from './modes/spellMode.js';

/** A guess counts only if at least 60% of the k neighbors agree (3 of 5). */
const MIN_CONFIDENCE = 0.6;

/** Show the "no hand detected" message after this long without a hand. */
const NO_HAND_MESSAGE_DELAY_MS = 1200;

const NO_HAND_MESSAGE = 'No hand detected. Hold one hand up inside the video, about an arm\'s length from the camera, in good light.';

// ---------- Shared app object (given to every mode) ----------

const app = {
  data: emptyData(),
  templates: {},
  minConfidence: MIN_CONFIDENCE,
  // Remembers whether the last hand seen was mirrored, so Learn mode can
  // draw the reference hand the same way around as the user's hand.
  handMirrored: false,
  isTrackerReady: () => cameraState === 'ready',
  sampleCounts: countSamplesPerLetter,
  recordedLetters: listRecordedLetters,
  addSamples: addSamples,
  deleteSamplesFor: deleteSamplesFor,
  recordAttempt: recordAttempt,
  setBestSpellScore: setBestSpellScore,
  recognize: recognize,
};

// ---------- Camera and tracker state ----------

let cameraState = 'off'; // 'off', 'starting', 'ready', or 'error'
let trackerPromise = null;
let tracker = null;
let lastVideoTime = -1;
let lastHandSeenMs = 0;
let noHandMessageShowing = false;
let detectionErrorShown = false;
let currentScreen = 'home';
let modes = {};

// ---------- Data helpers ----------

/**
 * Saves all data to localStorage and shows a banner if that fails.
 * @returns {void}
 */
function persist() {
  const result = saveData(app.data);
  if (!result.ok) {
    showBanner(result.error, 'error');
  }
}

/**
 * Rebuilds the letter templates after samples change, then saves.
 * @returns {void}
 */
function onSamplesChanged() {
  app.templates = buildAllTemplates(app.data.samples);
  persist();
}

/**
 * Counts recorded samples for each letter.
 * @returns {Object<string, number>} letter -> number of samples.
 */
function countSamplesPerLetter() {
  const counts = {};
  for (const sample of app.data.samples) {
    counts[sample.letter] = (counts[sample.letter] ?? 0) + 1;
  }
  return counts;
}

/**
 * Lists the letters that have at least one sample, in alphabet order.
 * @returns {string[]} The recorded letters.
 */
function listRecordedLetters() {
  const counts = countSamplesPerLetter();
  return STATIC_LETTERS.filter((letter) => counts[letter] > 0);
}

/**
 * Adds newly recorded samples.
 * @param {Array<Object>} newSamples - Samples from Record mode.
 * @returns {void}
 */
function addSamples(newSamples) {
  app.data.samples.push(...newSamples);
  onSamplesChanged();
}

/**
 * Deletes every sample of one letter.
 * @param {string} letter - The letter to delete.
 * @returns {void}
 */
function deleteSamplesFor(letter) {
  app.data.samples = app.data.samples.filter((sample) => sample.letter !== letter);
  onSamplesChanged();
}

/**
 * Saves one practice attempt for the Progress screen.
 * @param {string} letter - The letter the user was supposed to sign.
 * @param {boolean} correct - Whether they got it right.
 * @param {string} mode - "learn" or "spell".
 * @returns {void}
 */
function recordAttempt(letter, correct, mode) {
  app.data.attempts = addAttempt(app.data.attempts, makeAttempt(letter, correct, mode, Date.now()));
  persist();
}

/**
 * Saves a new best Spell-a-Word score.
 * @param {number} score - The new best score.
 * @returns {void}
 */
function setBestSpellScore(score) {
  app.data.bestSpellScore = score;
  persist();
}

/**
 * Recognizes the hand with k-NN and passes the result through the smoother.
 * @param {Object|null} hand - The processed hand, or null if none is visible.
 * @param {LetterSmoother} smoother - The mode's smoother.
 * @param {number} nowMs - performance.now() time of this frame.
 * @returns {{guess:Object|null, smooth:Object}} Raw k-NN guess and smoothed result.
 */
function recognize(hand, smoother, nowMs) {
  if (!hand) {
    return { guess: null, smooth: smoother.update(null, nowMs) };
  }
  const guess = classify(hand.features, app.data.samples);

  // A low-confidence guess is treated like "not sure" (null), so the
  // smoother never locks in a letter the neighbors can't agree on.
  let letterForVote = null;
  if (guess && guess.confidence >= MIN_CONFIDENCE) {
    letterForVote = guess.letter;
  }
  return { guess, smooth: smoother.update(letterForVote, nowMs) };
}

// ---------- Camera and frame loop ----------

/**
 * Turns MediaPipe's raw detection into everything the modes need.
 * @param {{landmarks:Array, handedness:string}} detection - From detectHand().
 * @param {HTMLVideoElement} video - The webcam video (for its width/height).
 * @returns {Object} The processed hand: landmarks, points, features, bends, etc.
 */
function buildHand(detection, video) {
  const aspectRatio = video.videoWidth / video.videoHeight;
  const points = normalizeHand(detection.landmarks, { aspectRatio, handedness: detection.handedness });
  return {
    landmarks: detection.landmarks,
    handedness: detection.handedness,
    mirrored: shouldMirror(detection.handedness),
    points: points,
    features: pointsToFeatures(points),
    bends: allFingerBends(points),
  };
}

/**
 * Starts loading the hand tracker (only once), so it's ready by the time
 * the user opens a camera screen.
 * @returns {Promise<Object>} Resolves to the tracker.
 */
function loadTracker() {
  if (!trackerPromise) {
    trackerPromise = createHandTracker();
  }
  return trackerPromise;
}

/**
 * Starts the webcam and hand tracker if they aren't running yet.
 * Shows a friendly message on the video if anything goes wrong.
 * @returns {Promise<void>}
 */
async function ensureCameraRunning() {
  if (cameraState === 'starting' || cameraState === 'ready') {
    return;
  }
  cameraState = 'starting';
  byId('camera-retry').hidden = true;
  setCameraStatus('Starting the camera... If Chrome asks for permission, click "Allow".');

  try {
    await startCamera(byId('video'));
  } catch (error) {
    cameraState = 'error';
    setCameraStatus(friendlyCameraError(error), true);
    byId('camera-retry').hidden = false;
    return;
  }

  setCameraStatus('Loading the hand tracker...');
  try {
    tracker = await loadTracker();
  } catch (error) {
    console.error('Hand tracker failed to load:', error);
    cameraState = 'error';
    trackerPromise = null;
    setCameraStatus('The hand tracker could not load. Make sure the "vendor" and "models" folders are next to index.html and that you opened http://localhost:8000, then reload.', true);
    byId('camera-retry').hidden = false;
    return;
  }

  cameraState = 'ready';
  lastHandSeenMs = performance.now();
  setCameraStatus('');
}

/**
 * Shows or hides the "no hand detected" message.
 * @param {boolean} handVisible - Whether a hand is in this frame.
 * @param {number} nowMs - performance.now() time.
 * @returns {void}
 */
function updateNoHandMessage(handVisible, nowMs) {
  if (handVisible) {
    lastHandSeenMs = nowMs;
    if (noHandMessageShowing) {
      setCameraStatus('');
      noHandMessageShowing = false;
    }
    return;
  }
  if (!noHandMessageShowing && nowMs - lastHandSeenMs > NO_HAND_MESSAGE_DELAY_MS) {
    setCameraStatus(NO_HAND_MESSAGE);
    noHandMessageShowing = true;
  }
}

/**
 * Runs once per screen refresh (about 60 times a second). Only does work
 * when a camera screen is open and the video has a NEW frame.
 * @returns {void}
 */
function frameLoop() {
  requestAnimationFrame(frameLoop);

  const video = byId('video');
  if (cameraState !== 'ready' || !CAMERA_SCREENS.includes(currentScreen)) {
    return;
  }
  // readyState 2 or more means the video has a picture we can read.
  // Skipping repeated frames saves work when the screen refreshes faster than the camera.
  if (video.readyState < 2 || video.currentTime === lastVideoTime) {
    return;
  }
  lastVideoTime = video.currentTime;

  const nowMs = performance.now();
  let detection = null;
  try {
    detection = detectHand(tracker, video, nowMs);
  } catch (error) {
    if (!detectionErrorShown) {
      console.error('Hand detection error:', error);
      showBanner('Hand tracking hit an error. Try reloading the page.', 'error');
      detectionErrorShown = true;
    }
    return;
  }

  const hand = detection ? buildHand(detection, video) : null;
  if (hand) {
    app.handMirrored = hand.mirrored;
  }
  updateNoHandMessage(hand !== null, nowMs);

  const drawing = modes[currentScreen].onFrame(hand, nowMs);
  const overlay = byId('overlay');
  matchCanvasToVideo(overlay, video);
  if (hand) {
    drawLiveHand(overlay, hand.landmarks, drawing.highlightFinger);
  } else {
    clearCanvas(overlay);
  }
}

// ---------- Screens ----------

/**
 * Updates the status message on the Home screen.
 * @returns {void}
 */
function renderHome() {
  const letters = listRecordedLetters();
  const status = byId('home-status');
  if (letters.length === 0) {
    status.textContent = 'Start here: open Record Samples and record at least 3 letters (for example A, B, and L). The coach learns from YOUR hands.';
    return;
  }
  status.textContent = app.data.samples.length + ' samples recorded for ' + letters.length + ' letters (' + letters.join(', ') + '). Try Free Sign or Learn!';
}

/**
 * Updates the sample/attempt counts on the Test & Data screen.
 * @returns {void}
 */
function renderDataSummary() {
  const letters = listRecordedLetters();
  byId('data-summary').textContent = 'Saved in this browser: ' + app.data.samples.length + ' samples across '
    + letters.length + ' letters, and ' + app.data.attempts.length + ' practice attempts.';
}

/**
 * Switches to a screen, starting/stopping modes as needed.
 * @param {string} screenName - Which screen to open.
 * @returns {void}
 */
function goTo(screenName) {
  if (modes[currentScreen]) {
    modes[currentScreen].exit();
  }
  currentScreen = screenName;
  showScreen(screenName);

  if (CAMERA_SCREENS.includes(screenName)) {
    modes[screenName].enter();
    ensureCameraRunning();
  } else {
    clearCanvas(byId('overlay'));
  }
  if (screenName === 'home') {
    renderHome();
  }
  if (screenName === 'progress') {
    renderProgress(app.data.attempts, app.data.bestSpellScore);
  }
  if (screenName === 'data') {
    renderDataSummary();
  }
}

/**
 * Reads the screen name from the address bar (#learn, #spell, ...).
 * Using the address bar means the browser's Back button works, and reloading
 * keeps you on the same screen.
 * @returns {string} A valid screen name ("home" if the address is unknown).
 */
function screenFromAddress() {
  const name = window.location.hash.replace('#', '');
  const validScreens = ['home', 'progress', 'data', ...CAMERA_SCREENS];
  return validScreens.includes(name) ? name : 'home';
}

// ---------- Test & Data screen ----------

/**
 * Runs the accuracy test and shows the results.
 * @returns {void}
 */
function runAccuracyTest() {
  const results = byId('accuracy-results');
  const letters = listRecordedLetters();
  if (letters.length < 2) {
    results.replaceChildren();
    byId('data-status').textContent = 'Record samples for at least 2 letters (5 or more samples each) before running the accuracy test.';
    return;
  }
  const report = evaluateAccuracy(app.data.samples);
  if (report.total === 0) {
    byId('data-status').textContent = 'Not enough samples to test. Record at least 2 samples per letter.';
    return;
  }
  byId('data-status').textContent = '';
  renderAccuracyReport(results, report);
}

/**
 * Downloads all data as a JSON file.
 * @returns {void}
 */
function exportData() {
  const today = new Date().toISOString().slice(0, 10);
  downloadTextFile('asl-coach-data-' + today + '.json', makeExportJson(app.data));
  byId('data-status').textContent = 'Exported ' + app.data.samples.length + ' samples. Check your Downloads folder.';
}

/**
 * Loads a JSON file chosen by the user and merges it into the current data.
 * @param {Event} event - The file input's change event.
 * @returns {Promise<void>}
 */
async function importData(event) {
  const input = event.target;
  const file = input.files[0];
  // Clearing the input lets you pick the same file again later.
  input.value = '';
  if (!file) {
    return;
  }

  const text = await file.text();
  const parsed = parseImportJson(text);
  if (parsed.error) {
    byId('data-status').textContent = parsed.error;
    return;
  }
  const merged = mergeData(app.data, parsed.data);
  app.data = merged.data;
  onSamplesChanged();
  renderDataSummary();
  byId('data-status').textContent = 'Imported ' + merged.addedSamples + ' new samples and '
    + merged.addedAttempts + ' practice attempts (duplicates were skipped).';
}

// ---------- Start-up ----------

/**
 * Connects every button and link to what it should do.
 * @returns {void}
 */
function setUpEventListeners() {
  for (const button of document.querySelectorAll('[data-screen]')) {
    button.addEventListener('click', () => {
      window.location.hash = button.dataset.screen;
    });
  }
  window.addEventListener('hashchange', () => goTo(screenFromAddress()));

  byId('banner-close').addEventListener('click', hideBanner);
  byId('camera-retry').addEventListener('click', ensureCameraRunning);
  byId('accuracy-run').addEventListener('click', runAccuracyTest);
  byId('export-button').addEventListener('click', exportData);
  byId('import-file').addEventListener('change', importData);

  makeConfirmButton(byId('delete-all'), () => {
    app.data = emptyData();
    onSamplesChanged();
    renderDataSummary();
    byId('accuracy-results').replaceChildren();
    byId('data-status').textContent = 'All samples and progress were deleted.';
  });

  makeConfirmButton(byId('progress-reset'), () => {
    app.data.attempts = [];
    persist();
    renderProgress(app.data.attempts, app.data.bestSpellScore);
  });
}

/**
 * Starts the whole app.
 * @returns {void}
 */
function start() {
  // The JavaScript is running, so the "code didn't load" warning isn't needed.
  byId('load-warning').remove();

  const loaded = loadData();
  app.data = loaded.data;
  app.templates = buildAllTemplates(app.data.samples);
  if (loaded.error) {
    showBanner(loaded.error, 'error');
  }

  modes = {
    record: createRecordMode(app),
    free: createFreeMode(app),
    learn: createLearnMode(app),
    spell: createSpellMode(app),
  };

  setUpEventListeners();

  // Start loading the hand tracker right away in the background. If it
  // fails here, the camera screen will show the error when it opens.
  loadTracker().catch(() => {
    trackerPromise = null;
  });

  goTo(screenFromAddress());
  requestAnimationFrame(frameLoop);
}

start();
