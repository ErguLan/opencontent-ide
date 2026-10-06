/**
 * Control maps: geometry in, rasters out.
 *
 * This is the honest seam between a scene compiler and a diffusion backend.
 * WritterArt decides *where* things are and hands over three single-channel-ish
 * maps plus a segmentation palette; it never ships a renderer, never ships
 * weights and never calls an API. An adapter (out of scope) feeds these to
 * ControlNet / Flux or to any other backend.
 *
 *   depth        grayscale, brighter = nearer. Background darkest.
 *   edges        grayscale, white = edge. Rectangle outlines of every node.
 *   segmentation flat indexed colour, one stable colour per node id.
 *
 * Everything is deterministic: identical layout + identical seed => identical
 * bytes. All randomness comes from `createRng`.
 *
 * Cost model: work is proportional to node perimeter plus one pass over the
 * output pixels, so a 1920x1080 layout with a few hundred nodes stays well
 * inside a second. Nothing is allocated per pixel.
 *
 * @module controlmaps
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createRng } from './rng.js';
import { writePng } from './png.js';

/** @typedef {{x:number,y:number,w:number,h:number}} Rect */
/** @typedef {{width:number,height:number,rgba:Uint8ClampedArray}} Raster */
/** @typedef {{width:number,height:number,rgba:Uint8ClampedArray,index:Record<string,number[]>}} IndexedRaster */

/** Index key reserved for the canvas background. */
const BACKGROUND_KEY = '_fondo';

/** Reserved background colour: pure black, never handed to a node. */
const BACKGROUND_RGB = Object.freeze([0, 0, 0]);

/**
 * Depth ladder. A node starts at the brightness its type deserves and is then
 * lifted to never be darker than an earlier sibling of the same kind.
 */
const DEPTH_TEXT = 1;
const DEPTH_ICON = 0.85;
const DEPTH_IMAGE = 0.6;
const DEPTH_CONTAINER_MIN = 0.25;
const DEPTH_CONTAINER_MAX = 0.55;
/** Nested containers climb in small steps, capped by DEPTH_CONTAINER_MAX. */
const DEPTH_NEST_STEP = 0.04;
const DEPTH_NEST_MAX = 4;

/** Rungs of the depth ladder, used to scope the monotonic sibling floor. */
const RUNG_CONTAINER = 0;
const RUNG_IMAGE = 1;
const RUNG_ICON = 2;
const RUNG_TEXT = 3;
const RUNG_COUNT = 4;

/**
 * Half of the flat core of an edge stroke. A pixel centre closer than this to a
 * node boundary is a full-strength pixel, so an axis-aligned box still gets a
 * clean 1px line when `sensitivity` is small.
 */
const EDGE_CORE = 0.5;

/** Minimum ramp value that still counts as a segmentation separator pixel. */
const SEPARATOR_MIN = 0.5;

/** Hue-circle colour parameters for the segmentation palette. */
const SEGMENT_SATURATION = 0.62;
const SEGMENT_LIGHTNESS = 0.54;

// ---------------------------------------------------------------- public API

/**
 * Compile a solved layout into depth, edges and segmentation rasters.
 *
 * @example
 * const maps = compileControlMaps(layout, { width: 1024, height: 576, seed: 7 })
 * maps.depth.rgba.length === 1024 * 576 * 4
 *
 * @param {object} layout solved layout from `solve()`: `{ width, height, nodes }`
 *   and/or `{ root }`. Nested nodes also appear in their parent's `children`;
 *   de-duplication is by object identity, so paint order is preserved.
 * @param {{ width?:number, height?:number, seed?:number, sensitivity?:number }} [options]
 *   `width`/`height` default to the layout canvas, `seed` to 1 and
 *   `sensitivity` to 0.08. A different size resamples: nearest-neighbour for
 *   segmentation, bilinear for depth and edges.
 * @returns {{
 *   width:number, height:number,
 *   depth:Raster, edges:Raster, segmentation:IndexedRaster,
 *   json:{ width:number, height:number, seed:number, sensitivity:number,
 *          nodes:{ id:string, type:string, box:Rect, depth:number }[] }
 * }}
 * @throws {TypeError} if `layout` is not an object or a size is not a positive number
 */
