/**
 * diagram.js
 * ----------
 * Draws a handshape diagram for a letter as an SVG picture.
 *
 * Steps:
 *   1. handModel.js builds the 3D hand for the letter's recipe (handPoses.js).
 *   2. We flatten it to 2D by dropping z (z only decides what's in front).
 *   3. Every bone becomes a thick rounded line ("capsule") with a dark outline.
 *      The palm is a rounded shape. Parts farther away are drawn first, so
 *      closer parts cover them, like layers of paper ("painter's algorithm").
 *   4. Each finger gets the same color as in the live skeleton, so you can
 *      match them up. The finger a hint is about turns red.
 *
 * buildDiagramShapes() is pure math (unit tested); renderHandDiagram() makes the SVG.
 */

import { buildHand } from './handModel.js';
import { LETTER_POSES, MOTION_POSES, KEY_POSE } from './handPoses.js';

/** Colors: light versions of the skeleton's finger colors, so they're easy to match. */
export const DIAGRAM_COLORS = {
  outline: '#1f2937',
  palm: '#f1f5f9',
  forearm: '#e2e8f0',
  thumb: '#fde68a',
  index: '#bbf7d0',
  middle: '#bae6fd',
  ring: '#ddd6fe',
  pinky: '#99f6e4',
  nail: '#ffffff',
  highlightFill: '#fca5a5',
  highlightOutline: '#b91c1c',
  motion: '#4f46e5',
  label: '#1f2937',
};

/** Finger names for the color key, in landmark order (thumb tip = 4, index tip = 8, ...). */
const KEY_LABELS = [
  { finger: 'thumb', name: 'Thumb', tip: 4, side: 'outside' },
  { finger: 'index', name: 'Index', tip: 8, distance: 1.1 },
  { finger: 'middle', name: 'Middle', tip: 12, distance: 2.6 },
  { finger: 'ring', name: 'Ring', tip: 16, distance: 1.1 },
  { finger: 'pinky', name: 'Pinky', tip: 20, side: 'outside' },
];

/** How thick each bone is drawn (thumb bones first; the thumb's first bone is the fleshy base). */
const BONE_WIDTHS = {
  thumb: [1.35, 1.02, 0.94],
  index: [0.95, 0.88, 0.8],
  middle: [0.98, 0.9, 0.82],
  ring: [0.92, 0.85, 0.78],
  pinky: [0.8, 0.74, 0.68],
};

/** First landmark number of each finger (MediaPipe numbering). */
const FIRST_LANDMARK = { thumb: 1, index: 5, middle: 9, ring: 13, pinky: 17 };

/** Thickness of the dark outline around every shape. */
const OUTLINE_WIDTH = 0.15;

/** Farthest-away parts are mixed this much with gray, so depth is easier to see. */
const MAX_DEPTH_SHADE = 0.22;

/** The gray used for depth shading. */
const SHADE_COLOR = '#64748b';

/** The smallest picture size, so a fist isn't drawn giant next to an open hand. */
const MIN_VIEW_SIZE = 9.6;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Flattens a 3D point to 2D drawing coordinates.
 * @param {number[]} point - [x, y, z] from the hand model (y points up).
 * @param {boolean} flipX - True to mirror left-right.
 * @returns {number[]} [x, y] for SVG (where y points DOWN, so we flip y).
 */
function project(point, flipX) {
  const x = flipX ? -point[0] : point[0];
  return [x, -point[1]];
}

/**
 * Averages the z (depth) of some points. Bigger z = closer to the viewer.
 * @param {number[][]} points - 3D points.
 * @returns {number} The average depth.
 */
function averageDepth(points) {
  let total = 0;
  for (const point of points) {
    total += point[2];
  }
  return total / points.length;
}

/**
 * Picks the depth (drawing order) for a thumb bone.
 * @param {number[][]} bonePoints - The bone's two 3D end points.
 * @param {string|string[]|undefined} layer - 'front', 'behind', undefined (use real depth),
 *   or a list with one of those for each of the 3 thumb bones.
 * @param {number} palmDepth - The palm's depth.
 * @param {number} boneNumber - 0, 1, or 2 (keeps the thumb's own bones in order).
 * @returns {number} The depth to sort by.
 */
