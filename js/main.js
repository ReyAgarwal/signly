/**
 * main.js
 * -------
 * The starting point of the app. It:
 *   1. Loads the reference hands (real signers, data/reference-hands.json)
 *      plus anything saved in this browser, and builds the k-NN "pool".
 *   2. Sets up navigation between screens.
 *   3. Starts the webcam and hand tracker when a camera screen opens.
 *   4. Runs the "frame loop": for every new video frame, find the hand,
 *      normalize it, hand it to the active mode, and draw the skeleton.
 *   5. Wires up the Alphabet, Progress, and Test & Data screens.
 *   6. Sends keyboard shortcuts (keyboard.js) to the right place.
 *
 * Where the coach's knowledge comes from (the "pool" k-NN searches):
 *   - reference: ~6,000 hands of real signers from public datasets (always)
 *   - teacher:   samples added on the Add Samples screen (optional)
 *   - learned:   your own correct signs, saved only when the real signers
 *                strongly agree (see learning.js), if "keep learning" is on
 *
 * The "app" object below is shared with every mode. It holds the data and
 * small helper functions, so modes don't each need to know about storage.
 */

import { startCamera, stopCamera, stopStream, createHandTracker, detectHand, friendlyCameraError } from './camera.js';
import { normalizeHand, pointsToFeatures, featuresToPoints, shouldMirror } from './landmarks.js';
import { classify, evaluateUnseenPeople } from './classifier.js';
import { allFingerBends, buildAllTemplates } from './hints.js';
import { handFeatures } from './features.js';
import { loadReferenceHands } from './reference.js';
import { shouldLearn, addLearnedSample, countBySource } from './learning.js';
import { STATIC_LETTERS } from './letters.js';
import { addAttempt, makeAttempt } from './progress.js';
import {
  loadData, saveData, emptyData, makeExportJson, parseImportJson, mergeData, loadSettings, saveSettings, makeSampleId,
} from './storage.js';
import {
  byId, showScreen, showBanner, hideBanner, setCameraStatus, renderProgress, renderAlphabetChart,
  renderAccuracyReport, makeConfirmButton, downloadTextFile, renderHeroArt, CAMERA_SCREENS,
} from './ui.js';
import { shortcutFor } from './keyboard.js';
import { drawLiveHand, clearCanvas, matchCanvasToVideo } from './draw.js';
import { createRecordMode } from './modes/recordMode.js';
import { createFreeMode } from './modes/freeMode.js';
import { createLearnMode } from './modes/learnMode.js';
import { createSpellMode } from './modes/spellMode.js';
import { createChallengeMode } from './modes/challengeMode.js';

/** A guess counts only if at least 60% of the k neighbors agree (3 of 5). */
const MIN_CONFIDENCE = 0.6;

/** Show the "no hand detected" message after this long without a hand. */
const NO_HAND_MESSAGE_DELAY_MS = 1200;

/** The accuracy test checks this many signs per letter per person (keeps it to a few seconds). */
const TEST_SIGNS_PER_LETTER_PER_PERSON = 10;

const NO_HAND_MESSAGE = 'No hand detected. Hold one hand up inside the video, about an arm\'s length from the camera, in good light.';

// ---------- Shared app object (given to every mode) ----------

const app = {
  data: emptyData(),
  reference: [],
  referenceSources: [],
  referencePool: [],
  pool: [],
  trustedPool: [],
  templates: {},
  settings: loadSettings(),
  minConfidence: MIN_CONFIDENCE,
  // Remembers whether the last hand seen was mirrored, so Learn mode can
  // draw the reference hand the same way around as the user's hand.
  handMirrored: false,
  isTrackerReady: () => cameraState === 'ready',
  sampleCounts: countKnownSamplesPerLetter,
  addedCounts: countAddedSamplesPerLetter,
  knownLetters: listKnownLetters,
  addSamples: addTeacherSamples,
  deleteSamplesFor: deleteTeacherSamplesFor,
  recordAttempt: recordAttempt,
  learnFrom: learnFrom,
  setBestScore: setBestScore,
  recognize: recognize,
  masteredLetters: listMasteredLetters,
  setSetting: setSetting,
  openRecord: (letter) => openModeWithLetter('record', letter),
};