export function compileControlMaps(layout, options = {}) {
  if (!layout || typeof layout !== 'object') {
    throw new TypeError('controlmaps: layout must be a solved layout object');
  }

  const opts = options && typeof options === 'object' ? options : {};
  const canvasWidth = size(layout.width, 'layout.width');
  const canvasHeight = size(layout.height, 'layout.height');
  const width = size(opts.width === undefined || opts.width === null ? canvasWidth : opts.width, 'width');
  const height = size(opts.height === undefined || opts.height === null ? canvasHeight : opts.height, 'height');
  const seed = opts.seed === undefined || opts.seed === null ? 1 : opts.seed;
  const sensitivity = clamp01(Number(opts.sensitivity === undefined || opts.sensitivity === null ? 0.08 : opts.sensitivity));

  const nodes = collectNodes(layout);
  const boxes = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) boxes[i] = safeRect(nodes[i]);

  const depthValues = assignDepths(nodes, boxes, canvasWidth, canvasHeight);

  // Layout-resolution working buffers. Background is the zero value everywhere.
  const depthField = new Float32Array(canvasWidth * canvasHeight);
  const edgeField = new Float32Array(canvasWidth * canvasHeight);
  const segmentField = new Uint16Array(canvasWidth * canvasHeight);
  const palette = buildPalette(nodes, seed);

  const stroke = EDGE_CORE + 0.5 + 2 * sensitivity;

  for (let i = 0; i < nodes.length; i++) {
    const box = boxes[i];
    if (!box.w || !box.h) continue;
    fillField(depthField, canvasWidth, canvasHeight, box, depthValues[i]);
    paintEdgeRing(edgeField, canvasWidth, canvasHeight, box, stroke);
    const slot = i + 1;
    fillSegment(segmentField, canvasWidth, canvasHeight, box, slot);
    paintSegmentRing(segmentField, canvasWidth, canvasHeight, box, slot + palette.segmentSlots);
  }

  return {
    width,
    height,
    depth: { width, height, rgba: toGrayRgba(depthField, canvasWidth, canvasHeight, width, height) },
    edges: { width, height, rgba: toGrayRgba(edgeField, canvasWidth, canvasHeight, width, height) },
    segmentation: {
      width,
      height,
      rgba: toIndexedRgba(segmentField, palette.colors, canvasWidth, canvasHeight, width, height),
      index: palette.index
    },
    json: {
      width,
      height,
      seed,
      sensitivity,
      nodes: nodes.map((node, i) => ({
        id: String(node.id ?? ''),
        type: String(node.type ?? ''),
        box: { ...boxes[i] },
        depth: round4(depthValues[i])
      }))
    }
  };
}

/**
 * Compile the control maps and write them to disk as PNGs plus `maps.json`.
 *
 * The directory is created when missing. File names are fixed, so two runs of
 * the same layout produce the same four files in the same place.
 *
 * @example
 * const { files } = writeControlMaps(layout, 'out/maps', { width: 1024, height: 1024 })
 * // -> out/maps/depth.png, edges.png, segmentation.png, maps.json
 *
 * @param {object} layout solved layout, see {@link compileControlMaps}
 * @param {string} outDir output directory, created recursively when missing
 * @param {{ width?:number, height?:number, seed?:number, sensitivity?:number }} [options]
 *   same options as {@link compileControlMaps}
 * @returns {{
 *   depth:Raster, edges:Raster, segmentation:IndexedRaster,
 *   json:object, files:{ depth:string, edges:string, segmentation:string }
 * }} the compiled maps plus absolute paths of the three PNGs
 * @throws {TypeError} if `outDir` is not a non-empty string
 */
export function writeControlMaps(layout, outDir, options = {}) {
  if (typeof outDir !== 'string' || outDir.trim() === '') {
    throw new TypeError('controlmaps: outDir must be a non-empty path');
  }

  const maps = compileControlMaps(layout, options);
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });

  const files = {
    depth: join(dir, 'depth.png'),
    edges: join(dir, 'edges.png'),
    segmentation: join(dir, 'segmentation.png')
  };

  const dims = { width: maps.width, height: maps.height };
  writePng(files.depth, { width: dims.width, height: dims.height, data: maps.depth.rgba });
  writePng(files.edges, { width: dims.width, height: dims.height, data: maps.edges.rgba });
  writePng(files.segmentation, { width: dims.width, height: dims.height, data: maps.segmentation.rgba });
  writeFileSync(join(dir, 'maps.json'), `${JSON.stringify(maps.json, null, 2)}\n`, 'utf8');

  return {
    depth: maps.depth,
    edges: maps.edges,
    segmentation: maps.segmentation,
    json: maps.json,
    files
  };
}

