/**
 * Semantic validation and normalisation.
 *
 * This is the part of WritterArt a diffusion model can never copy: every message
 * carries a code, a path, a line, an actionable hint, and the closest valid words.
 * `validate()` never throws. It normalises the scene in place and reports.
 */

import {
  ALIGNMENTS,
  CODES,
  FONT_STACKS,
  GROUP_ALIGNS,
  JUSTIFY,
  ICONS,
  ICON_NAMES,
  LIGHTS,
  LIGHT_NAMES,
  MATERIALS,
  MATERIAL_NAMES,
  PALETTES,
  PALETTE_NAMES,
  STYLES,
  STYLE_NAMES,
  WEIGHTS,
  nearest
} from './vocabulary.js';

const MAX_DIMENSION = 8192;
const MIN_DIMENSION = 16;
const ALIGN_WORDS = Object.keys(ALIGNMENTS);
const JUSTIFY_WORDS = Object.keys(JUSTIFY);
const FAMILY_WORDS = Object.keys(FONT_STACKS);
const WEIGHT_WORDS = Object.keys(WEIGHTS);

/**
 * @param {object} scene parsed IR
 * @returns {{ ok:boolean, errors:object[], warnings:object[], theme:object }}
 */
export function validate(scene) {
  const ctx = {
    errors: [],
    warnings: [],
    ids: new Map()
  };

  if (!scene || typeof scene !== 'object') {
    push(ctx, { code: CODES.EMPTY_INPUT, message: 'no scene to validate', path: 'root', line: null, col: null, hint: 'Parse a scene first.', near: [] });
    return { ok: false, errors: ctx.errors, warnings: ctx.warnings, theme: null };
  }

  validateCanvas(scene, ctx);
  const theme = resolveTheme(scene, ctx);

  scene.theme = theme;
  scene.background = scene.background ? readFill(scene.background, theme, 'root.background', ctx) : colorFill(theme.colors.fondo);

  scene.light = resolveLight(scene.light, theme, ctx);
  if (scene.root) walk(scene.root, theme, ctx, true);

  if (!hasDrawable(scene.root)) {
    warn(ctx, CODES.EMPTY_SCENE, 'the scene has no drawable node, so the output would be blank', 'root', 'An empty canvas is valid but almost never what you meant. Add at least one text, panel, icon or image block.', []);
  }

  return { ok: ctx.errors.length === 0, errors: ctx.errors, warnings: ctx.warnings, theme };
}

// ------------------------------------------------------------------ canvas

function validateCanvas(scene, ctx) {
  const canvas = scene.canvas;
  if (!canvas || typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
    push(ctx, {
      code: CODES.MISSING_PROPERTY,
      message: 'canvas needs both a width and a height',
      path: 'canvas',
      line: scene.src?.line ?? 1,
      col: scene.src?.col ?? 1,
      hint: 'Write lienzo: "1200x630", or lienzo: og for a preset, or lienzo { ancho: 1200 alto: 630 }.',
      near: Object.keys({})
    });
    scene.canvas = { width: 1200, height: 630 };
    return;
  }
  for (const axis of ['width', 'height']) {
    const value = canvas[axis];
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
      push(ctx, {
        code: CODES.OUT_OF_RANGE,
        message: `canvas ${axis} ${value} is out of range`,
        path: `canvas.${axis}`,
        line: scene.src?.line ?? 1,
        col: scene.src?.col ?? 1,
        hint: `Canvas dimensions must be whole numbers between ${MIN_DIMENSION} and ${MAX_DIMENSION} pixels.`,
        near: []
      });
      canvas[axis] = axis === 'width' ? 1200 : 630;
    }
  }
}

// ------------------------------------------------------------------ theme

