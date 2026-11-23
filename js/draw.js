/**
 * draw.js
 * -------
 * Draws hand skeletons (dots for joints, lines for bones) on <canvas> elements:
 *   - the LIVE hand, on top of the webcam video
 *   - the REFERENCE hand in Learn mode, built from the letter's template
 *
 * Each finger gets its own color. The finger the hint is about is drawn
 * thick and red so the user can see exactly which one to fix.
 */

import { BONES, fingerOfLandmark } from './landmarks.js';

/** One color per finger, plus the palm. */
export const FINGER_COLORS = {
  thumb: '#f59e0b',
  index: '#22c55e',
  middle: '#38bdf8',
  ring: '#a78bfa',
  pinky: '#2dd4bf',
  palm: '#e5e7eb',
};

/** Color for the finger that needs fixing. */
export const HIGHLIGHT_COLOR = '#ff2d2d';

/**
 * Draws one skeleton from points that are already in canvas pixels.
 * @param {CanvasRenderingContext2D} context - The canvas drawing tool.
 * @param {number[][]} pixelPoints - 21 points as [x, y] in pixels.
 * @param {{highlightFinger?:string|null, lineWidth?:number, dotRadius?:number}} options
 * @returns {void}
 */
export function drawSkeleton(context, pixelPoints, options = {}) {
  const highlightFinger = options.highlightFinger ?? null;
  const lineWidth = options.lineWidth ?? 5;
  const dotRadius = options.dotRadius ?? 5;
  context.lineCap = 'round';

  // Draw the bones first, so the joint dots sit on top of them.
  for (const bone of BONES) {
    const isHighlighted = bone.finger === highlightFinger;
    context.strokeStyle = isHighlighted ? HIGHLIGHT_COLOR : FINGER_COLORS[bone.finger];
    // The red finger is drawn more than twice as thick so it really stands out.
    context.lineWidth = isHighlighted ? lineWidth * 2.2 : lineWidth;
    context.beginPath();
    context.moveTo(pixelPoints[bone.from][0], pixelPoints[bone.from][1]);
    context.lineTo(pixelPoints[bone.to][0], pixelPoints[bone.to][1]);
    context.stroke();
  }

  for (let i = 0; i < pixelPoints.length; i++) {
    const isHighlighted = highlightFinger !== null && fingerOfLandmark(i) === highlightFinger;
    context.fillStyle = isHighlighted ? HIGHLIGHT_COLOR : '#ffffff';
    context.beginPath();
    context.arc(pixelPoints[i][0], pixelPoints[i][1], isHighlighted ? dotRadius * 1.6 : dotRadius, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Makes the canvas use the same number of pixels as the video, so the
 * skeleton lines up exactly with the hand in the picture.
 * @param {HTMLCanvasElement} canvas - The overlay canvas.
 * @param {HTMLVideoElement} video - The webcam video.
 * @returns {void}
 */
export function matchCanvasToVideo(canvas, video) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

/**
 * Erases everything on a canvas.
 * @param {HTMLCanvasElement} canvas - The canvas to clear.
 * @returns {void}
 */
export function clearCanvas(canvas) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draws the live hand on the overlay canvas.
 * @param {HTMLCanvasElement} canvas - The overlay canvas (same size as the video).
 * @param {Array<{x:number, y:number}>} landmarks - MediaPipe points (0 to 1 across the picture).
 * @param {string|null} highlightFinger - The finger to draw in red, or null.
 * @returns {void}
 */
export function drawLiveHand(canvas, landmarks, highlightFinger) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  // MediaPipe's x and y go from 0 to 1 across the picture, so multiplying
  // by the canvas size converts them to pixel positions.
  const pixelPoints = [];
  for (const landmark of landmarks) {
    pixelPoints.push([landmark.x * canvas.width, landmark.y * canvas.height]);
  }

  // Scale line thickness with the picture size so it looks the same on any camera.
  const thickness = Math.max(3, canvas.width / 160);
  drawSkeleton(context, pixelPoints, { highlightFinger, lineWidth: thickness, dotRadius: thickness });
}

/**
 * Draws a template hand (normalized points) centered and sized to fit the canvas.
 * @param {HTMLCanvasElement} canvas - The reference canvas.
 * @param {number[][]|null} points - 21 normalized points [x, y, z], or null to clear.
 * @param {{highlightFinger?:string|null, flipX?:boolean}} options
 *   flipX = mirror the drawing, used so the reference matches the hand the user is using.
 * @returns {void}
 */
export function drawReferenceHand(canvas, points, options = {}) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) {
    return;
  }

  // We only draw x and y (a flat picture), so z is dropped here.
  const flipSign = options.flipX ? -1 : 1;
  const flatPoints = [];
  for (const point of points) {
    flatPoints.push([point[0] * flipSign, point[1]]);
  }

  // Find the smallest box that holds the whole hand...
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of flatPoints) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // ...then zoom so the box fills the canvas (minus some padding),
  // and slide it so the box sits in the center.
  const padding = 24;
  const boxWidth = Math.max(maxX - minX, 0.001);
  const boxHeight = Math.max(maxY - minY, 0.001);
  const zoom = Math.min((canvas.width - 2 * padding) / boxWidth, (canvas.height - 2 * padding) / boxHeight);
  const offsetX = (canvas.width - boxWidth * zoom) / 2;
  const offsetY = (canvas.height - boxHeight * zoom) / 2;

  const pixelPoints = [];
  for (const [x, y] of flatPoints) {
    pixelPoints.push([offsetX + (x - minX) * zoom, offsetY + (y - minY) * zoom]);
  }

  drawSkeleton(context, pixelPoints, {
    highlightFinger: options.highlightFinger ?? null,
    lineWidth: 6,
    dotRadius: 5,
  });
}