// ---------------------------------------------------------------- node graph

/**
 * Flat paint order, de-duplicated by object identity.
 *
 * `layout.nodes` is already flat and already contains every nested node, so it
 * is consumed first and a `layout.root` tree only adds what is missing.
 *
 * @param {object} layout
 * @returns {object[]}
 */
function collectNodes(layout) {
  const seen = new Set();
  const order = [];

  const push = (node) => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    order.push(node);
  };

  const walk = (node) => {
    push(node);
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (let i = 0; i < children.length; i++) {
      if (children[i] && typeof children[i] === 'object') walk(children[i]);
    }
  };

  if (Array.isArray(layout.nodes)) {
    for (let i = 0; i < layout.nodes.length; i++) push(layout.nodes[i]);
  }
  if (layout.root && typeof layout.root === 'object') walk(layout.root);

  return order;
}

/**
 * Parent links and nesting level for every node, from the `children` edges.
 *
 * @param {object[]} nodes flat paint order
 * @returns {{ parentOf: Map<object, object>, level: Map<object, number> }}
 */
function analyseTree(nodes) {
  const parentOf = new Map();

  for (let i = 0; i < nodes.length; i++) {
    const children = nodes[i].children;
    if (!Array.isArray(children)) continue;
    for (let c = 0; c < children.length; c++) {
      const child = children[c];
      if (child && typeof child === 'object' && !parentOf.has(child)) parentOf.set(child, nodes[i]);
    }
  }

  const level = new Map();
  const walk = (node, depth) => {
    if (level.has(node)) return;
    level.set(node, depth);
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (let c = 0; c < children.length; c++) {
      if (children[c] && typeof children[c] === 'object') walk(children[c], depth + 1);
    }
  };

  for (let i = 0; i < nodes.length; i++) {
    if (!parentOf.has(nodes[i])) walk(nodes[i], 0);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!level.has(nodes[i])) level.set(nodes[i], 0);
  }

  return { parentOf, level };
}

/**
 * Brightness for every node, in paint order.
 *
 * Base value by type: text 1.0, icon 0.85, image 0.6, container
 * 0.25 + 0.30 * (1 - area ratio) + 0.04 * nesting, clamped to 0.55. A full-canvas
 * root therefore lands on 0.25 and small nested panels climb towards 0.55, so
 * foreground elements read brighter than the background.
 *
 * Monotonicity: the floor is tracked per parent *and* per rung of the ladder,
 * so a node is never darker than an earlier sibling of its own kind. Comparing
 * across rungs would contradict the ladder itself: in `[titulo, imagen]` the
 * title would drag the image to 1.0 and the type would stop meaning anything.
 * A stack of same-kind siblings is exactly the case that matters, and there the
 * ramp stays non-decreasing in paint order.
 *
 * @param {object[]} nodes flat paint order
 * @param {Rect[]} boxes sanitised box per node, same order
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {Float32Array} one brightness per node
 */
function assignDepths(nodes, boxes, canvasWidth, canvasHeight) {
  const { parentOf, level } = analyseTree(nodes);
  const canvasArea = Math.max(1, canvasWidth * canvasHeight);
  const floors = new Map();
  const depths = new Float32Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const type = typeof nodes[i].type === 'string' ? nodes[i].type : '';
    let base;
    let rung;

    if (type === 'text') {
      base = DEPTH_TEXT;
      rung = RUNG_TEXT;
    } else if (type === 'icon') {
      base = DEPTH_ICON;
      rung = RUNG_ICON;
    } else if (type === 'image') {
      base = DEPTH_IMAGE;
      rung = RUNG_IMAGE;
    } else {
      const box = boxes[i];
      const shrink = 1 - Math.min(1, (box.w * box.h) / canvasArea);
      const nest = Math.min(DEPTH_NEST_MAX, level.get(nodes[i]) ?? 0);
      base = DEPTH_CONTAINER_MIN + (DEPTH_CONTAINER_MAX - DEPTH_CONTAINER_MIN) * shrink + DEPTH_NEST_STEP * nest;
      if (base > DEPTH_CONTAINER_MAX) base = DEPTH_CONTAINER_MAX;
      rung = RUNG_CONTAINER;
    }

    const parent = parentOf.has(nodes[i]) ? parentOf.get(nodes[i]) : null;
    let siblings = floors.get(parent);
    if (siblings === undefined) {
      siblings = new Float32Array(RUNG_COUNT);
      floors.set(parent, siblings);
    }
    const floor = siblings[rung];
    const depth = base > floor ? base : floor;
    siblings[rung] = depth;
    depths[i] = depth;
  }

  return depths;
}