function resolveTheme(scene, ctx) {
  const styleName = scene.styleName;
  let style = null;
  if (styleName) {
    style = STYLES[styleName];
    if (!style) {
      push(ctx, {
        code: CODES.UNKNOWN_STYLE,
        message: `unknown style '${styleName}'`,
        path: 'root.estilo',
        line: scene.src?.line ?? 1,
        col: scene.src?.col ?? 1,
        hint: 'A style bundles a palette, a typeface, a size and a corner radius. Pick one of the known styles.',
        near: nearest(styleName, STYLE_NAMES)
      });
    }
  }
  const paletteName = scene.paletteName ?? style?.paleta ?? 'neutro';
  let palette = PALETTES[paletteName];
  if (!palette) {
    push(ctx, {
      code: CODES.UNKNOWN_PALETTE,
      message: `unknown palette '${paletteName}'`,
      path: 'root.paleta',
      line: scene.src?.line ?? 1,
      col: scene.src?.col ?? 1,
      hint: 'A palette is a set of named colours: fondo, superficie, tinta, tenue, acento, borde.',
      near: nearest(paletteName, PALETTE_NAMES)
    });
    palette = PALETTES.neutro;
  }
  const density = style?.densidad ?? 1;
  return {
    styleName: style ? styleName : null,
    paletteName,
    colors: { ...palette },
    family: style?.tipografia ?? 'sans',
    size: style?.tam ?? 15,
    radius: style?.radio ?? 0,
    shadowName: style?.sombra ?? 'suave',
    density,
    gapUnit: Math.round(12 * density),
    canvas: { width: scene.canvas.width, height: scene.canvas.height }
  };
}

// ------------------------------------------------------------------ light

function resolveLight(spec, theme, ctx) {
  const fallback = LIGHTS[theme.shadowName] ?? LIGHTS.suave;
  if (!spec) return { ...fallback };
  if (spec.preset !== undefined) {
    const light = LIGHTS[spec.preset];
    if (!light) {
      push(ctx, {
        code: CODES.UNKNOWN_LIGHT,
        message: `unknown light '${spec.preset}'`,
        path: 'root.luz',
        line: null,
        col: null,
        hint: 'A light controls the direction, softness and opacity of every shadow in the scene.',
        near: nearest(spec.preset, LIGHT_NAMES)
      });
      return { ...fallback };
    }
    return { ...light };
  }
  return {
    angle: typeof spec.angle === 'number' ? spec.angle : fallback.angle,
    blur: typeof spec.blur === 'number' ? spec.blur : fallback.blur,
    opacity: typeof spec.opacity === 'number' ? spec.opacity : fallback.opacity,
    color: normaliseColor(spec.color ?? fallback.color)
  };
}

// ------------------------------------------------------------------ walk

function walk(node, theme, ctx, isRoot) {
  if (!node) return;
  node.path = node.path ?? (isRoot ? 'root' : node.type);
  if (node.id) registerId(node, ctx);

  switch (node.type) {
    case 'group':
      normaliseGroup(node, theme, ctx, isRoot);
      node.children.forEach((child) => walk(child, theme, ctx, false));
      break;
    case 'panel':
    case 'image':
      normalisePanel(node, theme, ctx);
      node.children.forEach((child) => walk(child, theme, ctx, false));
      break;
    case 'text':
      normaliseText(node, theme, ctx);
      break;
    case 'icon':
      normaliseIcon(node, theme, ctx);
      break;
    default:
      push(ctx, {
        code: CODES.UNKNOWN_TYPE,
        message: `unknown node type '${node.type}'`,
        path: 'root',
        line: node.src?.line ?? null,
        col: node.src?.col ?? null,
        hint: 'Valid node types are group, panel, text, icon and image.',
        near: ['grupo', 'panel', 'texto', 'icono', 'imagen']
      });
  }
}

function normaliseGroup(node, theme, ctx, isRoot) {
  const path = node.path;
  const layout = node.layout;
  if (layout.columns !== null) {
    if (!Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 24) {
      push(ctx, bad(ctx, CODES.OUT_OF_RANGE, `${path}.columnas`, `column count ${layout.columns} is out of range`, node, 'Columns must be a whole number between 1 and 24.', []));
      layout.columns = null;
    }
  }
  if (!['vertical', 'horizontal'].includes(layout.dir)) layout.dir = 'vertical';
  if (!GROUP_ALIGNS[layout.align]) {
    push(ctx, bad(ctx, CODES.UNKNOWN_WORD, `${path}.alineacion`, `unknown alignment '${layout.align}'`, node, 'Align controls where children sit on the cross axis.', nearest(String(layout.align), Object.keys(GROUP_ALIGNS))));
    layout.align = 'start';
  } else {
    layout.align = GROUP_ALIGNS[layout.align];
  }
  if (!JUSTIFY[layout.justify]) {
    push(ctx, bad(ctx, CODES.UNKNOWN_WORD, `${path}.distribucion`, `unknown distribution '${layout.justify}'`, node, 'Distribution controls how children are spread along the main axis.', nearest(String(layout.justify), JUSTIFY_WORDS)));
    layout.justify = 'start';
  } else {
    layout.justify = JUSTIFY[layout.justify];
  }
  layout.gap = numberOr(layout.gap, 0);
  layout.padding = readPadding(layout.padding);
  if (isRoot) {
    const pad = layout.padding;
    if (pad.top === 0 && pad.right === 0 && pad.bottom === 0 && pad.left === 0) {
      const margin = Math.round(Math.min(72, Math.min(theme.canvas.width, theme.canvas.height) * 0.09));
      layout.padding = { top: margin, right: margin, bottom: margin, left: margin };
    }
  }
  normaliseStyle(node.style, theme, ctx, path, node);
  node.style.fill = node.style.fill ?? null;
}

