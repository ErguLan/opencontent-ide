/**
 * Deterministic text measurement.
 *
 * Honest warning, and the docs say the same: this is an APPROXIMATION. There is no
 * font rasteriser here, so advances come from a per-character width table. It is
 * deterministic and good enough for layout decisions, but a browser rendering the
 * same SVG will differ by a few pixels. That is a deliberate trade: zero
 * dependencies, identical output on every machine, testable in milliseconds.
 */

/** Advance widths in em units, relative to a regular-weight grotesque. */
const NARROW = new Set([...'ijltfrI.,;:\'"`|!()[]{}/\\ ']);
const WIDE = new Set([...'mwMW@%']);
const CAPS = new Set([...'ABCDEFGHJKLNOPQRSTUVXYZ']);

const DEFAULT_ADVANCE = 0.52;
const NARROW_ADVANCE = 0.3;
const WIDE_ADVANCE = 0.86;
const CAP_ADVANCE = 0.66;
const DIGIT_ADVANCE = 0.55;
const SPACE_ADVANCE = 0.26;

/**
 * @param {string} text
 * @param {{size:number, weight?:number, family?:string, uppercase?:boolean, tracking?:number}} style
 * @returns {number} advance width in pixels
 */
export function measureText(text, style) {
  const content = style.uppercase ? String(text).toUpperCase() : String(text);
  const bold = (style.weight ?? 400) >= 600;
  const serif = style.family === 'serif';
  const mono = style.family === 'mono';

  let em = 0;
  for (const char of content) {
    if (mono) {
      em += 0.6;
      continue;
    }
    if (char === ' ') em += SPACE_ADVANCE;
    else if (NARROW.has(char)) em += NARROW_ADVANCE;
    else if (WIDE.has(char)) em += WIDE_ADVANCE;
    else if (CAPS.has(char)) em += CAP_ADVANCE;
    else if (char >= '0' && char <= '9') em += DIGIT_ADVANCE;
    else em += DEFAULT_ADVANCE;
  }
  if (serif) em *= 1.03;

  const weightFactor = bold ? 1.045 : 1;
  const tracking = (style.tracking ?? 0) * content.length;
  return em * (style.size ?? 15) * weightFactor + tracking;
}

/**
 * Greedy word wrap. Long unbreakable words are hard-split so a line never overflows.
 *
 * @param {string} text
 * @param {object} style
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapText(text, style, maxWidth) {
  const content = style.uppercase ? String(text).toUpperCase() : String(text);
  const paragraphs = content.split('\n');
  const out = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, style) <= maxWidth || !current) {
        if (measureText(candidate, style) > maxWidth && !current) {
          const pieces = hardSplit(word, style, maxWidth);
          out.push(...pieces.slice(0, -1));
          current = pieces[pieces.length - 1] ?? '';
        } else {
          current = candidate;
        }
        continue;
      }
      out.push(current);
      current = word;
    }
    if (current) out.push(current);
  }

  if (style.maxLines && out.length > style.maxLines) {
    const kept = out.slice(0, style.maxLines);
    const last = kept[kept.length - 1];
    if (measureText(`${last}...`, style) <= maxWidth) kept[kept.length - 1] = `${last}...`;
    else kept[kept.length - 1] = `${last.slice(0, Math.max(1, last.length - 3))}...`;
    return kept;
  }
  return out;
}

function hardSplit(word, style, maxWidth) {
  const pieces = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    if (measureText(candidate, style) > maxWidth && current) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * @param {string[]} lines
 * @param {{size:number, lineHeight:number}} style
 * @returns {number} total block height
 */
export function textBlockHeight(lines, style) {
  return lines.length * style.size * style.lineHeight;
}

/**
 * @param {string[]} lines
 * @param {object} style
 * @returns {number} width of the widest line
 */
export function textBlockWidth(lines, style) {
  let max = 0;
  for (const line of lines) max = Math.max(max, measureText(line, style));
  return max;
}