// ---------------------------------------------------------------- rasterising

/**
 * Paint a constant value over a rectangle, one `TypedArray.fill` per row.
 *
 * @param {Float32Array} field
 * @param {number} fw
 * @param {number} fh
 * @param {Rect} box
 * @param {number} value
 */
function fillField(field, fw, fh, box, value) {
  const x0 = spanStart(box.x, fw);
  const x1 = spanEnd(box.x + box.w, fw);
  if (x1 < x0) return;

  const y0 = spanStart(box.y, fh);
  const y1 = spanEnd(box.y + box.h, fh);
  if (y1 < y0) return;

  for (let y = y0; y <= y1; y++) {
    const at = y * fw;
    field.fill(value, at + x0, at + x1 + 1);
  }
}

/**
 * Paint a segmentation index over a rectangle.
 *
 * @param {Uint16Array} field
 * @param {number} fw
 * @param {number} fh
 * @param {Rect} box
 * @param {number} value palette slot
 */
function fillSegment(field, fw, fh, box, value) {
  const x0 = spanStart(box.x, fw);
  const x1 = spanEnd(box.x + box.w, fw);
  if (x1 < x0) return;

  const y0 = spanStart(box.y, fh);
  const y1 = spanEnd(box.y + box.h, fh);
  if (y1 < y0) return;

  for (let y = y0; y <= y1; y++) {
    const at = y * fw;
    field.fill(value, at + x0, at + x1 + 1);
  }
}

/**
 * Soft rectangle outline, drawn one pixel inside *and* one pixel outside `box`.
 *
 * For a pixel centre the signed box distance is `d = max(dx, dy)`, where `dx`
 * and `dy` are the signed distances to the vertical and horizontal edge lines.
 * The stroke covers `|d| <= stroke`, so for one row:
 *
 *   - `dy >= 0` (row outside the box): every column within `stroke` of the
 *     rectangle contributes, and the value is `min(rowRamp, columnRamp)`.
 *   - `-stroke < dy < 0` (row inside, still inside the horizontal stroke): same
 *     full-width pass, combined with `max`.
 *   - deeper rows: only the two vertical bands are within reach of the stroke,
 *     so the full-width pass is skipped.
 *
 * A full-canvas node therefore costs a perimeter pass, not a canvas pass.
 *
 * @param {Float32Array} field single channel, accumulated with max
 * @param {number} fw
 * @param {number} fh
 * @param {Rect} box
 * @param {number} stroke half thickness of the soft stroke, in layout pixels
 */
function paintEdgeRing(field, fw, fh, box, stroke) {
  const x0 = box.x;
  const x1 = box.x + box.w;
  const y0 = box.y;
  const y1 = box.y + box.h;

  const rowFrom = Math.max(0, Math.floor(y0 - stroke));
  const rowTo = Math.min(fh - 1, Math.ceil(y1 + stroke));
  const ca = Math.max(0, Math.floor(x0 - stroke));
  const cb = Math.min(fw - 1, Math.ceil(x1 + stroke));
  const leftTo = Math.min(fw - 1, Math.ceil(x0 + stroke));
  const rightFrom = Math.max(0, Math.floor(x1 - stroke));

  for (let py = rowFrom; py <= rowTo; py++) {
    const cy = py + 0.5;
    const dy = Math.max(y0 - cy, cy - y1);
    if (dy > stroke) continue;
    const at = py * fw;

    if (dy >= 0) {
      const row = edgeRamp(dy, stroke);
      for (let px = ca; px <= cb; px++) {
        const v = Math.min(row, edgeRamp(columnGap(px, x0, x1), stroke));
        if (v > field[at + px]) field[at + px] = v;
      }
      continue;
    }

    const row = edgeRamp(-dy, stroke);
    if (row > 0) {
      for (let px = ca; px <= cb; px++) {
        const v = Math.max(row, edgeRamp(columnGap(px, x0, x1), stroke));
        if (v > field[at + px]) field[at + px] = v;
      }
      continue;
    }

    for (let px = Math.max(0, Math.floor(x0 - stroke)); px <= leftTo; px++) {
      const v = edgeRamp(columnGap(px, x0, x1), stroke);
      if (v > field[at + px]) field[at + px] = v;
    }
    for (let px = rightFrom; px <= cb; px++) {
      const v = edgeRamp(columnGap(px, x0, x1), stroke);
      if (v > field[at + px]) field[at + px] = v;
    }
  }
}