function normalisePanel(node, theme, ctx) {
  normaliseStyle(node.style, theme, ctx, node.path, node);
  node.layout = node.layout ?? { dir: 'vertical', gap: Math.round(theme.gapUnit * 0.75), align: 'start', justify: 'start', columns: null, padding: 0 };
  node.layout.padding = readPadding(node.layout.padding);
  if (node.label !== null && node.label !== undefined && typeof node.label !== 'string') {
    push(ctx, bad(ctx, CODES.BAD_VALUE, `${node.path}.etiqueta`, 'label must be a string', node, 'Labels are plain text shown inside the placeholder.', []));
    node.label = null;
  }
}

function normaliseText(node, theme, ctx) {
  const path = node.path;
  const style = node.style;
  if (typeof node.text !== 'string') {
    push(ctx, bad(ctx, CODES.MISSING_PROPERTY, `${path}.texto`, 'text node has no content', node, 'Text blocks need their content as a quoted string.', []));
    node.text = '';
  }
  if (!Number.isFinite(style.size) || style.size <= 0) {
    push(ctx, bad(ctx, CODES.BAD_VALUE, `${path}.tam`, `font size ${style.size} is invalid`, node, 'Font sizes are positive numbers in pixels.', nearest(String(style.size), ['12', '15', '20', '34'])));
    style.size = theme.size;
  }
  if (typeof style.family === 'string' && !FONT_STACKS[style.family]) {
    push(ctx, bad(ctx, CODES.UNKNOWN_WORD, `${path}.tipografia`, `unknown typeface '${style.family}'`, node, 'Typefaces are stable font stacks, not font names, so the render is reproducible on any machine.', nearest(style.family, FAMILY_WORDS)));
    style.family = theme.family;
  }
  if (typeof style.weight === 'string') {
    const mapped = WEIGHTS[style.weight];
    if (!mapped) {
      push(ctx, bad(ctx, CODES.UNKNOWN_WORD, `${path}.peso`, `unknown weight '${style.weight}'`, node, 'Weights are named so the same source renders the same everywhere.', nearest(style.weight, WEIGHT_WORDS)));
      style.weight = 400;
    } else {
      style.weight = mapped;
    }
  }
  if (!Number.isFinite(style.weight)) style.weight = 400;
  style.color = themeColor(style.color, theme, ctx, `${path}.color`, node);
  if (!ALIGNMENTS[style.align]) {
    push(ctx, bad(ctx, CODES.UNKNOWN_WORD, `${path}.alineacion`, `unknown alignment '${style.align}'`, node, 'Text aligns izquierda, centro or derecha.', nearest(String(style.align), ALIGN_WORDS)));
    style.align = 'left';
  } else {
    style.align = ALIGNMENTS[style.align];
  }
  if (!Number.isFinite(style.lineHeight) || style.lineHeight <= 0) style.lineHeight = 1.45;
  if (!Number.isFinite(style.tracking)) style.tracking = 0;
  if (style.maxLines !== null && (!Number.isInteger(style.maxLines) || style.maxLines < 1)) {
    push(ctx, bad(ctx, CODES.BAD_VALUE, `${path}.lineas`, `max lines ${style.maxLines} is invalid`, node, 'Line limits are a whole number of 1 or more.', []));
    style.maxLines = null;
  }
  style.opacity = clamp(numberOr(style.opacity, 1), 0, 1);
}