function thumbDepth(bonePoints, layer, palmDepth, boneNumber) {
  // Some letters (S, M, N, T, E) need the thumb clearly in front of or tucked
  // behind the fingers. Real depth alone can get this wrong by a hair, so the
  // recipe can force it, even bone by bone (M: tucked under, but the tip peeks out).
  let boneLayer = layer;
  if (Array.isArray(layer)) {
    boneLayer = layer[boneNumber];
  }
  if (boneLayer === 'front') {
    return 100 + boneNumber;
  }
  if (boneLayer === 'behind') {
    return palmDepth + 0.01 + boneNumber * 0.001;
  }
  return averageDepth(bonePoints);
}

/**
 * Makes a fingernail shape on a fingertip, if the nail faces the viewer.
 * @param {number[]} start - 2D start of the last finger bone.
 * @param {number[]} end - 2D fingertip.
 * @param {number} realLength - The bone's true 3D length.
 * @param {number} width - The bone's drawn width.
 * @param {number[]} nailFacing - 3D direction the nail faces.
 * @param {number} depth - The bone's depth (the nail sits just on top).
 * @returns {Object|null} A nail shape, or null if the nail isn't visible.
 */
function makeNail(start, end, realLength, width, nailFacing, depth) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const drawnLength = Math.sqrt(dx * dx + dy * dy);
  // Only draw a nail if it faces us AND the fingertip isn't pointing straight at us.
  if (nailFacing[2] < 0.3 || drawnLength < realLength * 0.45) {
    return null;
  }
  return {
    type: 'nail',
    center: [start[0] + dx * 0.62, start[1] + dy * 0.62],
    angleDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
    radiusAlong: drawnLength * 0.3,
    radiusAcross: width * 0.3,
    depth: depth + 0.0001,
  };
}

/**
 * Turns a posed 3D hand into a list of flat shapes, sorted back-to-front.
 * @param {Object} hand - From buildHand() in handModel.js.
 * @param {{flipX?:boolean, highlightFinger?:string|null, thumbLayer?:string, showForearm?:boolean,
 *   motion?:Object}} options
 *   motion = for J and Z: the movement path to draw as a dashed arrow (see handPoses.js).
 * @returns {{shapes:Array<Object>, viewBox:number[]}} Shapes to draw and the picture frame.
 */
export function buildDiagramShapes(hand, options = {}) {
  const flipX = options.flipX ?? false;
  const highlight = options.highlightFinger ?? null;
  const points = hand.landmarks;
  const shapes = [];

  // Depth shading: find the nearest and farthest points, so each bone can be
  // shaded by how far back it is (0 = nearest, 1 = farthest).
  let nearest = -Infinity;
  let farthest = Infinity;
  for (const point of points) {
    nearest = Math.max(nearest, point[2]);
    farthest = Math.min(farthest, point[2]);
  }
  const depthRange = Math.max(nearest - farthest, 0.001);

  // The palm: wrist corners, thumb base, and the four knuckles.
  const palmCorners = [hand.wristThumbSide, points[1], points[5], points[9], points[13], points[17], hand.wristPinkySide];
  const palmDepth = averageDepth(palmCorners) - 0.05;
  shapes.push({ type: 'palm', points: palmCorners.map((p) => project(p, flipX)), depth: palmDepth });

  // The forearm is always drawn first (behind everything), unless the recipe hides it.
  if (options.showForearm !== false) {
    shapes.push({
      type: 'bone', finger: 'forearm', from: project(points[0], flipX), to: project(hand.forearmEnd, flipX),
      width: 2.3, depth: -Infinity,
    });
  }

  for (const finger of Object.keys(FIRST_LANDMARK)) {
    const first = FIRST_LANDMARK[finger];
    for (let bone = 0; bone < 3; bone++) {
      const start3d = points[first + bone];
      const end3d = points[first + bone + 1];
      let depth = averageDepth([start3d, end3d]);
      if (finger === 'thumb') {
        depth = thumbDepth([start3d, end3d], options.thumbLayer, palmDepth, bone);
      }
      const shape = {
        type: 'bone', finger, from: project(start3d, flipX), to: project(end3d, flipX),
        width: BONE_WIDTHS[finger][bone], depth, highlighted: finger === highlight,
        shade: ((nearest - averageDepth([start3d, end3d])) / depthRange) * MAX_DEPTH_SHADE,
      };
      shapes.push(shape);

      if (bone === 2 && finger !== 'thumb') {
        const realLength = Math.sqrt((end3d[0] - start3d[0]) ** 2 + (end3d[1] - start3d[1]) ** 2 + (end3d[2] - start3d[2]) ** 2);
        const nail = makeNail(shape.from, shape.to, realLength, shape.width, hand.nailFacing[finger], depth);
        if (nail) {
          shapes.push(nail);
        }
      }
    }
  }

  // Painter's algorithm: draw the farthest shapes first.
  shapes.sort((first, second) => first.depth - second.depth);

  const framePoints = points.map((p) => project(p, flipX));
  if (options.motion) {
    // The movement arrow goes on top of everything (so it's added last).
    const motionShape = makeMotionShape(points, options.motion, flipX);
    shapes.push(motionShape);
    framePoints.push(...motionShape.points);
  }
  return { shapes, viewBox: computeViewBox(framePoints) };
}