/**
 * One pixel separator line around a segment, so adjacent segments never bleed.
 *
 * Painted in paint order, so a later node owns the pixels it covers.
 *
 * @param {Uint16Array} field palette slots
 * @param {number} fw
 * @param {number} fh
 * @param {Rect} box
 * @param {number} separator palette slot painted on the separator line
 */
function paintSegmentRing(field, fw, fh, box, separator) {
  const x0 = box.x;
  const x1 = box.x + box.w;
  const y0 = box.y;
  const y1 = box.y + box.h;
  const stroke = EDGE_CORE + 0.5;

  const rowFrom = Math.max(0, Math.floor(y0 - stroke));
  const rowTo = Math.min(fh - 1, Math.ceil(y1 + stroke));
  const ca = Math.max(0, Math.floor(x0 - stroke));
  const cb = Math.min(fw - 1, Math.ceil(x1 + stroke));
  const leftTo = Math.min(fw - 1, Math.ceil(x0 + stroke));
  const rightFrom = Math.max(0, Math.floor(x1 - stroke));

  for (let py = rowFrom; py <= rowTo; py++) {
    const cy = py + 0.5;
    const dy = Math.max(y0 - cy, cy - y1);
    if (dy > stroke) continue;
    const at = py * fw;

    if (dy >= 0) {
      const row = edgeRamp(dy, stroke);
      for (let px = ca; px <= cb; px++) {
        if (Math.min(row, edgeRamp(columnGap(px, x0, x1), stroke)) >= SEPARATOR_MIN) field[at + px] = separator;
      }
      continue;
    }

    const row = edgeRamp(-dy, stroke);
    if (row >= SEPARATOR_MIN) {
      for (let px = ca; px <= cb; px++) {
        if (Math.max(row, edgeRamp(columnGap(px, x0, x1), stroke)) >= SEPARATOR_MIN) field[at + px] = separator;
      }
      continue;
    }

    for (let px = Math.max(0, Math.floor(x0 - stroke)); px <= leftTo; px++) {
      if (Math.max(row, edgeRamp(columnGap(px, x0, x1), stroke)) >= SEPARATOR_MIN) field[at + px] = separator;
    }
    for (let px = rightFrom; px <= cb; px++) {
      if (Math.max(row, edgeRamp(columnGap(px, x0, x1), stroke)) >= SEPARATOR_MIN) field[at + px] = separator;
    }
  }
}

/**
 * Soft stroke ramp: 1 inside the flat core, smoothly down to 0 at `stroke`.
 *
 * @param {number} distance unsigned distance to the nearest box boundary
 * @param {number} stroke
 * @returns {number} value in [0, 1]
 */
function edgeRamp(distance, stroke) {
  if (distance <= EDGE_CORE) return 1;
  const span = stroke - EDGE_CORE;
  if (span <= 0) return 0;
  const v = 1 - (distance - EDGE_CORE) / span;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v * v * (3 - 2 * v);
}

/**
 * Unsigned horizontal distance from a pixel column to the vertical edges of a box.
 *
 * @param {number} px pixel column
 * @param {number} x0 left edge
 * @param {number} x1 right edge
 * @returns {number}
 */
function columnGap(px, x0, x1) {
  const cx = px + 0.5;
  const left = x0 - cx;
  const right = cx - x1;
  if (left > 0) return left;
  if (right > 0) return right;
  return 0;
}

// ---------------------------------------------------------------- resampling

/**
 * Grayscale field -> RGBA, bilinear when the target size differs.
 *
 * @param {Float32Array} field
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {number} dw target width
 * @param {number} dh target height
 * @returns {Uint8ClampedArray} `dw * dh * 4` bytes, alpha always 255
 */