function normaliseIcon(node, theme, ctx) {
  const path = node.path;
  if (!ICONS[node.icon]) {
    push(ctx, bad(ctx, CODES.UNKNOWN_ICON, `${path}.icono`, `unknown icon '${node.icon}'`, node, 'Icons come from a fixed geometric set drawn in a 24x24 box.', nearest(node.icon, ICON_NAMES)));
    node.icon = 'info';
  }
  node.style.size = numberOr(node.style.size, 24);
  if (node.style.size <= 0 || node.style.size > 512) {
    push(ctx, bad(ctx, CODES.OUT_OF_RANGE, `${path}.tam`, `icon size ${node.style.size} is out of range`, node, 'Icon sizes go from 8 to 512 pixels.', []));
    node.style.size = 24;
  }
  node.style.color = themeColor(node.style.color ?? theme.colors.acento, theme, ctx, `${path}.color`, node);
  node.style.opacity = clamp(numberOr(node.style.opacity, 1), 0, 1);
  node.style.align = GROUP_ALIGNS[node.style.align] ?? 'center';
}

/** Resolves a palette token (`acento`, `tenue`, `superficie`, ...) or a hex colour. */
function themeColor(value, theme, ctx, path, node) {
  if (typeof value === 'string' && !value.startsWith('#')) {
    const token = theme.colors[value.toLowerCase()];
    if (token) return normaliseColor(token);
    const material = MATERIALS[value.toLowerCase()];
    if (material && material.stops) return normaliseColor(material.stops[0][0]);
  }
  return normaliseColor(value, ctx, path, node);
}

function normaliseStyle(style, theme, ctx, path, node) {
  if (style.palette) {
    const palette = PALETTES[style.palette];
    if (!palette) {
      push(ctx, bad(ctx, CODES.UNKNOWN_PALETTE, `${path}.paleta`, `unknown palette '${style.palette}'`, node, 'A palette is a set of named colours.', nearest(style.palette, PALETTE_NAMES)));
    } else {
      theme.colors = { ...theme.colors, ...palette };
    }
    style.palette = null;
  }
  if (style.style) {
    const named = STYLES[style.style];
    if (!named) {
      push(ctx, bad(ctx, CODES.UNKNOWN_STYLE, `${path}.estilo`, `unknown style '${style.style}'`, node, 'Styles bundle a palette, a typeface and a radius.', nearest(style.style, STYLE_NAMES)));
    }
    style.style = null;
  }

  if (style.material !== null && style.material !== undefined) {
    const name = typeof style.material === 'string' ? style.material : null;
    if (!name || !MATERIALS[name]) {
      push(ctx, bad(ctx, CODES.UNKNOWN_MATERIAL, `${path}.material`, `unknown material '${describe(style.material)}'`, node, 'Materials are named gradient and pattern recipes. Call generateTexture for procedural surfaces.', name ? nearest(name, MATERIAL_NAMES) : []));
    } else {
      style.fill = style.fill ?? { material: name };
    }
    style.material = null;
  }

  if (style.fill) style.fill = readFill(style.fill, theme, `${path}.relleno`, ctx, node);
  else style.fill = null;

  if (style.stroke) {
    style.stroke.color = normaliseColor(style.stroke.color, ctx, `${path}.borde.color`, node);
    if (!Number.isFinite(style.stroke.width) || style.stroke.width < 0) {
      push(ctx, bad(ctx, CODES.BAD_VALUE, `${path}.borde.grosor`, 'stroke width must be 0 or more', node, 'Use grosor: 1 for a hairline border.', []));
      style.stroke.width = 1;
    }
  }
  style.radius = numberOr(style.radius, theme.radius);
  if (style.radius < 0) style.radius = 0;

  if (style.shadow) {
    if (style.shadow.preset) {
      const light = LIGHTS[style.shadow.preset];
      if (!light) {
        push(ctx, bad(ctx, CODES.UNKNOWN_LIGHT, `${path}.sombra`, `unknown shadow '${style.shadow.preset}'`, node, 'A shadow can be tuned by hand or named after a light preset.', nearest(style.shadow.preset, LIGHT_NAMES)));
        style.shadow = null;
      } else {
        const light2 = node.__light ?? LIGHTS.suave;
        style.shadow = {
          dx: Math.round(Math.cos((light.angle * Math.PI) / 180) * light.blur * 0.18),
          dy: Math.round(Math.sin((light.angle * Math.PI) / 180) * light.blur * 0.18),
          blur: light.blur,
          spread: 0,
          color: hexWithAlpha(light.color, light.opacity)
        };
      }
    } else {
      style.shadow.color = normaliseColor(style.shadow.color, ctx, `${path}.sombra.color`, node);
      for (const key of ['dx', 'dy', 'blur', 'spread']) style.shadow[key] = numberOr(style.shadow[key], 0);
      if (style.shadow.blur < 0) style.shadow.blur = 0;
    }
  }

  style.opacity = clamp(numberOr(style.opacity, 1), 0, 1);
  style.padding = readPadding(style.padding ?? 0);
  const size = style.size ?? {};
  size.width = size.width === null || size.width === undefined ? null : size.width;
  size.height = size.height === null || size.height === undefined ? null : size.height;
  size.minHeight = size.minHeight === null || size.minHeight === undefined ? null : size.minHeight;
  style.size = size;
}