/**
 * Works out where the J or Z movement arrow goes in the picture.
 * @param {number[][]} points - The hand's 3D points.
 * @param {{from:number, offset:number[], path:number[][]}} motion - From handPoses.js.
 * @param {boolean} flipX - True if the picture is mirrored.
 * @returns {{type:string, points:number[][], depth:number}} The arrow shape.
 */
function makeMotionShape(points, motion, flipX) {
  const start = project(points[motion.from], flipX);
  const sign = flipX ? -1 : 1;
  const arrowPoints = [];
  for (const [dx, dy] of motion.path) {
    arrowPoints.push([start[0] + (motion.offset[0] + dx) * sign, start[1] + motion.offset[1] + dy]);
  }
  return { type: 'motion', points: arrowPoints, curve: motion.curve === true, depth: Infinity };
}

/**
 * Finds a square picture frame that fits the hand, with some margin.
 * @param {number[][]} flatPoints - 2D points of the hand.
 * @returns {number[]} [left, top, width, height] for the SVG viewBox.
 */
function computeViewBox(flatPoints, minSize = MIN_VIEW_SIZE) {
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
  const margin = 1.1;
  const size = Math.max(minSize, maxX - minX + 2 * margin, maxY - minY + 2 * margin);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return [centerX - size / 2, centerY - size / 2, size, size];
}

// ---------- Making the SVG (browser only) ----------

/**
 * Creates an SVG element with attributes.
 * @param {string} tag - e.g. "line".
 * @param {Object<string, string|number>} attributes - Attribute names and values.
 * @returns {SVGElement} The element.
 */
function svgElement(tag, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const name of Object.keys(attributes)) {
    element.setAttribute(name, String(attributes[name]));
  }
  return element;
}

/**
 * Mixes two colors, like mixing paint.
 * @param {string} first - A color like "#bbf7d0".
 * @param {string} second - Another color like "#64748b".
 * @param {number} amount - 0 = all first color, 1 = all second color.
 * @returns {string} The mixed color as "rgb(r, g, b)".
 */
export function mixColors(first, second, amount) {
  const parts = [];
  for (let i = 1; i <= 5; i += 2) {
    // Each pair of hex digits is one channel (red, green, blue), 0 to 255.
    const a = parseInt(first.slice(i, i + 2), 16);
    const b = parseInt(second.slice(i, i + 2), 16);
    parts.push(Math.round(a + (b - a) * amount));
  }
  return 'rgb(' + parts.join(', ') + ')';
}

/**
 * Draws one bone as a rounded line with an outline.
 * @param {SVGElement} svg - Where to draw.
 * @param {Object} shape - A 'bone' shape.
 * @returns {void}
 */