function toGrayRgba(field, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);

  if (dw === sw && dh === sh) {
    for (let i = 0, p = 0; i < field.length; i++, p += 4) {
      const g = toByte(field[i]);
      out[p] = g;
      out[p + 1] = g;
      out[p + 2] = g;
      out[p + 3] = 255;
    }
    return out;
  }

  const axisX = sampleAxis(sw, dw);
  const axisY = sampleAxis(sh, dh);

  for (let y = 0; y < dh; y++) {
    const y0 = axisY[y * 3] * sw;
    const y1 = axisY[y * 3 + 1] * sw;
    const wy = axisY[y * 3 + 2];
    let p = y * dw * 4;
    for (let x = 0; x < dw; x++, p += 4) {
      const x0 = axisX[x * 3];
      const x1 = axisX[x * 3 + 1];
      const wx = axisX[x * 3 + 2];
      const top = field[y0 + x0] * (1 - wx) + field[y0 + x1] * wx;
      const bottom = field[y1 + x0] * (1 - wx) + field[y1 + x1] * wx;
      const g = toByte(top * (1 - wy) + bottom * wy);
      out[p] = g;
      out[p + 1] = g;
      out[p + 2] = g;
      out[p + 3] = 255;
    }
  }

  return out;
}

/**
 * Segmentation slots -> RGBA, nearest-neighbour when the size differs.
 *
 * @param {Uint16Array} field palette slots
 * @param {Uint8Array} palette RGB triplets
 * @param {number} sw
 * @param {number} sh
 * @param {number} dw
 * @param {number} dh
 * @returns {Uint8ClampedArray} `dw * dh * 4` bytes, alpha always 255
 */
function toIndexedRgba(field, palette, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);

  if (dw === sw && dh === sh) {
    for (let i = 0, p = 0; i < field.length; i++, p += 4) {
      const c = field[i] * 3;
      out[p] = palette[c];
      out[p + 1] = palette[c + 1];
      out[p + 2] = palette[c + 2];
      out[p + 3] = 255;
    }
    return out;
  }

  const stepX = sw / dw;
  const stepY = sh / dh;

  for (let y = 0; y < dh; y++) {
    const sy = nearestAxis(y, stepY, sh);
    const rowAt = sy * sw;
    let p = y * dw * 4;
    for (let x = 0; x < dw; x++, p += 4) {
      const c = field[rowAt + nearestAxis(x, stepX, sw)] * 3;
      out[p] = palette[c];
      out[p + 1] = palette[c + 1];
      out[p + 2] = palette[c + 2];
      out[p + 3] = 255;
    }
  }

  return out;
}

/**
 * Precomputed bilinear taps for one axis: `[i0, i1, weight]` per target pixel,
 * flat so the resampling loop reads three consecutive doubles and allocates
 * nothing.
 *
 * @param {number} size source length
 * @param {number} target target length
 * @returns {Float64Array} `target * 3` entries
 */
function sampleAxis(size, target) {
  const taps = new Float64Array(target * 3);
  const step = size / target;
  const last = size - 1;

  for (let i = 0; i < target; i++) {
    const centre = (i + 0.5) * step - 0.5;
    let low = Math.floor(centre);
    let weight = centre - low;

    if (low < 0) {
      low = 0;
      weight = 0;
    } else if (low > last) {
      low = last;
      weight = 0;
    }

    const high = low + 1;
    taps[i * 3] = low;
    taps[i * 3 + 1] = high > last ? last : high;
    taps[i * 3 + 2] = high > last ? 1 : weight;
  }

  return taps;
}

/**
 * Nearest-neighbour source index for one target pixel.
 *
 * @param {number} i target index
 * @param {number} step source length / target length
 * @param {number} size source length
 * @returns {number}
 */
function nearestAxis(i, step, size) {
  const s = Math.floor((i + 0.5) * step);
  if (s < 0) return 0;
  if (s > size - 1) return size - 1;
  return s;
}

// ---------------------------------------------------------------- palette

/**
 * Stable, visually distinct colour per node id.
 *
 * Slot 0 is the reserved background. Node colours walk the hue circle with an
 * equal angular step from a seed-derived starting hue, which keeps neighbours
 * in the palette far apart in hue. Slots past the node range are darkened
 * variants used as separator lines.
 *
 * @param {object[]} nodes flat paint order
 * @param {number|string} seed
 * @returns {{ colors: Uint8Array, index: Record<string, number[]>, segmentSlots: number }}
 */