// ------------------------------------------------------------------ fills

function colorFill(color, opacity = 1) {
  return { kind: 'color', color: normaliseColor(color), opacity };
}

/**
 * Normalises any accepted fill spelling into one of the four Fill shapes.
 * @returns {object|null}
 */
export function readFill(raw, theme, path, ctx, node) {
  if (!raw) return null;
  if (raw.kind && ['none', 'color', 'linear', 'radial', 'material'].includes(raw.kind)) return raw;

  if (raw.__raw !== undefined) {
    const value = raw.__raw;
    if (typeof value === 'string') {
      if (MATERIALS[value]) return materialFill(value, theme);
      if (value.startsWith('#')) return colorFill(value);
      const paletteKey = theme.colors[value];
      if (paletteKey) return colorFill(paletteKey);
      push(ctx, bad(ctx, CODES.UNKNOWN_MATERIAL, path, `unknown fill '${value}'`, node, 'Fills are a material name, a hex colour, a palette token or a gradient call.', nearest(value, [...MATERIAL_NAMES, ...Object.keys(theme.colors)])));
      return colorFill(theme.colors.fondo);
    }
    return colorFill(theme.colors.fondo);
  }

  if (raw.__call !== undefined) {
    const [a, b, c, d] = raw.args;
    switch (raw.__call) {
      case 'gradiente':
        return gradientFill(a, b, c, theme, path, ctx, node);
      case 'radial':
        return radialFill(a, b, theme, path, ctx, node);
      case 'rgb':
        return colorFill(rgbToHex(a, b, c));
      case 'mezcla':
        return colorFill(mixColors(String(a), String(b), typeof c === 'number' ? c : 0.5));
      default:
        push(ctx, bad(ctx, CODES.UNKNOWN_FUNCTION, path, `unknown fill function '${raw.__call}'`, node, 'Fill functions are gradiente, radial, rgb and mezcla.', nearest(raw.__call, ['gradiente', 'radial', 'rgb', 'mezcla'])));
        return colorFill(theme.colors.fondo);
    }
  }

  if (raw.__map) {
    const map = raw.__map;
    const color = pick(map, 'color');
    const second = pick(map, 'color2') ?? pick(map, 'color_fin');
    if (color && second) return gradientFill(pick(map, 'angulo'), color, second, theme, path, ctx, node);
    if (color) return colorFill(color);
    if (pick(map, 'material')) return materialFill(String(pick(map, 'material')), theme);
    push(ctx, bad(ctx, CODES.BAD_VALUE, path, 'fill block needs color, or color plus color2', node, 'Write relleno: grafito, or relleno: { color: "#111" color2: "#333" angulo: 90 }.', []));
    return colorFill(theme.colors.fondo);
  }

  return null;
}

function gradientFill(angle, from, to, theme, path, ctx, node) {
  const stops = [
    { offset: 0, color: normaliseColor(typeof from === 'string' ? from : theme.colors.fondo, ctx, `${path}.color`, node) },
    { offset: 1, color: normaliseColor(typeof to === 'string' ? to : theme.colors.superficie, ctx, `${path}.color2`, node) }
  ];
  return { kind: 'linear', angle: typeof angle === 'number' ? angle : 90, stops };
}

function radialFill(inner, outer, theme, path, ctx, node) {
  return {
    kind: 'radial',
    cx: 0.5,
    cy: 0.5,
    r: 0.75,
    stops: [
      { offset: 0, color: normaliseColor(typeof inner === 'string' ? inner : theme.colors.fondo, ctx, `${path}.color`, node) },
      { offset: 1, color: normaliseColor(typeof outer === 'string' ? outer : theme.colors.borde, ctx, `${path}.color2`, node) }
    ]
  };
}