function drawBone(svg, shape) {
  let fill = mixColors(DIAGRAM_COLORS[shape.finger], SHADE_COLOR, shape.shade ?? 0);
  let outline = DIAGRAM_COLORS.outline;
  if (shape.highlighted) {
    fill = DIAGRAM_COLORS.highlightFill;
    outline = DIAGRAM_COLORS.highlightOutline;
  }
  // A line of zero length wouldn't show its round ends, so nudge it a tiny bit.
  const to = [...shape.to];
  if (Math.abs(to[0] - shape.from[0]) + Math.abs(to[1] - shape.from[1]) < 0.01) {
    to[1] += 0.01;
  }
  const line = { x1: shape.from[0], y1: shape.from[1], x2: to[0], y2: to[1], 'stroke-linecap': 'round' };
  // Draw a slightly wider dark line first, then the colored line on top: that leaves a dark outline.
  svg.append(svgElement('line', { ...line, stroke: outline, 'stroke-width': shape.width + 2 * OUTLINE_WIDTH }));
  svg.append(svgElement('line', { ...line, stroke: fill, 'stroke-width': shape.width }));
}

/**
 * Draws the palm as a rounded shape with an outline.
 * @param {SVGElement} svg - Where to draw.
 * @param {Object} shape - The 'palm' shape.
 * @returns {void}
 */