function buildPalette(nodes, seed) {
  const count = nodes.length;
  const segmentSlots = count + 1;
  // Segment slots 0..count (background plus one per node) and separator slots
  // right after them, so a separator slot can never collide with a node slot.
  const slots = 2 * segmentSlots;
  const colors = new Uint8Array(slots * 3);
  const index = {};

  defineEntry(index, BACKGROUND_KEY, [BACKGROUND_RGB[0], BACKGROUND_RGB[1], BACKGROUND_RGB[2]]);

  const rng = createRng(seed);
  const hue0 = rng.next() * 360;
  const step = count > 0 ? 360 / count : 360;
  const used = new Set(['0,0,0']);

  for (let i = 0; i < count; i++) {
    const rgb = segmentColour(hue0 + i * step, used);
    const slot = i + 1;
    colors[slot * 3] = rgb[0];
    colors[slot * 3 + 1] = rgb[1];
    colors[slot * 3 + 2] = rgb[2];

    const dark = slot + segmentSlots;
    colors[dark * 3] = (rgb[0] * 0.42) | 0;
    colors[dark * 3 + 1] = (rgb[1] * 0.42) | 0;
    colors[dark * 3 + 2] = (rgb[2] * 0.42) | 0;

    defineEntry(index, String(nodes[i].id ?? ''), [rgb[0], rgb[1], rgb[2]]);
  }

  return { colors, index, segmentSlots };
}

/**
 * One HSL colour for a hue in degrees, nudged until it is unused.
 *
 * @param {number} degrees
 * @param {Set<string>} used keys already taken
 * @returns {number[]} `[r, g, b]` in 0..255
 */
function segmentColour(degrees, used) {
  const hue = (((degrees % 360) + 360) % 360) / 360;

  for (let bump = 0; bump < 64; bump++) {
    const lightness = clamp(SEGMENT_LIGHTNESS - bump * 0.035, 0.08, 0.92);
    const rgb = hslToRgb(hue, SEGMENT_SATURATION, lightness);
    const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    if (!used.has(key)) {
      used.add(key);
      return rgb;
    }
  }

  // Practically unreachable: an equal hue step at this saturation cannot
  // collide for any realistic node count. Kept so the function is total instead
  // of handing two nodes the same colour.
  return [255, 255, 255];
}

/**
 * HSL -> RGB, 8 bit.
 *
 * @param {number} h hue in [0, 1)
 * @param {number} s saturation in [0, 1]
 * @param {number} l lightness in [0, 1]
 * @returns {number[]} `[r, g, b]` in 0..255
 */
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

/**
 * Define an enumerable own property. `Object.defineProperty` is used instead of
 * plain assignment so that an id spelled `__proto__` cannot poison the map.
 *
 * @param {Record<string, number[]>} target
 * @param {string} key
 * @param {number[]} value
 */
function defineEntry(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

// ---------------------------------------------------------------- helpers

/**
 * First pixel column whose centre falls inside `[start, end)`.
 *
 * @param {number} start
 * @param {number} size
 * @returns {number}
 */
function spanStart(start, size) {
  const first = Math.ceil(start - 0.5);
  return first < 0 ? 0 : first;
}

/**
 * Last pixel column whose centre falls inside `[start, end)`.
 *
 * @param {number} end
 * @param {number} size
 * @returns {number}
 */
function spanEnd(end, size) {
  const last = Math.ceil(end - 0.5) - 1;
  return last > size - 1 ? size - 1 : last;
}

/**
 * Node box, sanitised.
 *
 * A box with any non-finite component is collapsed to an empty rect instead of
 * being drawn somewhere arbitrary: one NaN from upstream must not poison a
 * whole raster, and a zero-area node contributes nothing to any of the maps.
 *
 * @param {object} node
 * @returns {Rect}
 */
function safeRect(node) {
  const box = node && typeof node.box === 'object' && node.box !== null ? node.box : null;
  const x = box && box.x;
  const y = box && box.y;
  const w = box && box.w;
  const h = box && box.h;

  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {number} `value` when it is a finite number, 0 otherwise
 */
function finite(value) {
  return isFiniteNumber(value) ? value : 0;
}

/**
 * Positive integer size with a stable message.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function size(value, name) {
  const n = finite(value);
  if (n <= 0) throw new TypeError(`controlmaps: ${name} must be a positive number, received ${String(value)}`);
  return Math.max(1, Math.round(n));
}

/**
 * @param {number} value
 * @returns {number}
 */
function toByte(value) {
  if (!(value > 0)) return 0;
  if (value >= 1) return 255;
  return Math.round(value * 255);
}

/**
 * @param {number} value
 * @returns {number}
 */
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * @param {number} value
 * @returns {number}
 */
function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clamp01(value) {
  return clamp(finite(value), 0, 1);
}