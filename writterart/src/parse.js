/**
 * Parser for WritterArt surface syntax -> canonical IR (plain JSON).
 *
 * Rules:
 *  - never throws. Bad input becomes a Diagnostic with a line and a column.
 *  - resolves every alias in `ALIASES`, so downstream code only sees canonical Spanish keys.
 *  - does NO semantic validation. `validate()` owns that.
 */

import { tokenize } from './tokenize.js';
import { ALIASES, CANVAS_PRESETS, CODES, FUNCTIONS, nearest, NODE_TYPES } from './vocabulary.js';

const SCENE_KEYS = new Set(['lienzo', 'estilo', 'paleta', 'luz', 'fondo']);
const SCENE_KEYS_ARRAY = [...SCENE_KEYS];
const GROUP_TYPES = new Set(['grupo', 'fila', 'columna']);
const TEXT_TYPES = new Set(['texto', 'titulo', 'subtitulo']);
const LAYOUT_SHORTHAND = new Set(['vertical', 'horizontal']);
const TRUTHY = new Set(['true', 'si', 'verdadero', 'yes', 'on']);
const FALSY = new Set(['false', 'no', 'falso', 'off']);

/**
 * @param {string} source
 * @returns {{ ok:boolean, scene:object|null, errors:object[] }}
 */