// ---------- Camera and tracker state ----------

let cameraState = 'off'; // 'off', 'starting', 'ready', or 'error'
// Goes up every time the camera is started or turned off. A start that
// finishes after the user already left can tell it's out of date.
let cameraRequest = 0;
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
 * Turns a stored sample (63 normalized numbers) into a k-NN pool entry
 * (the richer 86-number feature vector from features.js).
 * @param {{letter:string, features:number[], source?:string, group?:string}} sample - A stored sample.
 * @returns {{letter:string, features:number[], source:string, group:string}} The pool entry.
 */
function toPoolEntry(sample) {
  return {
    letter: sample.letter,
    features: handFeatures(featuresToPoints(sample.features)),
    source: sample.source ?? 'teacher',
    group: sample.group ?? 'added',
  };
}

/**
 * Rebuilds the TRUSTED knowledge: real signers + teacher-added samples.
 * This makes the letter templates (for finger hints and the reference
 * skeleton) and the trusted k-NN pool. The ~6,000 reference entries are
 * computed once and reused, because that's the slow part.
 * @returns {void}
 */
function rebuildTrusted() {
  if (app.referencePool.length !== app.reference.length) {
    app.referencePool = app.reference.map(toPoolEntry);
  }
  const teacherSamples = app.data.samples.filter((s) => s.source !== 'learned');
  // Templates come only from TRUSTED samples, never from what was learned from you.
  app.templates = buildAllTemplates([...app.reference, ...teacherSamples]);
  app.trustedPool = [...app.referencePool, ...teacherSamples.map(toPoolEntry)];
}

/**
 * Rebuilds the full k-NN pool: trusted samples plus (if "keep learning"
 * is on) the samples learned from this user. This part is fast.
 * @returns {void}
 */
function rebuildPool() {
  let learnedEntries = [];
  if (app.settings.keepLearning) {
    learnedEntries = app.data.samples.filter((s) => s.source === 'learned').map(toPoolEntry);
  }
  app.pool = [...app.trustedPool, ...learnedEntries];
}

/**
 * Rebuilds everything that depends on the samples.
 * @returns {void}
 */
function rebuildKnowledge() {
  rebuildTrusted();
  rebuildPool();
}

/**
 * Rebuilds the coach's knowledge after samples change, then saves.
 * @returns {void}
 */
function onSamplesChanged() {
  rebuildKnowledge();
  persist();
}

/**
 * Counts trusted samples (real signers + teacher-added) for each letter.
 * @returns {Object<string, number>} letter -> number of samples.
 */
function countKnownSamplesPerLetter() {
  const counts = {};
  for (const sample of app.trustedPool) {
    counts[sample.letter] = (counts[sample.letter] ?? 0) + 1;
  }
  return counts;
}

/**
 * Counts samples added on the Add Samples screen, for each letter.
 * @returns {Object<string, number>} letter -> number of added samples.
 */
