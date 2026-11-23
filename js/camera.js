/**
 * camera.js
 * ---------
 * Everything about "seeing" the hand:
 *   1. Turning on the laptop webcam (with friendly messages if it fails).
 *   2. Loading MediaPipe's Hand Landmarker from our own /vendor and /models
 *      folders (so it works with no internet).
 *   3. Asking MediaPipe for the 21 hand points in the current video frame.
 */

import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

// new URL(..., import.meta.url) builds a full address relative to THIS file,
// so the paths work no matter which folder the server was started in.
const WASM_FOLDER_URL = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_URL = new URL('../models/hand_landmarker.task', import.meta.url).href;

/**
 * Turns a technical camera error into a message a person can act on.
 * @param {Error} error - The error from getUserMedia (or our own check).
 * @returns {string} A friendly explanation of what went wrong and how to fix it.
 */
export function friendlyCameraError(error) {
  const name = error && error.name ? error.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied. Click the camera icon at the right end of the address bar, choose "Allow", then press "Try the camera again".';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found. Plug in a webcam (or open the laptop lid), then press "Try the camera again".';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy. Close other apps that might be using it (Zoom, Teams, FaceTime, another browser tab), then press "Try the camera again".';
  }
  if (name === 'InsecureContext') {
    return error.message;
  }
  return 'The camera could not start (' + (error && error.message ? error.message : 'unknown error') + '). Try reloading the page.';
}

/**
 * Starts the webcam and shows it in a <video> element.
 * @param {HTMLVideoElement} video - Where to show the camera picture.
 * @returns {Promise<MediaStream>} The camera stream once the video is playing.
 */
export async function startCamera(video) {
  // Browsers only allow the camera on "secure" pages: https:// or localhost.
  // If someone double-clicks index.html (a file:// address), there is no camera API.
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const error = new Error('The camera only works when the app is opened at http://localhost:8000. Start the server (see README.md) and open that address in Chrome, instead of double-clicking index.html.');
    error.name = 'InsecureContext';
    throw error;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      // 640x480 is plenty for hand tracking and keeps things fast.
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  });

  video.srcObject = stream;
  await video.play();
  return stream;
}

/**
 * Loads MediaPipe's Hand Landmarker. Tries the graphics card (GPU) first
 * because it's faster, and falls back to the regular processor (CPU).
 * @returns {Promise<HandLandmarker>} The ready-to-use hand tracker.
 */
export async function createHandTracker() {
  // The "fileset" tells MediaPipe where its WebAssembly engine files live.
  const vision = await FilesetResolver.forVisionTasks(WASM_FOLDER_URL);

  try {
    return await HandLandmarker.createFromOptions(vision, makeTrackerOptions('GPU'));
  } catch (gpuError) {
    console.warn('GPU hand tracking was not available, using CPU instead.', gpuError);
    return await HandLandmarker.createFromOptions(vision, makeTrackerOptions('CPU'));
  }
}

/**
 * Builds the settings object for the Hand Landmarker.
 * @param {'GPU'|'CPU'} delegate - Which chip should run the model.
 * @returns {Object} Options for HandLandmarker.createFromOptions.
 */
function makeTrackerOptions(delegate) {
  return {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: delegate,
    },
    // VIDEO mode remembers the previous frame, which makes tracking
    // smoother and faster than treating every frame as a new photo.
    runningMode: 'VIDEO',
    // Fingerspelling uses one hand, so we only look for one.
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
}

/**
 * Finds the hand in the current video frame.
 * @param {HandLandmarker} tracker - From createHandTracker.
 * @param {HTMLVideoElement} video - The playing webcam video.
 * @param {number} nowMs - A timestamp that goes up every call (performance.now()).
 * @returns {{landmarks:Array<{x:number,y:number,z:number}>, handedness:string, score:number}|null}
 *   The 21 points plus "Left"/"Right", or null if no hand is visible.
 */
export function detectHand(tracker, video, nowMs) {
  const result = tracker.detectForVideo(video, nowMs);
  if (!result.landmarks || result.landmarks.length === 0) {
    return null;
  }

  // handedness[0] is a list of guesses for hand #0; the first is the best one.
  const bestGuess = result.handedness[0][0];
  return {
    landmarks: result.landmarks[0],
    handedness: bestGuess.categoryName,
    score: bestGuess.score,
  };
}
