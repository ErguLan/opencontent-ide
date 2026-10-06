/**
 * Turns a solved layout into a flat, ordered list of draw operations.
 * This is the seam where geometry stops and rendering starts: the control-map
 * compiler consumes the same list, so it needs no knowledge of SVG.
 */

import { ICONS } from '../vocabulary.js';
import { hexToRgb } from '../validate.js';

/**
 * @param {object} layout
 * @returns {object[]}
 */
export function buildDrawList(layout) {
  const ops = [];
  for (const node of layout.nodes) {
    switch (node.type) {
      case 'group':
        if (hasSurface(node)) ops.push(rectOp(node));
        break;
      case 'panel':
        if (hasSurface(node)) ops.push(rectOp(node));
        if (node.label) ops.push(labelOp(node, node.label, node.style?.fill ? 'auto' : 'dark'));
        break;
      case 'image':
        ops.push(placeholderOp(node));
        if (node.label) ops.push(labelOp(node, node.label, 'muted'));
        break;
      case 'text':
        ops.push(textOp(node));
        break;
      case 'icon':
        ops.push(iconOp(node));
        break;
      default:
        break;
    }
  }
  return ops;
}

function hasSurface(node) {
  const style = node.style ?? {};
  return Boolean(style.fill || style.stroke || style.shadow);
}

function rectOp(node) {
  const style = node.style ?? {};
  return {
    kind: 'rect',
    id: node.id,
    rect: node.box,
    fill: style.fill ?? null,
    stroke: style.stroke ?? null,
    radius: style.radius ?? 0,
    shadow: style.shadow ?? null,
    opacity: style.opacity ?? 1
  };
}

function placeholderOp(node) {
  const style = node.style ?? {};
  return {
    kind: 'placeholder',
    id: node.id,
    rect: node.box,
    fill: style.fill ?? null,
    stroke: style.stroke ?? { color: '#8b949e', width: 1, dash: [6, 4] },
    radius: style.radius ?? 0,
    shadow: style.shadow ?? null,
    opacity: style.opacity ?? 1
  };
}

function textOp(node) {
  const style = node.text;
  const lines = [...(style.lines ?? [])];
  const lineHeight = style.size * style.lineHeight;
  const out = [];

  if (style.prefix) {
    out.push({
      text: style.prefix,
      x: 0,
      baseline: style.size * 0.8,
      width: 0,
      anchor: 'start',
      size: style.size * 0.72,
      weight: 600,
      color: 'accent',
      family: style.family,
      tracking: Math.max(0, style.tracking),
      uppercase: true
    });
  }

  const offset = style.prefix ? style.size * 1.05 : 0;
  lines.forEach((line, index) => {
    out.push({
      text: line,
      x: 0,
      baseline: style.size * 0.8 + offset + index * lineHeight,
      width: node.box.w,
      anchor: style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start',
      size: style.size,
      weight: style.weight,
      color: style.color,
      family: style.family,
      tracking: style.tracking,
      uppercase: style.uppercase
    });
  });

  return {
    kind: 'text',
    id: node.id,
    rect: node.box,
    opacity: style.opacity ?? 1,
    lines: out
  };
}

function labelOp(node, content, tone) {
  const size = Math.max(10, Math.min(18, Math.round(Math.min(node.box.w, node.box.h) * 0.14)));
  return {
    kind: 'label',
    id: `${node.id}-label`,
    rect: node.box,
    text: content,
    tone,
    size,
    color: tone === 'auto' ? pickReadable(node.style?.fill) : '#6b7280',
    family: 'sans',
    weight: 600,
    tracking: 0.04,
    opacity: 1
  };
}

function pickReadable(fill) {
  if (!fill) return '#6b7280';
  const stops = fill.stops ?? [];
  const first = stops[0]?.color;
  if (!first) return '#6b7280';
  const { r, g, b } = hexToRgb(first);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? '#1a1d21' : '#e8edf2';
}

function iconOp(node) {
  return {
    kind: 'icon',
    id: node.id,
    rect: node.box,
    path: ICONS[node.icon] ?? ICONS.info,
    size: node.icon ? node.icon.size : 24,
    color: node.icon ? node.icon.color : '#111418',
    opacity: node.icon ? node.icon.opacity : 1
  };
}

export { hexToRgb };