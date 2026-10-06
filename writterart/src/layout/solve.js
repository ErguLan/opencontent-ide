/**
 * The constraint solver.
 *
 * Input: a validated scene. Output: absolute pixel boxes for every node.
 * No randomness, no clock, no I/O. Same scene in, same layout out — always.
 */

import { ICONS } from '../vocabulary.js';
import { inset, normaliseRect, round } from './geometry.js';
import { textBlockHeight, textBlockWidth, wrapText } from './measure.js';

/**
 * @typedef {object} Layout
 * @property {number} width
 * @property {number} height
 * @property {object|null} background
 * @property {object|null} light
 * @property {object[]} nodes flat paint order, parents before children
 */

/**
 * @param {object} scene validated scene
 * @param {{ seed?:number }} [options]
 * @returns {Layout}
 */
export function solve(scene, options = {}) {
  const canvas = { x: 0, y: 0, w: scene.canvas.width, h: scene.canvas.height };
  const flat = [];
  const counter = { total: 0 };

  measureNode(scene.root, canvas.w, scene, options.seed ?? 1, true);

  const rootBox = normaliseRect({
    x: canvas.x,
    y: canvas.y,
    w: explicitLength(scene.root.style?.size?.width, canvas.w),
    h: explicitLength(scene.root.style?.size?.height, canvas.h)
  });

  arrangeNode(scene.root, rootBox, scene, flat, counter, options.seed ?? 1, true);

  return {
    width: scene.canvas.width,
    height: scene.canvas.height,
    background: scene.background,
    light: scene.light,
    theme: scene.theme ?? null,
    nodes: flat
  };
}

// ------------------------------------------------------------------ measurement

function measureNode(node, availWidth, scene, seed, isRoot) {
  if (!node) return;
  node.__seed = seed;

  switch (node.type) {
    case 'group':
      measureContainer(node, availWidth, scene, seed, isRoot);
      break;
    case 'panel':
    case 'image': {
      const padding = node.style.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const inner = Math.max(0, availWidth - padding.left - padding.right);
      node.children.forEach((child) => measureNode(child, inner, scene, seed, false));
      const contentW = node.children.length
        ? Math.max(...node.children.map((c) => c.__measured.w))
        : 0;
      const contentH = node.children.length
        ? stackHeight(node.children, node.layout.gap, scene)
        : 0;
      const naturalW = contentW + padding.left + padding.right;
      node.__measured = {
        w: explicitLength(node.style.size.width, isRoot ? availWidth : naturalW),
        h: Math.max(
          explicitLength(node.style.size.height, contentH + padding.top + padding.bottom),
          explicitLength(node.style.size.minHeight, 0)
        )
      };
      break;
    }
    case 'text': {
      const lines = wrapText(node.text, node.style, Math.max(16, availWidth));
      node.__lines = lines;
      node.__measured = {
        w: Math.min(availWidth, Math.ceil(textBlockWidth(lines, node.style))),
        h: Math.ceil(textBlockHeight(lines, node.style))
      };
      break;
    }
    case 'icon':
      node.__measured = { w: node.style.size, h: node.style.size };
      break;
    default:
      node.__measured = { w: 0, h: 0 };
  }
}

function measureContainer(node, availWidth, scene, seed, isRoot) {
  const layout = node.layout;
  const padding = layout.padding;
  if (typeof padding !== 'object' || padding === null) {
    const v = Number(padding) || 0;
    layout.padding = { top: v, right: v, bottom: v, left: v };
  } else {
    layout.padding = { top: 0, right: 0, bottom: 0, left: 0, ...padding };
  }
  const inner = Math.max(0, availWidth - layout.padding.left - layout.padding.right);
  const gap = layout.gap ?? 0;

  for (const child of node.children) measureNode(child, inner, scene, seed, false);

  let w;
  let h;
  if (layout.columns && layout.columns > 0 && node.children.length) {
    const cellWidth = (inner - gap * (layout.columns - 1)) / layout.columns;
    for (const child of node.children) {
      child.__measured.w = Math.min(child.__measured.w, cellWidth);
    }
    w = inner;
    h = gridHeight(node.children, layout.columns, gap);
  } else if (layout.dir === 'horizontal') {
    w = node.children.reduce((sum, child) => sum + child.__measured.w, 0) + gap * Math.max(0, node.children.length - 1);
    h = node.children.length ? Math.max(...node.children.map((c) => c.__measured.h)) : 0;
  } else {
    w = node.children.length ? Math.max(...node.children.map((c) => c.__measured.w)) : 0;
    h = stackHeight(node.children, gap, scene);
  }

  node.__measured = {
    w: explicitLength(node.style?.size?.width, isRoot ? availWidth : w + padding.left + padding.right),
    h: Math.max(
      explicitLength(node.style?.size?.height, h + layout.padding.top + layout.padding.bottom),
      explicitLength(node.style?.size?.minHeight, 0)
    )
  };
}