function drawPalm(svg, shape) {
  const pointText = shape.points.map((p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ');
  // A thick stroke with round corners makes the palm look soft instead of pointy.
  const rounding = 0.8;
  svg.append(svgElement('polygon', {
    points: pointText, fill: DIAGRAM_COLORS.outline, stroke: DIAGRAM_COLORS.outline,
    'stroke-width': rounding + 2 * OUTLINE_WIDTH, 'stroke-linejoin': 'round',
  }));
  svg.append(svgElement('polygon', {
    points: pointText, fill: DIAGRAM_COLORS.palm, stroke: DIAGRAM_COLORS.palm,
    'stroke-width': rounding, 'stroke-linejoin': 'round',
  }));
}

/**
 * Draws a fingernail.
 * @param {SVGElement} svg - Where to draw.
 * @param {Object} shape - A 'nail' shape.
 * @returns {void}
 */
function drawNail(svg, shape) {
  svg.append(svgElement('ellipse', {
    cx: shape.center[0], cy: shape.center[1], rx: shape.radiusAlong, ry: shape.radiusAcross,
    transform: 'rotate(' + shape.angleDegrees + ' ' + shape.center[0] + ' ' + shape.center[1] + ')',
    fill: DIAGRAM_COLORS.nail, stroke: DIAGRAM_COLORS.outline, 'stroke-width': OUTLINE_WIDTH * 0.7,
  }));
}

/**
 * Draws the J / Z movement as a dashed line with an arrowhead.
 * @param {SVGElement} svg - Where to draw.
 * @param {Object} shape - A 'motion' shape.
 * @returns {void}
 */
function drawMotion(svg, shape) {
  const [p0, p1, p2, p3] = shape.points;
  const text = (p) => p[0].toFixed(3) + ' ' + p[1].toFixed(3);
  // J is a smooth curve (a "Bezier curve" through control points); Z is straight lines.
  let pathData = 'M ' + text(p0) + ' L ' + text(p1) + ' L ' + text(p2) + ' L ' + text(p3);
  if (shape.curve) {
    pathData = 'M ' + text(p0) + ' C ' + text(p1) + ' ' + text(p2) + ' ' + text(p3);
  }
  // A thick white line underneath makes the arrow stand out even on top of the hand.
  const line = { d: pathData, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  svg.append(svgElement('path', { ...line, stroke: '#ffffff', 'stroke-width': 0.75 }));
  svg.append(svgElement('path', { ...line, stroke: DIAGRAM_COLORS.motion, 'stroke-width': 0.36 }));

  // Arrowhead: a triangle pointing along the last part of the path.
  const angle = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]);
  const size = 1.1;
  const tip = [p3[0] + 0.35 * Math.cos(angle), p3[1] + 0.35 * Math.sin(angle)];
  const left = [tip[0] - size * Math.cos(angle - 0.55), tip[1] - size * Math.sin(angle - 0.55)];
  const right = [tip[0] - size * Math.cos(angle + 0.55), tip[1] - size * Math.sin(angle + 0.55)];
  svg.append(svgElement('polygon', {
    points: [tip, left, right].map((p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' '),
    fill: DIAGRAM_COLORS.motion, stroke: '#ffffff', 'stroke-width': 0.18, 'stroke-linejoin': 'round',
  }));

  // A dot shows where the movement STARTS.
  svg.append(svgElement('circle', {
    cx: p0[0], cy: p0[1], r: 0.42, fill: DIAGRAM_COLORS.motion, stroke: '#ffffff', 'stroke-width': 0.2,
  }));
}

/**
 * Draws a list of shapes (palm, bones, nails, motion arrow) into an <svg>.
 * @param {SVGElement} svg - Where to draw.
 * @param {Array<Object>} shapes - From buildDiagramShapes().
 * @returns {void}
 */
function drawShapes(svg, shapes) {
  for (const shape of shapes) {
    if (shape.type === 'palm') {
      drawPalm(svg, shape);
    } else if (shape.type === 'nail') {
      drawNail(svg, shape);
    } else if (shape.type === 'motion') {
      drawMotion(svg, shape);
    } else {
      drawBone(svg, shape);
    }
  }
}

/**
 * Finds the recipe for a letter: one of the 24 still letters, or J / Z.
 * @param {string} letter - The letter.
 * @returns {Object|undefined} The recipe from handPoses.js.
 */
function poseFor(letter) {
  return LETTER_POSES[letter] ?? MOTION_POSES[letter];
}

/**
 * Draws (or redraws) the diagram for a letter into an existing <svg>.
 * @param {SVGElement} svg - The SVG element to fill.
 * @param {string} letter - The letter, e.g. "B".
 * @param {{flipX?:boolean, highlightFinger?:string|null, turn?:{yaw:number, pitch:number}}} options
 *   flipX = mirror the picture (for left-handed signers),
 *   highlightFinger = finger to draw in red,
 *   turn = extra rotation in degrees when the user drags the picture to look around.
 * @returns {void}
 */
export function renderHandDiagram(svg, letter, options = {}) {
  svg.replaceChildren();
  const basePose = poseFor(letter);
  if (!basePose) {
    return;
  }
  let pose = basePose;
  if (options.turn && (options.turn.yaw !== 0 || options.turn.pitch !== 0)) {
    // Extra turns are added after the recipe's own view, like turning your head
    // around a hand model. The movement arrow is hidden while turned (it's drawn flat).
    pose = { ...basePose, view: [...(basePose.view ?? []), ['y', options.turn.yaw], ['x', options.turn.pitch]], motion: undefined };
  }
  const hand = buildHand(pose);
  const { shapes, viewBox } = buildDiagramShapes(hand, {
    ...options,
    thumbLayer: pose.thumb.layer,
    showForearm: pose.forearm !== false,
    motion: pose.motion,
  });
  svg.setAttribute('viewBox', viewBox.map((n) => n.toFixed(3)).join(' '));
  svg.setAttribute('role', 'img');
  let label = 'Diagram of the handshape for the letter ' + letter;
  if (pose.motion) {
    label += ', with an arrow showing the movement';
  }
  svg.setAttribute('aria-label', label);
  drawShapes(svg, shapes);
}

/**
 * Lets the user drag a diagram to turn the 3D hand and see it from other sides.
 * Double-clicking (or pressing the returned reset function) goes back to normal.
 * @param {SVGElement} svg - The diagram to make draggable.
 * @param {function({yaw:number, pitch:number}):void} redraw - Called with the new turn.
 * @returns {function():void} A function that resets the turn to zero.
 */
export function enableDragToTurn(svg, redraw) {
  const turn = { yaw: 0, pitch: 0 };
  let dragStart = null;

  svg.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, y: event.clientY, yaw: turn.yaw, pitch: turn.pitch };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!dragStart) {
      return;
    }
    // Half a degree per pixel dragged; looking up/down is limited to +-80 degrees.
    turn.yaw = dragStart.yaw + (event.clientX - dragStart.x) * 0.5;
    turn.pitch = Math.max(-80, Math.min(80, dragStart.pitch - (event.clientY - dragStart.y) * 0.5));
    redraw(turn);
  });
  const stop = () => {
    dragStart = null;
  };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);

  const reset = () => {
    turn.yaw = 0;
    turn.pitch = 0;
    redraw(turn);
  };
  svg.addEventListener('dblclick', reset);
  return reset;
}