export function materialFill(name, theme) {
  const material = MATERIALS[name];
  if (!material) return colorFill(theme.colors.fondo);
  if (material.kind === 'radial') {
    return {
      kind: 'radial',
      cx: material.cx,
      cy: material.cy,
      r: material.r,
      stops: material.stops.map(([color, offset]) => ({ offset, color: normaliseColor(color) }))
    };
  }
  if (material.kind === 'pattern') {
    return {
      kind: 'pattern',
      pattern: material.pattern,
      size: material.size,
      fg: normaliseColor(material.fg),
      bg: normaliseColor(material.bg),
      width: material.width ?? 1,
      opacity: material.opacity ?? 1
    };
  }
  return {
    kind: 'linear',
    angle: material.angle ?? 90,
    stops: material.stops.map(([color, offset]) => ({ offset, color: normaliseColor(color) }))
  };
}

function pick(map, key) {
  const entry = map[key];
  if (!entry) return null;
  return entry.value;
}

// ------------------------------------------------------------------ colours

/** @returns {string} lowercase `#rgb`, `#rrggbb` or `#rrggbbaa` */
export function normaliseColor(value, ctx, path, node) {
  if (typeof value !== 'string') return '#000000';
  let hex = value.trim();
  if (!hex.startsWith('#')) {
    if (/^[0-9a-fA-F]{6}$/.test(hex)) hex = `#${hex}`;
    else {
      if (ctx) push(ctx, bad(ctx, CODES.BAD_VALUE, path ?? 'color', `'${value}' is not a colour`, node, 'Colours are hex strings like #1a2b3c, or a palette token such as acento.', []));
      return '#000000';
    }
  }
  const body = hex.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(body)) {
    return `#${body.split('').map((c) => c + c).join('')}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{4}$/.test(body)) {
    const [r, g, b, a] = body.split('');
    return `#${r}${r}${g}${g}${b}${b}${a}${a}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(body) || /^[0-9a-fA-F]{8}$/.test(body)) return hex.toLowerCase();
  if (ctx) push(ctx, bad(ctx, CODES.BAD_VALUE, path ?? 'color', `'${value}' is not a valid hex colour`, node, 'Valid forms are #rgb, #rgba, #rrggbb and #rrggbbaa.', []));
  return '#000000';
}

function rgbToHex(r, g, b) {
  const clampByte = (v) => Math.max(0, Math.min(255, Math.round(typeof v === 'number' ? v : 0)));
  return `#${[clampByte(r), clampByte(g), clampByte(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full = clean.length === 3 || clean.length === 4 ? clean.split('').map((c) => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  };
}

export function mixColors(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mix = (x, y) => Math.round(x + (y - x) * clamp(t, 0, 1));
  return rgbToHex(mix(ca.r, cb.r), mix(ca.g, cb.g), mix(ca.b, cb.b));
}

function hexWithAlpha(color, opacity) {
  const { r, g, b } = hexToRgb(color);
  const a = Math.round(clamp(opacity, 0, 1) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}${a.toString(16).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ misc

function readPadding(value) {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  if (value && value.__map) {
    const map = value.__map;
    const all = typeof pick(map, 'todos') === 'number' ? pick(map, 'todos') : 0;
    const read = (key) => (typeof pick(map, key) === 'number' ? pick(map, key) : all);
    return { top: read('arriba'), right: read('derecha'), bottom: read('abajo'), left: read('izquierda') };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function registerId(node, ctx) {
  const id = node.id;
  if (typeof id !== 'string' || !id) return;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    push(ctx, bad(ctx, CODES.RESERVED_ID, node.path, `id '${id}' is not a valid identifier`, node, 'Ids must start with a letter and use only letters, digits, dash and underscore. Ids become element ids in the SVG.', []));
    return;
  }
  if (this === undefined) return;
  if (ctx.ids.has(id)) {
    push(ctx, bad(ctx, CODES.DUPLICATE_ID, node.path, `id '${id}' is already used`, node, 'Ids have to be unique inside one scene because they become element ids in the output.', [ctx.ids.get(id)]));
    return;
  }
  ctx.ids.set(id, node.path);
}

function hasDrawable(node) {
  if (!node) return false;
  if (['text', 'icon', 'image', 'panel'].includes(node.type)) return true;
  return (node.children ?? []).some(hasDrawable);
}

function bad(_ctx, code, path, message, node, hint, near) {
  return {
    code,
    message,
    path,
    line: node?.src?.line ?? null,
    col: node?.src?.col ?? null,
    hint,
    near
  };
}

function push(ctx, diagnostic) {
  ctx.errors.push(diagnostic);
}

function warn(ctx, code, message, path, hint, near) {
  ctx.warnings.push({ code, message, path, line: null, col: null, hint, near });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function describe(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}