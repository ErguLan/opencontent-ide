/**
 * Lexer for WritterArt. Hand written, no dependencies, never throws on bad input:
 * malformed characters become `unknown` tokens so the parser can report them with
 * a line and column instead of blowing up.
 */

const PUNCT = new Set(['{', '}', '(', ')', '[', ']', ':', ',']);

/**
 * @typedef {Object} Token
 * @property {'ident'|'string'|'number'|'punct'|'unknown'} type
 * @property {string|number|null} value  ident/string -> text, number -> numeric value
 * @property {string|null} unit         'px' | '%' | 'em' | null
 * @property {number} line 1-based
 * @property {number} col  1-based
 * @property {number} pos  0-based offset into source
 * @property {number} end  0-based offset just past the token
 */

/**
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
  const tokens = [];
  const text = String(source ?? '');
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const col = (pos) => pos - lineStart + 1;
  const push = (type, value, start, extra) => {
    tokens.push({
      type,
      value,
      unit: extra?.unit ?? null,
      line,
      col: col(start),
      pos: start,
      end: i
    });
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\n') {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      continue;
    }

    // comments
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') {
          line += 1;
          lineStart = i + 1;
        }
        i += 1;
      }
      i = Math.min(i + 2, text.length);
      continue;
    }

    // strings
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i += 1;
      let out = '';
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\' && i + 1 < text.length) {
          const esc = text[i + 1];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
          i += 2;
          continue;
        }
        if (text[i] === '\n') {
          line += 1;
          lineStart = i + 1;
        }
        out += text[i];
        i += 1;
      }
      if (text[i] === quote) i += 1;
      push('string', out, start);
      continue;
    }

    // hex colour
    if (ch === '#' && /[0-9a-fA-F]/.test(text[i + 1] ?? '')) {
      const start = i;
      i += 1;
      let hex = '';
      while (i < text.length && /[0-9a-fA-F]/.test(text[i]) && hex.length < 8) {
        hex += text[i];
        i += 1;
      }
      push('string', hex, start);
      continue;
    }

    // number, optionally in 1200x630 form
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const start = i;
      while (i < text.length && /[0-9]/.test(text[i])) i += 1;
      if (text[i] === '.' && /[0-9]/.test(text[i + 1] ?? '')) {
        i += 1;
        while (i < text.length && /[0-9]/.test(text[i])) i += 1;
      }
      const numeric = Number(text.slice(start, i));
      const immediate = i;

      // 1200x630 written without spaces
      if (text[i] === 'x' && /[0-9]/.test(text[i + 1] ?? '')) {
        i += 1;
        while (i < text.length && /[0-9]/.test(text[i])) i += 1;
        push('number', numeric, start, { unit: `x${text.slice(immediate + 1, i)}` });
        continue;
      }

      let unit = 'px';
      const unitMatch = /^(%|px|em|rem)/.exec(text.slice(i));
      if (unitMatch) {
        unit = unitMatch[1];
        i += unitMatch[0].length;
      }
      push('number', numeric, start, { unit });
      continue;
    }

    // identifier
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < text.length && /[A-Za-z0-9_-]/.test(text[i])) i += 1;
      push('ident', text.slice(start, i), start);
      continue;
    }

    if (PUNCT.has(ch)) {
      const start = i;
      i += 1;
      push('punct', ch, start);
      continue;
    }

    const start = i;
    i += 1;
    push('unknown', ch, start);
  }

  tokens.push({
    type: 'eof',
    value: null,
    unit: null,
    line,
    col: col(i),
    pos: i,
    end: i
  });
  return tokens;
}