/**
 * Draws the finger color key: an open hand with each finger in its color
 * and labeled with its name, so users can match colors to fingers.
 * @param {SVGElement} svg - The SVG element to fill.
 * @param {{flipX?:boolean}} options - flipX = mirror for left-handed signers.
 * @returns {void}
 */
export function renderFingerKey(svg, options = {}) {
  svg.replaceChildren();
  const flipX = options.flipX ?? false;
  const hand = buildHand(KEY_POSE);
  const { shapes } = buildDiagramShapes(hand, { flipX, showForearm: false });

  // Index, middle, and ring names go just past their fingertips (middle a bit
  // farther, so neighbors don't bump into each other). Thumb and pinky names go
  // out to the side of their fingertips.
  const labels = [];
  const handCenterX = project(hand.landmarks[9], flipX)[0];
  for (const { finger, name, tip, distance, side } of KEY_LABELS) {
    const tipPoint = project(hand.landmarks[tip], flipX);
    if (side === 'outside') {
      const goesRight = tipPoint[0] > handCenterX;
      labels.push({ finger, name, anchor: goesRight ? 'start' : 'end', at: [tipPoint[0] + (goesRight ? 0.7 : -0.7), tipPoint[1] + 0.2] });
      continue;
    }
    const before = project(hand.landmarks[tip - 1], flipX);
    const dx = tipPoint[0] - before[0];
    const dy = tipPoint[1] - before[1];
    const length = Math.hypot(dx, dy) || 1;
    labels.push({ finger, name, anchor: 'middle', at: [tipPoint[0] + (dx / length) * distance, tipPoint[1] + (dy / length) * distance] });
  }

  const framePoints = [...hand.landmarks.map((p) => project(p, flipX)), ...labels.map((l) => l.at)];
  const viewBox = computeViewBox(framePoints, 0);
  // Leave a little extra room on the sides for the words.
  // Leave room for the words beside the thumb and pinky.
  viewBox[0] -= 3.6;
  viewBox[1] -= 0.6;
  viewBox[2] += 7.2;
  viewBox[3] += 1.2;
  svg.setAttribute('viewBox', viewBox.map((n) => n.toFixed(3)).join(' '));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Finger color key: thumb yellow, index green, middle blue, ring purple, pinky teal');
  drawShapes(svg, shapes);

  for (const label of labels) {
    const text = svgElement('text', {
      x: label.at[0], y: label.at[1], 'text-anchor': label.anchor, 'dominant-baseline': 'middle',
      'font-size': 1.25, 'font-weight': 800, fill: DIAGRAM_COLORS.label,
      stroke: DIAGRAM_COLORS[label.finger], 'stroke-width': 0.35, 'paint-order': 'stroke',
    });
    text.textContent = label.name;
    svg.append(text);
  }
}

/**
 * Creates a brand-new SVG finger color key.
 * @param {{flipX?:boolean, className?:string}} options
 * @returns {SVGElement} The finished key.
 */
export function createFingerKey(options = {}) {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', options.className ?? 'finger-key');
  renderFingerKey(svg, options);
  return svg;
}

/**
 * Creates a brand-new SVG diagram for a letter.
 * @param {string} letter - The letter, e.g. "B".
 * @param {{flipX?:boolean, highlightFinger?:string|null, className?:string}} options
 * @returns {SVGElement} The finished picture.
 */
export function createHandDiagram(letter, options = {}) {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', options.className ?? 'hand-diagram');
  renderHandDiagram(svg, letter, options);
  return svg;
}