export function parse(source) {
  const p = new Parser(tokenize(source));
  return p.run();
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
    this.errors = [];
    this.counters = new Map();
  }

  // ---------------------------------------------------------------- token helpers

  peek(offset = 0) {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }

  next() {
    const token = this.tokens[this.i];
    if (this.i < this.tokens.length - 1) this.i += 1;
    return token;
  }

  atEnd() {
    return this.peek().type === 'eof';
  }

  isPunct(value, offset = 0) {
    const token = this.peek(offset);
    return token.type === 'punct' && token.value === value;
  }

  isIdent(value, offset = 0) {
    const token = this.peek(offset);
    return token.type === 'ident' && token.value === value;
  }

  expectPunct(value, path) {
    if (this.isPunct(value)) {
      this.next();
      return true;
    }
    this.fail(CODES.SYNTAX, path, `expected '${value}'`, this.peek());
    return false;
  }

  fail(code, path, message, token, extra = {}) {
    this.errors.push({
      code,
      message,
      path,
      line: token?.line ?? null,
      col: token?.col ?? null,
      hint: extra.hint ?? null,
      near: extra.near ?? []
    });
  }

  canonical(word) {
    const key = String(word);
    if (ALIASES[key]) return ALIASES[key];
    if (ALIASES[key.toLowerCase()]) return ALIASES[key.toLowerCase()];
    return key.toLowerCase();
  }

  // ---------------------------------------------------------------- entry

  run() {
    if (this.errors.length) return { ok: false, scene: null, errors: this.errors };
    if (this.atEnd()) {
      this.fail(CODES.EMPTY_INPUT, 'root', 'source contains no scene', this.peek(), {
        hint: 'Empieza con: escena "titulo" { lienzo: og ... }'
      });
      return { ok: false, scene: null, errors: this.errors };
    }

    if (!this.isIdent('escena') && !this.isIdent('scene')) {
      this.fail(CODES.SYNTAX, 'root', "a scene must start with 'escena'", this.peek(), {
        hint: 'La primera palabra tiene que ser escena, seguida de un titulo opcional y una llave.',
        near: ['escena', 'scene']
      });
      return { ok: false, scene: null, errors: this.errors };
    }
    this.next();

    let name = 'escena';
    if (this.peek().type === 'string') {
      name = this.next().value;
    }

    const meta = { canvas: null, style: null, palette: null, light: null, background: null };
    const block = this.parseBlock('root', meta, true);
    const children = block.children;

    if (!this.atEnd() && !this.isPunct('}')) {
      this.fail(CODES.UNEXPECTED_TOKEN, 'root', 'unexpected content after the closing brace', this.peek());
    }

    const scene = {
      kind: 'scene',
      version: '0.1',
      name,
      canvas: meta.canvas ?? { ...CANVAS_PRESETS.og },
      light: meta.light ?? null,
      background: meta.background ?? null,
      styleName: meta.style ?? null,
      paletteName: meta.palette ?? null,
      root: meta.rootNode ?? { type: 'group', id: 'root', layout: defaultLayout(), style: defaultGroupStyle(), children, src: null },
      src: { line: 1, col: 1 }
    };

    if (!meta.rootNode && children.length) {
      scene.root.children = children;
    }

    return { ok: this.errors.length === 0, scene, errors: this.errors };
  }

  // ---------------------------------------------------------------- statements

  parseStatements(path, meta, isRoot) {
    return this.parseBlock(path, meta, isRoot).children;
  }

  /**
   * One `{ ... }` block. Inside it, `nombre: valor` declares a property of the
   * enclosing container and bare words open a child node. Mixing both is the
   * natural way people write these layouts.
   */
  parseBlock(path, meta, isRoot) {
    const props = {};
    const children = [];
    if (!this.expectPunct('{', path)) return { props, children };

    while (!this.atEnd() && !this.isPunct('}')) {
      const before = this.i;
      const token = this.peek();

      if (token.type === 'ident' && this.isPunct(':', 1)) {
        const word = this.canonical(token.value);
        this.next();
        this.next();
        const entry = { value: this.parseValue(`${path}.${word}`, { allowMap: true }), token, line: token.line, col: token.col };
        if (isRoot && SCENE_KEYS.has(word)) this.applySceneProperty(word, entry, meta, path);
        else props[word] = entry;
      } else if (token.type === 'ident' && SCENE_KEYS.has(this.canonical(token.value)) && isRoot && this.isPunct('(', 1)) {
        this.fail(CODES.SYNTAX, path, `'${token.value}' expects a value, not a call`, token, {
          hint: `Write ${this.canonical(token.value)}: value instead.`,
          near: SCENE_KEYS_ARRAY
        });
        this.next();
        this.next();
      } else {
        const statement = this.parseStatement(path, meta, isRoot);
        if (statement) {
          if (Array.isArray(statement)) children.push(...statement);
          else children.push(statement);
        }
      }

      if (this.i === before) {
        this.fail(CODES.UNEXPECTED_TOKEN, path, 'cannot make progress here', this.peek());
        this.next();
      }
    }
    this.expectPunct('}', path);
    return { props, children };
  }

  parseStatement(path, meta, isRoot) {
    const token = this.peek();
    if (token.type !== 'ident') {
      this.fail(CODES.SYNTAX, path, 'expected a property or a block name', token, {
        near: NODE_TYPES.slice(0, 3)
      });
      this.next();
      return null;
    }

    const word = this.canonical(token.value);

    if (SCENE_KEYS.has(word) && isRoot) {
      this.next();
      return this.parseSceneProperty(word, meta);
    }

    if (GROUP_TYPES.has(word)) return this.parseGroup(word, path);
    if (word === 'panel') return this.parsePanel(path);
    if (word === 'icono') return this.parseIcon(path);
    if (word === 'imagen') return this.parseImage(path);
    if (TEXT_TYPES.has(word)) return this.parseText(word, path);

    const allWords = [...NODE_TYPES, ...SCENE_KEYS];
    this.fail(CODES.UNKNOWN_WORD, path, `unknown word '${token.value}'`, token, {
      hint: 'Los bloques válidos son grupo, fila, columna, panel, titulo, subtitulo, texto, icono, imagen.',
      near: nearest(token.value, allWords)
    });
    this.next();
    this.skipStatement();
    return null;
  }

  skipStatement() {
    if (this.isPunct('{')) {
      const depth = this.skipBalanced('{', '}');
      this.i += depth;
      return;
    }
    if (this.peek().type === 'ident' && this.isPunct(':', 1)) {
      this.next();
      this.next();
      this.skipValue();
    }
  }

  skipBalanced(open, close) {
    let depth = 0;
    while (!this.atEnd()) {
      const token = this.peek();
      if (token.type === 'punct' && token.value === open) depth += 1;
      if (token.type === 'punct' && token.value === close) {
        depth -= 1;
        if (depth === 0) return 0;
      }
      this.next();
    }
    return 0;
  }

  skipValue() {
    if (this.isPunct('{')) return this.skipBalanced('{', '}');
    if (this.isPunct('[')) {
      let depth = 0;
      while (!this.atEnd()) {
        if (this.isPunct('[')) depth += 1;
        if (this.isPunct(']')) {
          depth -= 1;
          if (depth === 0) {
            this.next();
            return 0;
          }
        }
        this.next();
      }
      return 0;
    }
    if (this.isPunct('(')) return this.skipBalanced('(', ')');
    this.next();
    return 0;
  }

  parseSceneProperty(word, meta) {
    const path = word;
    const value = this.parseValue(path);
    this.applySceneProperty(word, { value, token: this.peek() }, meta, path);
    return null;
  }

  applySceneProperty(word, entry, meta, path) {
    const value = entry.value;
    switch (word) {
      case 'lienzo':
        meta.canvas = this.readCanvas(value, path);
        break;
      case 'estilo':
        meta.style = typeof value === 'string' ? value : null;
        break;
      case 'paleta':
        meta.palette = typeof value === 'string' ? value : null;
        break;
      case 'luz':
        meta.light = this.readLightSpec(value, path);
        break;
      case 'fondo':
        meta.background = this.readFillValue(value, path);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- nodes

  parseGroup(word, path) {
    const start = this.next();
    let id = null;
    if (this.peek().type === 'string') id = this.next().value;

    let dir = word === 'fila' ? 'horizontal' : word === 'columna' ? 'vertical' : null;
    if (this.peek().type === 'ident' && LAYOUT_SHORTHAND.has(this.peek().value.toLowerCase())) {
      dir = this.next().value.toLowerCase();
    }

    const style = defaultGroupStyle();
    const layout = defaultLayout();
    layout.dir = dir;

    const inline = this.parseInlineProperties();
    const block = this.isPunct('{') ? this.parseBlock(path, {}, false) : { props: {}, children: [] };
    const props = { ...inline, ...block.props };
    for (const [key, entry] of Object.entries(props)) {
      this.applyGroupProperty(key, entry, layout, style, path);
    }

    return {
      type: 'group',
      id: id ?? takeId(props) ?? this.autoId(word),
      layout,
      style,
      children: block.children,
      src: { line: start.line, col: start.col }
    };
  }

  applyGroupProperty(key, entry, layout, style, path) {
    const value = entry.value;
    if (key === 'direccion') {
      const dir = typeof value === 'string' ? value.toLowerCase() : null;
      if (dir === 'vertical' || dir === 'horizontal') layout.dir = dir;
      else
        this.fail(CODES.BAD_VALUE, `${path}.direccion`, "direction must be 'vertical' or 'horizontal'", entry.token, {
          near: ['vertical', 'horizontal']
        });
      return;
    }
    if (key === 'columnas') {
      layout.columns = typeof value === 'number' ? value : null;
      return;
    }
    if (key === 'espacio') {
      layout.gap = typeof value === 'number' ? value : 0;
      return;
    }
    if (key === 'alineacion') layout.align = typeof value === 'string' ? value : null;
    else if (key === 'distribucion') layout.justify = typeof value === 'string' ? value : null;
    else if (key === 'padding') layout.padding = value ?? 0;
    else this.applyShapeProperty(key, entry, style, path);
  }

  parsePanel(path) {
    const start = this.next();
    const style = defaultPanelStyle();
    const block = this.parseBlock(path, {}, false);
    const props = block.props;
    const id = takeId(props);
    let label = null;
    for (const [key, entry] of Object.entries(props)) {
      if (key === 'texto') label = typeof entry.value === 'string' ? entry.value : null;
      else this.applyShapeProperty(key, entry, style, path);
    }
    return {
      type: 'panel',
      id: id ?? this.autoId('panel'),
      style,
      label,
      children: block.children,
      src: { line: start.line, col: start.col }
    };
  }

  parseImage(path) {
    const start = this.next();
    const style = defaultPanelStyle();
    const block = this.parseBlock(path, {}, false);
    const props = block.props;
    const id = takeId(props);
    let label = null;
    for (const [key, entry] of Object.entries(props)) {
      if (key === 'etiqueta') label = typeof entry.value === 'string' ? entry.value : null;
      else if (key === 'texto') label = typeof entry.value === 'string' ? entry.value : null;
      else this.applyShapeProperty(key, entry, style, path);
    }
    return { type: 'image', id: id ?? this.autoId('imagen'), label, style, children: block.children, src: { line: start.line, col: start.col } };
  }

  parseIcon(path) {
    const start = this.next();
    if (this.peek().type !== 'string') {
      this.fail(CODES.MISSING_PROPERTY, `${path}.icono`, 'icon block needs an icon name', this.peek(), {
        hint: 'Escribe el nombre del icono entre comillas, por ejemplo: icono "check" { }',
        near: ['check', 'rayo', 'estrella', 'alerta']
      });
      return null;
    }
    const name = this.next().value;
    const style = { size: null, color: null, opacity: 1, align: null };
    const props = this.parsePropertyBlockBody(path);
    const id = takeId(props);
    for (const [key, entry] of Object.entries(props)) {
      if (key === 'tam') style.size = typeof entry.value === 'number' ? entry.value : null;
      else if (key === 'color') style.color = typeof entry.value === 'string' ? entry.value : null;
      else if (key === 'opacidad') style.opacity = typeof entry.value === 'number' ? entry.value : 1;
      else if (key === 'alineacion') style.align = typeof entry.value === 'string' ? entry.value : null;
      else {
        this.fail(CODES.UNKNOWN_PROPERTY, `${path}.${key}`, `'${key}' is not an icon property`, entry.token, {
          hint: 'Propiedades de icono: tam, color, opacidad, alineacion.',
          near: ['tam', 'color', 'opacidad']
        });
      }
    }
    return { type: 'icon', id: id ?? this.autoId('icono'), icon: name, style, children: [], src: { line: start.line, col: start.col } };
  }

  parseText(word, path) {
    const start = this.next();
    if (this.peek().type !== 'string') {
      this.fail(CODES.MISSING_PROPERTY, `${path}.texto`, `${word} block needs its text content`, this.peek(), {
        hint: `Escribe el contenido entre comillas, por ejemplo: ${word} "Hola" { tam: 32 }`
      });
      return null;
    }
    const content = this.next().value;
    const style = defaultTextStyle();
    applyTextProfile(style, word);
    const props = this.parsePropertyBlockBody(path);
    let prefix = null;
    for (const [key, entry] of Object.entries(props)) {
      if (key === 'prefijo') prefix = typeof entry.value === 'string' ? entry.value : null;
      else this.applyTextProperty(key, entry, style, path);
    }
    return {
      type: 'text',
      id: takeId(props) ?? this.autoId(word),
      text: content,
      prefix,
      style,
      children: [],
      src: { line: start.line, col: start.col }
    };
  }

  // ---------------------------------------------------------------- properties

  /** Parses `{ a: 1, b { ... } }` after the block keyword. Returns a key -> {value, token} map. */
  parsePropertyBlockBody(path) {
    const out = {};
    if (!this.expectPunct('{', path)) return out;
    while (!this.atEnd() && !this.isPunct('}')) {
      const before = this.i;
      const token = this.peek();
      if (token.type !== 'ident') {
        this.fail(CODES.SYNTAX, path, 'expected a property name', token, { near: ['ancho', 'color', 'tam'] });
        this.next();
        continue;
      }
      const key = this.canonical(token.value);
      this.next();
      let value;
      if (this.isPunct(':')) {
        this.next();
        value = this.parseValue(`${path}.${key}`, { allowMap: true });
      } else if (this.isPunct('{')) {
        value = { __map: this.parsePropertyBlockBody(`${path}.${key}`) };
      } else if (this.isPunct('(')) {
        value = { __call: key, args: this.parseArgs(path), line: token.line, col: token.col };
      } else {
        this.fail(CODES.SYNTAX, `${path}.${key}`, "expected ':' after a property name", this.peek());
        out[key] = { value: null, token, line: token.line, col: token.col };
        continue;
      }
      out[key] = { value, token, line: token.line, col: token.col };
      if (this.i === before) this.next();
    }
    this.expectPunct('}', path);
    return out;
  }

  /** Reads `name: value` pairs that appear inline, before a block. */
  parseInlineProperties() {
    const out = {};
    while (this.peek().type === 'ident' && this.isPunct(':', 1)) {
      const token = this.next();
      this.next();
      const key = this.canonical(token.value);
      const value = this.parseValue(key);
      out[key] = { value, token, line: token.line, col: token.col };
    }
    return out;
  }

  parseArgs(path) {
    const args = [];
    if (!this.expectPunct('(', path)) return args;
    while (!this.atEnd() && !this.isPunct(')')) {
      const before = this.i;
      args.push(this.parseValue(path));
      if (this.isPunct(',')) this.next();
      if (this.i === before) this.next();
    }
    this.expectPunct(')', path);
    return args;
  }

  parseValue(path, options = {}) {
    const allowMap = options.allowMap === true;
    if (this.isPunct(':')) this.next();
    const token = this.peek();
    if (token.type === 'number') {
      this.next();
      if (token.unit === '%') return { n: token.value, pct: true };
      return token.value;
    }
    if (token.type === 'string') {
      this.next();
      return token.value;
    }
    if (token.type === 'punct') {
      if (token.value === '[') return this.parseList(path);
      if (token.value === '{') {
        if (!allowMap) {
          this.fail(CODES.SYNTAX, path, 'a block cannot appear here', token, {
            hint: 'Inline maps are only allowed directly after a property name.',
            near: []
          });
          this.skipBalanced('{', '}');
          return null;
        }
        return { __map: this.parsePropertyBlockBody(path) };
      }
      if (token.value === '(') return this.parseValue(path);
      this.fail(CODES.BAD_VALUE, path, `unexpected '${token.value}'`, token);
      this.next();
      return null;
    }
    if (token.type === 'ident') {
      const lower = token.value.toLowerCase();
      this.next();
      if (TRUTHY.has(lower)) return true;
      if (FALSY.has(lower)) return false;
      if (this.isPunct('(')) return { __call: lower, args: this.parseArgs(path), line: token.line, col: token.col };
      if (allowMap && this.isPunct('{')) return { __map: this.parsePropertyBlockBody(path) };
      return token.value;
    }
    this.fail(CODES.BAD_VALUE, path, 'expected a value', token);
    this.next();
    return null;
  }

  parseList(path) {
    const items = [];
    if (!this.expectPunct('[', path)) return items;
    while (!this.atEnd() && !this.isPunct(']')) {
      const before = this.i;
      items.push(this.parseValue(path));
      if (this.isPunct(',')) this.next();
      if (this.i === before) this.next();
    }
    this.expectPunct(']', path);
    return items;
  }

  // ---------------------------------------------------------------- readers

  readCanvas(value, path) {
    if (value === null) return null;
    if (typeof value === 'number') {
      const preset = { width: value, height: null };
      return preset;
    }
    if (typeof value === 'string') {
      const match = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(value.trim());
      if (match) return { width: Number(match[1]), height: Number(match[2]) };
      const preset = CANVAS_PRESETS[value.toLowerCase()];
      if (preset) return { ...preset };
      this.fail(CODES.UNKNOWN_WORD, path, `unknown canvas '${value}'`, this.peek(), {
        hint: 'Usa un tamaño explicito ("1200x630") o un nombre de preset.',
        near: Object.keys(CANVAS_PRESETS)
      });
      return null;
    }
    if (value && value.__map) {
      const map = value.__map;
      const pick = (name) => {
        const entry = map[name];
        return entry && typeof entry.value === 'number' ? entry.value : null;
      };
      return { width: pick('ancho'), height: pick('alto') };
    }
    return null;
  }

  readLightSpec(value, path) {
    if (typeof value === 'string') return { preset: value };
    if (value && value.__map) {
      const map = value.__map;
      const out = { preset: null };
      for (const [key, entry] of Object.entries(map)) {
        const v = entry.value;
        if (key === 'angulo' && typeof v === 'number') out.angle = v;
        else if (key === 'difuminado' && typeof v === 'number') out.blur = v;
        else if (key === 'opacidad' && typeof v === 'number') out.opacity = v;
        else if (key === 'color' && typeof v === 'string') out.color = v;
      }
      return out;
    }
    return null;
  }

  readFillValue(value, path) {
    if (value === null) return null;
    if (typeof value === 'string') return { __raw: value };
    if (typeof value === 'number') return { __raw: value };
    if (value.__call) return { __raw: value.__call, args: value.args };
    if (value.__map) return { __map: value.__map };
    return null;
  }

  // ---------------------------------------------------------------- shape/text props

  applyShapeProperty(key, entry, style, path) {
    const value = entry.value;
    switch (key) {
      case 'ancho':
        style.size.width = value;
        break;
      case 'alto':
        style.size.height = value;
        break;
      case 'min_alto':
        style.size.minHeight = value;
        break;
      case 'relleno':
        style.fill = this.readFillValue(value, `${path}.relleno`);
        break;
      case 'material':
        if (typeof value === 'string') style.material = value;
        else if (value && value.__call) style.material = value.args[0];
        break;
      case 'borde':
        style.stroke = this.readStroke(value, entry);
        break;
      case 'radio':
        style.radius = typeof value === 'number' ? value : 0;
        break;
      case 'sombra':
        style.shadow = this.readShadow(value, entry);
        break;
      case 'opacidad':
        style.opacity = typeof value === 'number' ? value : 1;
        break;
      case 'padding':
        style.padding = value;
        break;
      case 'paleta':
        style.palette = typeof value === 'string' ? value : null;
        break;
      case 'estilo':
        style.style = typeof value === 'string' ? value : null;
        break;
      default:
        this.fail(CODES.UNKNOWN_PROPERTY, `${path}.${key}`, `'${key}' is not a property here`, entry.token, {
          hint: 'Propiedades de forma: ancho, alto, min_alto, relleno, material, borde, radio, sombra, opacidad, padding.',
          near: ['ancho', 'alto', 'relleno', 'borde', 'radio', 'sombra', 'opacidad', 'padding']
        });
    }
  }

  applyTextProperty(key, entry, style, path) {
    const value = entry.value;
    switch (key) {
      case 'tam':
        style.size = typeof value === 'number' ? value : style.size;
        break;
      case 'peso':
        style.weight = typeof value === 'string' ? value : typeof value === 'number' ? value : style.weight;
        break;
      case 'tipografia':
        style.family = typeof value === 'string' ? value : style.family;
        break;
      case 'color':
        style.color = typeof value === 'string' ? value : style.color;
        break;
      case 'alineacion':
        style.align = typeof value === 'string' ? value : style.align;
        break;
      case 'interlineado':
        style.lineHeight = typeof value === 'number' ? value : style.lineHeight;
        break;
      case 'tracking':
        style.tracking = typeof value === 'number' ? value : style.tracking;
        break;
      case 'mayusculas':
        style.uppercase = value === true || value === 'mayusculas';
        break;
      case 'lineas':
        style.maxLines = typeof value === 'number' ? value : null;
        break;
      case 'opacidad':
        style.opacity = typeof value === 'number' ? value : style.opacity;
        break;
      case 'prefijo':
        style.prefix = typeof value === 'string' ? value : null;
        break;
      default:
        if (FUNCTIONS[key]) {
          applyTextFunction(key, value, style);
          return;
        }
        this.fail(CODES.UNKNOWN_PROPERTY, `${path}.${key}`, `'${key}' is not a text property`, entry.token, {
          hint: 'Propiedades de texto: tam, peso, tipografia, color, alineacion, interlineado, tracking, mayusculas, lineas.',
          near: ['tam', 'peso', 'color', 'alineacion', 'interlineado', 'tracking', 'mayusculas', 'lineas']
        });
    }
  }

  // ---------------------------------------------------------------- ids

  autoId(type) {
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    return `${type}-${n}`;
  }

  autoIdFor(node) {
    if (node.id) return node.id;
    const assigned = this.autoId(node.type);
    node.id = assigned;
    return assigned;
  }
}

/** Pulls an explicit `id` out of a property map, leaving the rest untouched. */
function takeId(props) {
  const entry = props.id;
  if (!entry) return null;
  delete props.id;
  return typeof entry.value === 'string' ? entry.value : null;
}

function applyTextFunction(name, value, style) {
  if (name === 'mayusculas') {
    style.uppercase = true;
    return;
  }
  if (name === 'tracking' && typeof value === 'number') {
    style.tracking = value;
    return;
  }
  if (name === 'interlineado' && typeof value === 'number') {
    style.lineHeight = value;
    return;
  }
  if (name === 'lineas' && typeof value === 'number') {
    style.maxLines = value;
  }
}

function readStroke(value, entry) {
  if (value && value.__map) {
    const map = value.__map;
    const out = { color: '#000000', width: 1, dash: null };
    for (const [key, sub] of Object.entries(map)) {
      if (key === 'color' && typeof sub.value === 'string') out.color = sub.value;
      else if (key === 'grosor' && typeof sub.value === 'number') out.width = sub.value;
      else if (key === 'puntos' && Array.isArray(sub.value)) out.dash = sub.value.filter((n) => typeof n === 'number');
    }
    return out;
  }
  if (value && value.__call) {
    const [color, width] = value.args;
    return {
      color: typeof color === 'string' ? color : '#000000',
      width: typeof width === 'number' ? width : 1,
      dash: null
    };
  }
  if (typeof value === 'string') return { color: value, width: 1, dash: null };
  if (typeof value === 'number') return { color: '#000000', width: value, dash: null };
  return null;
}

function readShadow(value, entry) {
  const out = { dx: 0, dy: 12, blur: 24, spread: 0, color: '#00000030' };
  if (value && value.__map) {
    for (const [key, sub] of Object.entries(value.__map)) {
      const v = sub.value;
      if (key === 'difuminado' && typeof v === 'number') out.blur = v;
      else if (key === 'x' && typeof v === 'number') out.dx = v;
      else if (key === 'y' && typeof v === 'number') out.dy = v;
      else if (key === 'extension' && typeof v === 'number') out.spread = v;
      else if (key === 'color' && typeof v === 'string') out.color = v;
    }
    return out;
  }
  if (value && value.__call) {
    const named = value.args[0];
    if (typeof named === 'string') return { preset: named };
  }
  return out;
}

function applyTextProfile(style, word) {
  if (word === 'titulo') {
    style.size = 34;
    style.weight = 700;
    style.tracking = -0.015;
    style.lineHeight = 1.18;
  } else if (word === 'subtitulo') {
    style.size = 20;
    style.weight = 600;
    style.tracking = 0;
    style.lineHeight = 1.3;
  }
}

export function defaultLayout() {
  return { dir: 'vertical', gap: 0, align: 'start', justify: 'start', columns: null, padding: 0 };
}

export function defaultGroupStyle() {
  return { ...defaultPanelStyle() };
}

export function defaultPanelStyle() {
  return {
    fill: null,
    material: null,
    stroke: null,
    radius: 0,
    shadow: null,
    opacity: 1,
    palette: null,
    style: null,
    padding: 0,
    size: { width: null, height: null, minHeight: null }
  };
}

export function defaultTextStyle() {
  return {
    size: 15,
    weight: 400,
    family: 'sans',
    color: null,
    align: 'left',
    lineHeight: 1.45,
    tracking: 0,
    uppercase: false,
    maxLines: null,
    opacity: 1,
    prefix: null
  };
}