function stackHeight(children, gap, scene) {
  if (!children.length) return 0;
  return children.reduce((sum, child) => sum + child.__measured.h, 0) + gap * (children.length - 1);
}

function gridHeight(children, columns, gap) {
  let total = 0;
  const rows = Math.ceil(children.length / columns);
  for (let row = 0; row < rows; row += 1) {
    const slice = children.slice(row * columns, row * columns + columns);
    total += Math.max(...slice.map((child) => child.__measured.h));
  }
  return total + gap * (rows - 1);
}

// ------------------------------------------------------------------ placement

function arrangeNode(node, box, scene, flat, counter, seed, isRoot) {
  const rect = normaliseRect(box);
  const rawPadding = node.layout?.padding ?? node.style?.padding ?? 0;
  const padding = typeof rawPadding === 'number'
    ? { top: rawPadding, right: rawPadding, bottom: rawPadding, left: rawPadding }
    : { top: 0, right: 0, bottom: 0, left: 0, ...rawPadding };

  const layoutNode = {
    id: node.id,
    type: node.type,
    box: rect,
    contentBox: normaliseRect(inset(rect, padding)),
    style: node.style ?? null,
    text: null,
    icon: null,
    label: node.label ?? null,
    children: []
  };

  switch (node.type) {
    case 'text':
      layoutNode.text = { ...node.style, content: node.text, prefix: node.prefix ?? null, lines: node.__lines ?? [] };
      break;
    case 'icon':
      layoutNode.icon = {
        name: node.icon,
        path: ICONS[node.icon] ?? ICONS.info,
        size: node.style.size,
        color: node.style.color,
        opacity: node.style.opacity
      };
      break;
    default:
      break;
  }

  flat.push(layoutNode);
  counter.total += 1;

  if (node.type === 'group' || node.type === 'panel') {
    const childBoxes = distribute(node, layoutNode.contentBox, scene);
    node.children.forEach((child, index) => {
      const childBox = childBoxes[index];
      const childLayout = arrangeNode(child, childBox, scene, flat, counter, seed, false);
      layoutNode.children.push(childLayout);
    });
  }

  return layoutNode;
}

function distribute(node, area, scene) {
  const children = node.children;
  if (!children.length) return [];

  const layout = node.layout;
  const gap = layout.gap ?? 0;

  if (layout.columns && layout.columns > 0) {
    const columns = layout.columns;
    const cellWidth = (area.w - gap * (columns - 1)) / columns;
    const boxes = [];
    const rows = Math.ceil(children.length / columns);
    let y = area.y;
    for (let row = 0; row < rows; row += 1) {
      const slice = children.slice(row * columns, row * columns + columns);
      const rowHeight = Math.max(...slice.map((child) => child.__measured.h));
      slice.forEach((child, column) => {
        const x = area.x + column * (cellWidth + gap);
        const w = Math.min(child.__measured.w, cellWidth);
        boxes.push({
          x: crossX(layout.align, x, w, area.x, area.w),
          y,
          w,
          h: child.__measured.h
        });
      });
      y += rowHeight + gap;
    }
    return boxes;
  }

  const sizes = children.map((child) => child.__measured);
  const horizontal = layout.dir === 'horizontal';
  const total = sizes.reduce((sum, size) => sum + (horizontal ? size.w : size.h), 0);
  const gaps = gap * Math.max(0, children.length - 1);
  const extent = horizontal ? area.w : area.h;
  const free = extent - total - gaps;

  let cursor = horizontal ? area.x : area.y;
  let between = 0;
  if (free > 0) {
    if (layout.justify === 'center') cursor += free / 2;
    else if (layout.justify === 'end') cursor += free;
    else if (layout.justify === 'between' && children.length > 1) between = free / (children.length - 1);
  }

  return children.map((child, index) => {
    const size = sizes[index];
    const mainSize = horizontal ? size.w : size.h;
    const mainPos = cursor;
    cursor += mainSize + gap + between;

    if (horizontal) {
      return {
        x: mainPos,
        y: crossY(layout.align, mainPos, size.h, area.y, area.h),
        w: layout.align === 'stretch' ? area.w : size.w,
        h: size.h
      };
    }
    return {
      x: crossX(layout.align, mainPos, size.w, area.x, area.w),
      y: mainPos,
      w: layout.align === 'stretch' ? area.w : size.w,
      h: size.h
    };
  });
}

/** Cross-axis position on x. */
function crossX(align, fallback, size, origin, extent) {
  if (align === 'center') return origin + (extent - size) / 2;
  if (align === 'end') return origin + extent - size;
  return fallback;
}

/** Cross-axis position on y. */
function crossY(align, fallback, size, origin, extent) {
  if (align === 'center') return origin + (extent - size) / 2;
  if (align === 'end') return origin + extent - size;
  return fallback;
}

function explicitLength(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (value && typeof value === 'object' && typeof value.n === 'number') {
    return Math.max(0, value.pct ? value.n / 100 : value.n);
  }
  return fallback;
}

export { explicitLength, round };