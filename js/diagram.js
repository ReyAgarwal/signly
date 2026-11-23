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
import { LETTER_POSES } from './handPoses.js';

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
};

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
const OUTLINE_WIDTH = 0.13;

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
 * @param {{flipX?:boolean, highlightFinger?:string|null, thumbLayer?:string}} options
 * @returns {{shapes:Array<Object>, viewBox:number[]}} Shapes to draw and the picture frame.
 */
export function buildDiagramShapes(hand, options = {}) {
  const flipX = options.flipX ?? false;
  const highlight = options.highlightFinger ?? null;
  const points = hand.landmarks;
  const shapes = [];

  // The palm: wrist corners, thumb base, and the four knuckles.
  const palmCorners = [hand.wristThumbSide, points[1], points[5], points[9], points[13], points[17], hand.wristPinkySide];
  const palmDepth = averageDepth(palmCorners) - 0.05;
  shapes.push({ type: 'palm', points: palmCorners.map((p) => project(p, flipX)), depth: palmDepth });

  // The forearm is always drawn first (behind everything).
  shapes.push({
    type: 'bone', finger: 'forearm', from: project(points[0], flipX), to: project(hand.forearmEnd, flipX),
    width: 2.3, depth: -Infinity,
  });

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
  return { shapes, viewBox: computeViewBox(points.map((p) => project(p, flipX))) };
}

/**
 * Finds a square picture frame that fits the hand, with some margin.
 * @param {number[][]} flatPoints - 2D points of the hand.
 * @returns {number[]} [left, top, width, height] for the SVG viewBox.
 */
function computeViewBox(flatPoints) {
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
  const size = Math.max(MIN_VIEW_SIZE, maxX - minX + 2 * margin, maxY - minY + 2 * margin);
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
 * Draws one bone as a rounded line with an outline.
 * @param {SVGElement} svg - Where to draw.
 * @param {Object} shape - A 'bone' shape.
 * @returns {void}
 */
function drawBone(svg, shape) {
  let fill = DIAGRAM_COLORS[shape.finger];
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
 * Draws (or redraws) the diagram for a letter into an existing <svg>.
 * @param {SVGElement} svg - The SVG element to fill.
 * @param {string} letter - The letter, e.g. "B".
 * @param {{flipX?:boolean, highlightFinger?:string|null}} options
 *   flipX = mirror the picture (for left-handed signers),
 *   highlightFinger = finger to draw in red.
 * @returns {void}
 */
export function renderHandDiagram(svg, letter, options = {}) {
  svg.replaceChildren();
  const pose = LETTER_POSES[letter];
  if (!pose) {
    return;
  }
  const hand = buildHand(pose);
  const { shapes, viewBox } = buildDiagramShapes(hand, { ...options, thumbLayer: pose.thumb.layer });
  svg.setAttribute('viewBox', viewBox.map((n) => n.toFixed(3)).join(' '));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Diagram of the handshape for the letter ' + letter);

  for (const shape of shapes) {
    if (shape.type === 'palm') {
      drawPalm(svg, shape);
    } else if (shape.type === 'nail') {
      drawNail(svg, shape);
    } else {
      drawBone(svg, shape);
    }
  }
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