function countAddedSamplesPerLetter() {
  const counts = {};
  for (const sample of app.data.samples) {
    if (sample.source !== 'learned') {
      counts[sample.letter] = (counts[sample.letter] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Lists the letters the coach can recognize, in alphabet order.
 * @returns {string[]} The letters.
 */
function listKnownLetters() {
  const counts = countKnownSamplesPerLetter();
  return STATIC_LETTERS.filter((letter) => counts[letter] > 0);
}

/**
 * Lists letters the user has signed correctly at least once (shown with a check mark).
 * @returns {Set<string>} The letters.
 */
function listMasteredLetters() {
  const letters = new Set();
  for (const attempt of app.data.attempts) {
    if (attempt.correct) {
      letters.add(attempt.letter);
    }
  }
  return letters;
}

/**
 * Changes one setting and saves it.
 * @param {string} name - e.g. "autoAdvance".
 * @param {boolean} value - The new value.
 * @returns {void}
 */
function setSetting(name, value) {
  app.settings[name] = value;
  saveSettings(app.settings);
  if (name === 'keepLearning') {
    rebuildPool();
  }
}

/**
 * Opens Add Samples or Learn with a letter already chosen.
 * @param {'record'|'learn'} screenName - Which screen.
 * @param {string} letter - The letter to select.
 * @returns {void}
 */
function openModeWithLetter(screenName, letter) {
  modes[screenName].selectLetter(letter);
  if (currentScreen === screenName) {
    goTo(screenName);
  } else {
    window.location.hash = screenName;
  }
}

/**
 * Adds samples recorded on the Add Samples screen (by a teacher / fluent signer).
 * @param {Array<Object>} newSamples - Samples from the Add Samples screen.
 * @returns {void}
 */
function addTeacherSamples(newSamples) {
  for (const sample of newSamples) {
    app.data.samples.push({ ...sample, source: 'teacher' });
  }
  onSamplesChanged();
}

/**
 * Deletes the teacher-added samples of one letter (real-signer data is never deleted).
 * @param {string} letter - The letter.
 * @returns {void}
 */
function deleteTeacherSamplesFor(letter) {
  app.data.samples = app.data.samples.filter((s) => s.letter !== letter || s.source === 'learned');
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
 * "Keep learning": after a correct sign, maybe save it so the coach gets
 * used to this user's hand. Only happens if the real signers strongly agree.
 * @param {Object} hand - The processed hand at the moment of the correct sign.
 * @param {string} targetLetter - The letter the user was asked for.
 * @param {string} lockedLetter - The letter the coach locked in.
 * @returns {boolean} True if the sign was learned.
 */
function learnFrom(hand, targetLetter, lockedLetter) {
  if (!app.settings.keepLearning || !hand) {
    return false;
  }
  // Ask ONLY the trusted samples (no previously learned ones), so the coach
  // can't talk itself into something the real signers disagree with.
  const trustedGuess = classify(hand.vector, app.trustedPool);
  if (!shouldLearn(targetLetter, lockedLetter, trustedGuess)) {
    return false;
  }
  const now = Date.now();
  const sample = { id: makeSampleId(now), letter: targetLetter, features: hand.features, hand: hand.handedness, time: now, source: 'learned' };
  app.data.samples = addLearnedSample(app.data.samples, sample);
  // Learned samples never change the trusted templates, so only the quick pool rebuild is needed.
  rebuildPool();
  persist();
  return true;
}

/**
 * Saves a new best Challenge score for one difficulty.
 * @param {string} difficulty - "easy", "medium", or "hard".
 * @param {number} score - The new best score.
 * @returns {void}
 */
function setBestScore(difficulty, score) {
  app.data.bestScores[difficulty] = score;
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
  const guess = classify(hand.vector, app.pool);

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
 * @returns {Object} The processed hand: landmarks, points, features, vector, bends, etc.
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
    vector: handFeatures(points),
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
 * Checks whether the camera should be on right now: a camera screen is
 * open AND this browser tab is the one being looked at.
 * @returns {boolean} True if the camera is needed.
 */
function cameraIsNeeded() {
  return CAMERA_SCREENS.includes(currentScreen) && !document.hidden;
}

/**
 * Turns the webcam off (the camera light goes out) when no camera screen
 * is open. The hand tracker stays loaded, so turning back on is quick.
 * @returns {void}
 */
function turnCameraOff() {
  if (cameraState === 'off' || cameraState === 'error') {
    return;
  }
  cameraRequest += 1;
  stopCamera(byId('video'));
  cameraState = 'off';
  lastVideoTime = -1;
  noHandMessageShowing = false;
  setCameraStatus('');
  clearCanvas(byId('overlay'));
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
  cameraRequest += 1;
  const request = cameraRequest;
  byId('camera-retry').hidden = true;
  setCameraStatus('Starting the camera... If Chrome asks for permission, click "Allow".');

  let stream = null;
  try {
    stream = await startCamera(byId('video'));
  } catch (error) {
    if (request === cameraRequest) {
      cameraState = 'error';
      setCameraStatus(friendlyCameraError(error), true);
      byId('camera-retry').hidden = false;
    }
    return;
  }
  // The user may have left the camera screen while the camera was starting.
  if (request !== cameraRequest || !cameraIsNeeded()) {
    stopUnneededStream(stream, request);
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
  // ...or while the hand tracker was loading.
  if (request !== cameraRequest || !cameraIsNeeded()) {
    stopUnneededStream(stream, request);
    return;
  }

  cameraState = 'ready';
  lastHandSeenMs = performance.now();
  setCameraStatus('');
}

/**
 * Stops a camera stream that finished starting after the user had already left.
 * @param {MediaStream} stream - The stream that's no longer needed.
 * @param {number} request - Which camera start it came from.
 * @returns {void}
 */
function stopUnneededStream(stream, request) {
  stopStream(stream);
  const video = byId('video');
  if (video.srcObject === stream) {
    video.srcObject = null;
  }
  // Only change the state if no newer camera start has begun since.
  if (request === cameraRequest) {
    cameraState = 'off';
    setCameraStatus('');
  }
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

  if (cameraState !== 'ready' || !CAMERA_SCREENS.includes(currentScreen)) {
    return;
  }
  const video = byId('video');
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
  renderHeroArt(byId('hero-art'));
  const status = byId('home-status');
  if (app.reference.length === 0) {
    status.textContent = 'The real-signer reference did not load, so the coach only knows samples added on the Add Samples screen.';
    return;
  }
  const { learned } = countBySource(app.data.samples);
  let text = '✓ Ready: compares you with ' + app.reference.length.toLocaleString() + ' hands of real signers';
  if (learned > 0) {
    text += ', plus ' + learned + ' of your own correct signs';
  }
  status.textContent = text;
}

/**
 * Draws the Alphabet chart (all 24 diagrams).
 * @returns {void}
 */
function renderAlphabet() {
  byId('alphabet-flip').checked = app.settings.flipDiagrams;
  renderAlphabetChart(byId('alphabet-grid'), {
    mastered: listMasteredLetters(),
    flipX: app.settings.flipDiagrams,
    onPick: (letter) => openModeWithLetter('learn', letter),
  });
}

/**
 * Updates the "what the coach knows" summary on the Test & Data screen.
 * @returns {void}
 */
function renderDataSummary() {
  const { teacher, learned } = countBySource(app.data.samples);
  byId('knowledge-reference').textContent = app.reference.length.toLocaleString();
  byId('knowledge-teacher').textContent = String(teacher);
  byId('knowledge-learned').textContent = String(learned);
  byId('keep-learning').checked = app.settings.keepLearning;
  byId('data-summary').textContent = 'Saved in this browser: ' + teacher + ' added samples, ' + learned
    + ' learned samples, and ' + app.data.attempts.length + ' practice attempts.';
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
    // No camera screen is open, so switch the webcam off (and its light).
    turnCameraOff();
  }
  if (screenName === 'home') {
    renderHome();
  }
  if (screenName === 'alphabet') {
    renderAlphabet();
  }
  if (screenName === 'progress') {
    renderProgress(app.data.attempts, app.data.bestScores);
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
  const validScreens = ['home', 'alphabet', 'progress', 'data', ...CAMERA_SCREENS];
  return validScreens.includes(name) ? name : 'home';
}

// ---------- Test & Data screen ----------

/**
 * Runs the "people it has never seen" accuracy test and shows the results.
 * @returns {void}
 */
function runAccuracyTest() {
  const results = byId('accuracy-results');
  const status = byId('accuracy-status');
  if (app.trustedPool.length === 0) {
    status.textContent = 'There is nothing to test: the reference data did not load.';
    return;
  }
  status.textContent = 'Testing... this takes a few seconds.';
  results.replaceChildren();
  // setTimeout lets the browser show "Testing..." before the long calculation starts.
  setTimeout(() => {
    const started = performance.now();
    const report = evaluateUnseenPeople(app.trustedPool, { testPerLetterPerGroup: TEST_SIGNS_PER_LETTER_PER_PERSON });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    status.textContent = 'Done in ' + seconds + ' seconds.';
    renderAccuracyReport(results, report);
  }, 50);
}

/**
 * Downloads all data saved in this browser as a JSON file.
 * @returns {void}
 */
function exportData() {
  const today = new Date().toISOString().slice(0, 10);
  downloadTextFile('asl-coach-data-' + today + '.json', makeExportJson(app.data));
  byId('data-status').textContent = 'Exported ' + app.data.samples.length + ' samples and your progress. Check your Downloads folder.';
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

// ---------- Keyboard ----------

/**
 * Handles every key press: works out the shortcut, then does it.
 * @param {KeyboardEvent} event - The key press.
 * @returns {void}
 */
function onKeyDown(event) {
  const action = shortcutFor(event, currentScreen);
  if (!action) {
    return;
  }
  // Stop the browser's own behavior (for example, Space scrolling the page).
  event.preventDefault();

  if (action.startsWith('go:')) {
    window.location.hash = action.slice(3);
    return;
  }
  if (currentScreen === 'alphabet' && action.startsWith('pick:')) {
    openModeWithLetter('learn', action.slice(5));
    return;
  }
  if (modes[currentScreen]) {
    modes[currentScreen].handleShortcut(action);
  }
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
  // Switching to another browser tab turns the camera off; coming back turns it on again.
  document.addEventListener('visibilitychange', () => {
    if (cameraIsNeeded()) {
      ensureCameraRunning();
    } else {
      turnCameraOff();
    }
  });

  document.addEventListener('keydown', onKeyDown);
  byId('banner-close').addEventListener('click', hideBanner);
  byId('alphabet-print').addEventListener('click', () => window.print());
  byId('alphabet-flip').addEventListener('change', () => {
    setSetting('flipDiagrams', byId('alphabet-flip').checked);
    renderAlphabet();
  });
  byId('camera-retry').addEventListener('click', ensureCameraRunning);
  byId('accuracy-run').addEventListener('click', runAccuracyTest);
  byId('export-button').addEventListener('click', exportData);
  byId('import-file').addEventListener('change', importData);
  byId('keep-learning').addEventListener('change', () => {
    setSetting('keepLearning', byId('keep-learning').checked);
    renderDataSummary();
  });

  makeConfirmButton(byId('forget-learned'), () => {
    const before = app.data.samples.length;
    app.data.samples = app.data.samples.filter((s) => s.source !== 'learned');
    onSamplesChanged();
    renderDataSummary();
    byId('data-status').textContent = 'Forgot ' + (before - app.data.samples.length) + ' learned samples. The real-signer reference is unchanged.';
  });

  makeConfirmButton(byId('delete-all'), () => {
    app.data = emptyData();
    onSamplesChanged();
    renderDataSummary();
    byId('accuracy-results').replaceChildren();
    byId('data-status').textContent = 'All added samples, learned samples, and progress were deleted. The real-signer reference is unchanged.';
  });

  makeConfirmButton(byId('progress-reset'), () => {
    app.data.attempts = [];
    persist();
    renderProgress(app.data.attempts, app.data.bestScores);
  });
}

/**
 * Loads the real-signer reference data. If it fails, the app still runs
 * with any samples added in this browser, and shows a warning.
 * @returns {Promise<void>}
 */
async function loadReference() {
  try {
    const reference = await loadReferenceHands();
    app.reference = reference.samples;
    app.referenceSources = reference.sources;
  } catch (error) {
    console.error(error);
    showBanner('The real-signer reference (data/reference-hands.json) could not load. Make sure the "data" folder is next to index.html, then reload.', 'error');
  }
}

/**
 * Starts the whole app.
 * @returns {Promise<void>}
 */
async function start() {
  // The JavaScript is running, so the "code didn't load" warning isn't needed.
  byId('load-warning').remove();
  byId('home-status').textContent = 'Loading the real-signer reference...';

  const loaded = loadData();
  app.data = loaded.data;
  if (loaded.error) {
    showBanner(loaded.error, 'error');
  }
  await loadReference();
  rebuildKnowledge();

  modes = {
    learn: createLearnMode(app),
    spell: createSpellMode(app),
    challenge: createChallengeMode(app),
    free: createFreeMode(app),
    record: createRecordMode(app),
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
