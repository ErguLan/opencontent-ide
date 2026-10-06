/**
 * WritterArt vocabulary — the single registry of every valid word in the language.
 *
 * This module IS the spec. `validate()` never hardcodes a name; it always asks this
 * registry. Adding a material here makes it legal everywhere at once.
 */

/** Diagnostic codes. Stable machine vocabulary; never translated, never reused. */
export const CODES = Object.freeze({
  SYNTAX: 'SYNTAX',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  UNEXPECTED_END: 'UNEXPECTED_END',
  EMPTY_INPUT: 'EMPTY_INPUT',
  UNKNOWN_WORD: 'UNKNOWN_WORD',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  UNKNOWN_MATERIAL: 'UNKNOWN_MATERIAL',
  UNKNOWN_LIGHT: 'UNKNOWN_LIGHT',
  UNKNOWN_STYLE: 'UNKNOWN_STYLE',
  UNKNOWN_PALETTE: 'UNKNOWN_PALETTE',
  UNKNOWN_ICON: 'UNKNOWN_ICON',
  UNKNOWN_PROPERTY: 'UNKNOWN_PROPERTY',
  UNKNOWN_FUNCTION: 'UNKNOWN_FUNCTION',
  MISSING_PROPERTY: 'MISSING_PROPERTY',
  BAD_VALUE: 'BAD_VALUE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  DUPLICATE_ID: 'DUPLICATE_ID',
  RESERVED_ID: 'RESERVED_ID',
  EMPTY_SCENE: 'EMPTY_SCENE',
  DUPLICATE_CANVAS: 'DUPLICATE_CANVAS'
});

export const CANVAS_PRESETS = Object.freeze({
  og: { width: 1200, height: 630 },
  cuadrado: { width: 1024, height: 1024 },
  retrato: { width: 1080, height: 1350 },
  historia: { width: 1080, height: 1920 },
  pantalla: { width: 1920, height: 1080 },
  documento: { width: 1240, height: 1754 },
  banner: { width: 1500, height: 500 },
  tarjeta: { width: 640, height: 400 },
  avatar: { width: 512, height: 512 }
});

/**
 * Materials. v0.1 materials are honest: they are gradient / pattern recipes that the
 * vector backend expands. There is no PBR here and the docs never claim otherwise.
 *
 * angle: degrees, 0 = left->right, 90 = top->bottom.
 */
export const MATERIALS = Object.freeze({
  papel: { angle: 90, stops: [['#ffffff', 0], ['#f4f2ee', 1]], text: '#141414', accent: '#c2410c' },
  lino: { angle: 90, stops: [['#f7f3ec', 0], ['#e9e2d6', 1]], text: '#1c1a17', accent: '#7c5c3a' },
  tinta: { angle: 90, stops: [['#111418', 0], ['#05070a', 1]], text: '#f2f5f8', accent: '#38bdf8' },
  grafito: { angle: 90, stops: [['#2a2f36', 0], ['#171a1f', 1]], text: '#e8edf2', accent: '#9aa7b4' },
  pizarra: { angle: 90, stops: [['#1d2b34', 0], ['#0d161c', 1]], text: '#e6f2f7', accent: '#5eead4' },
  cristal: { angle: 115, stops: [['#e8f4fb', 0], ['#b6cfe0', 0.55], ['#8fa9bd', 1]], text: '#12222c', accent: '#0369a1' },
  metal: { angle: 100, stops: [['#cfd6dd', 0], ['#f2f5f8', 0.28], ['#8e99a6', 0.62], ['#c3ccd4', 1]], text: '#101418', accent: '#475569' },
  bronce: { angle: 100, stops: [['#7a4a21', 0], ['#e0a866', 0.4], ['#8a5223', 0.78], ['#d8a06a', 1]], text: '#20120a', accent: '#f59e0b' },
  cobre: { angle: 100, stops: [['#5c2c17', 0], ['#d1794f', 0.45], ['#7a3a1e', 1]], text: '#1c0d07', accent: '#fb923c' },
  niebla: { angle: 90, stops: [['#dfe6ec', 0], ['#aebbc7', 1]], text: '#1b232b', accent: '#64748b' },
  atardecer: { angle: 90, stops: [['#2a1636', 0], ['#b4483c', 0.55], ['#f2a25c', 1]], text: '#fff6ec', accent: '#ffe08a' },
  amanecer: { angle: 90, stops: [['#132a4a', 0], ['#5d6f9c', 0.5], ['#f0b6a4', 1]], text: '#f8fafc', accent: '#ffd6a5' },
  mediodia: { angle: 90, stops: [['#fdfdfe', 0], ['#dfe6ee', 1]], text: '#0b1220', accent: '#0284c7' },
  noche: { angle: 90, stops: [['#050b1c', 0], ['#132a52', 0.6], ['#2d1b47', 1]], text: '#e8eefc', accent: '#818cf8' },
  ocaso: { angle: 90, stops: [['#1b1035', 0], ['#5b2a6b', 0.5], ['#a03f6a', 1]], text: '#fdeaf3', accent: '#f9a8d4' },
  bosque: { angle: 90, stops: [['#0c1a12', 0], ['#1c3b26', 0.55], ['#3f6b45', 1]], text: '#e8f5ec', accent: '#86efac' },
  magma: { angle: 90, stops: [['#1b0a06', 0], ['#7c2d12', 0.55], ['#f59e0b', 1]], text: '#fff1e0', accent: '#fcd34d' },
  arena: { angle: 90, stops: [['#f3e9d8', 0], ['#d9c4a3', 1]], text: '#2a2013', accent: '#a16207' },
  vinieta: { kind: 'radial', cx: 0.5, cy: 0.5, r: 0.78, stops: [['#000000', 0], ['#00000000', 1]] },
  foco: { kind: 'radial', cx: 0.5, cy: 0.42, r: 0.62, stops: [['#ffffff', 0], ['#ffffff00', 1]] },
  malla: { kind: 'pattern', pattern: 'malla', size: 24, fg: '#ffffff', bg: '#00000000', width: 1, opacity: 0.16 },
  trama: { kind: 'pattern', pattern: 'puntos', size: 18, fg: '#ffffff', bg: '#00000000', opacity: 0.28 },
  rayas: { kind: 'pattern', pattern: 'rayas', size: 16, fg: '#ffffff', bg: '#00000000', opacity: 0.14 },
  ondas: { kind: 'pattern', pattern: 'ondas', size: 28, fg: '#ffffff', bg: '#00000000', opacity: 0.2 }
});

/** Lights. A light is not decoration: it casts every shadow in the scene at one angle. */
export const LIGHTS = Object.freeze({
  suave: { angle: 90, blur: 48, opacity: 0.18, color: '#000000' },
  difusa: { angle: 90, blur: 72, opacity: 0.12, color: '#0b1220' },
  dura: { angle: 90, blur: 3, opacity: 0.42, color: '#000000' },
  lateral: { angle: 0, blur: 28, opacity: 0.3, color: '#05070a' },
  contrapluz: { angle: 45, blur: 64, opacity: 0.28, color: '#141b2e' },
  cenital: { angle: 270, blur: 40, opacity: 0.24, color: '#000000' },
  sin_sombra: { angle: 90, blur: 0, opacity: 0, color: '#000000' }
});

/** Palettes. Named token sets, applied by a style or referenced directly. */
export const PALETTES = Object.freeze({
  neutro: { fondo: '#ffffff', superficie: '#f4f5f7', tinta: '#111418', tenue: '#6b7280', acento: '#2563eb', borde: '#e3e6ea' },
  tinta: { fondo: '#0b0e12', superficie: '#161b22', tinta: '#e9eef4', tenue: '#8b949e', acento: '#58a6ff', borde: '#2b313a' },
  ardoiz: { fondo: '#101827', superficie: '#1b2436', tinta: '#e8edf7', tenue: '#8fa0bd', acento: '#5eead4', borde: '#28324a' },
  ambar: { fondo: '#1b1206', superficie: '#2c1e0a', tinta: '#fdf3e3', tenue: '#c2a274', acento: '#fbbf24', borde: '#3d2a10' },
  bosque: { fondo: '#0b1610', superficie: '#15271c', tinta: '#e9f6ed', acento: '#4ade80', tenue: '#8aa898', borde: '#1f3a2a' },
  atardecer: { fondo: '#22101c', superficie: '#3a1a26', tinta: '#fdeef2', tenue: '#c99aa6', acento: '#fb7185', borde: '#4d2531' }
});

/** Styles are named token bundles: palette + typography + corner + shadow defaults. */
export const STYLES = Object.freeze({
  editorial: { paleta: 'papel', tipografia: 'serif', tam: 15, radio: 2, sombra: 'suave', densidad: 1 },
  oscuro: { paleta: 'tinta', tipografia: 'sans', tam: 15, radio: 10, sombra: 'difusa', densidad: 1 },
  ardoiz: { paleta: 'ardoiz', tipografia: 'sans', tam: 14, radio: 12, sombra: 'difusa', densidad: 1.1 },
  tecnico: { paleta: 'tinta', tipografia: 'mono', tam: 13, radio: 6, sombra: 'dura', densidad: 0.9 },
  informe: { paleta: 'neutro', tipografia: 'sans', tam: 13, radio: 4, sombra: 'suave', densidad: 1.2 },
  cartel: { paleta: 'ambar', tipografia: 'display', tam: 17, radio: 0, sombra: 'dura', densidad: 0.8 },
  neon: { paleta: 'bosque', tipografia: 'mono', tam: 14, radio: 8, sombra: 'contrapluz', densidad: 1 },
  limpio: { paleta: 'neutro', tipografia: 'sans', tam: 15, radio: 16, sombra: 'difusa', densidad: 1.15 }
});

export const FONT_STACKS = Object.freeze({
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace",
  display: "'Archivo Black', 'Helvetica Neue', Impact, system-ui, sans-serif"
});

export const WEIGHTS = Object.freeze({
  normal: 400, medio: 500, semi: 600, negrita: 700, fuerte: 800, negro: 900
});

/** Text / inline alignment. Spanish is canonical, English words are accepted. */
export const ALIGNMENTS = Object.freeze({
  izquierda: 'left',
  centro: 'center',
  derecha: 'right',
  start: 'left',
  left: 'left',
  center: 'center',
  right: 'right',
  end: 'right'
});

/** Cross-axis alignment inside a container. */
export const GROUP_ALIGNS = Object.freeze({
  izquierda: 'start',
  start: 'start',
  inicio: 'start',
  centro: 'center',
  center: 'center',
  derecha: 'end',
  end: 'end',
  fin: 'end',
  estirar: 'stretch',
  stretch: 'stretch'
});

/** Main-axis distribution inside a container. */
export const JUSTIFY = Object.freeze({
  inicio: 'start',
  start: 'start',
  izquierda: 'start',
  centro: 'center',
  center: 'center',
  fin: 'end',
  end: 'end',
  derecha: 'end',
  entre: 'between',
  between: 'between'
});

export const DIRECTIONS = Object.freeze({ vertical: 'vertical', horizontal: 'horizontal' });

export const NODE_TYPES = Object.freeze(['grupo', 'fila', 'columna', 'panel', 'texto', 'titulo', 'subtitulo', 'icono', 'imagen']);

/**
 * Icons. 24x24 viewBox, single-path, geometric. No emoji, ever.
 */
export const ICONS = Object.freeze({
  check: 'M4 12.5 L9.5 18 L20 6',
  cruz: 'M5 5 L19 19 M19 5 L5 19',
  mas: 'M12 5 L12 19 M5 12 L19 12',
  menos: 'M5 12 L19 12',
  flecha_derecha: 'M4 12 L18 12 M12 6 L18 12 L12 18',
  flecha_izquierda: 'M20 12 L6 12 M12 6 L6 12 L12 18',
  flecha_arriba: 'M12 20 L12 6 M6 12 L12 6 L18 12',
  flecha_abajo: 'M12 4 L12 18 M6 12 L12 18 L18 12',
  play: 'M8 5 L19 12 L8 19 Z',
  alerta: 'M12 3 L22 20 L2 20 Z M12 10 L12 14 M12 17 L12 17.5',
  info: 'M12 3 A9 9 0 1 0 12.01 3 Z M12 11 L12 16 M12 8 L12 8.5',
  busqueda: 'M11 4 A7 7 0 1 0 11.01 4 Z M16 16 L21 21',
  engranaje: 'M12 8.5 A3.5 3.5 0 1 0 12.01 8.5 Z M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12',
  candado: 'M6 11 L18 11 L18 21 L6 21 Z M8.5 11 L8.5 8 A3.5 3.5 0 0 1 15.5 8 L15.5 11',
  rayo: 'M13 2 L5 13 L11 13 L10 22 L19 10 L13 10 Z',
  sol: 'M12 8 A4 4 0 1 0 12.01 8 Z M12 1 L12 4 M12 20 L12 23 M1 12 L4 12 M20 12 L23 12 M4.5 4.5 L6.5 6.5 M17.5 17.5 L19.5 19.5 M19.5 4.5 L17.5 6.5 M6.5 17.5 L4.5 19.5',
  luna: 'M20 14 A9 9 0 1 1 10 3 A7 7 0 0 0 20 14 Z',
  estrella: 'M12 3 L14.5 9.5 L21 9.5 L16 13.5 L18 20.5 L12 16.5 L6 20.5 L8 13.5 L3 9.5 L9.5 9.5 Z',
  corazon: 'M12 20 C4 15 3 10 5.5 7 C8 4 11 5.5 12 8 C13 5.5 16 4 18.5 7 C21 10 20 15 12 20 Z',
  codigo: 'M9 6 L3 12 L9 18 M15 6 L21 12 L15 18',
  terminal: 'M3 4 L21 4 L21 20 L3 20 Z M7 9 L10.5 12.5 L7 16 M13 16 L18 16',
  base: 'M12 3 C12 3 4 10 4 14.5 A8 8 0 0 0 20 14.5 C20 10 12 3 12 3 Z',
  nube: 'M7 18 A4.5 4.5 0 0 1 6.5 9 A6 6 0 0 1 18 10.5 A4 4 0 0 1 17.5 18 Z',
  descarga: 'M12 3 L12 15 M7 10 L12 15 L17 10 M4 20 L20 20',
  enlace: 'M10 14 A4 4 0 0 0 14 14 L18 10 A4 4 0 0 0 12 4 L10.5 5.5 M14 10 A4 4 0 0 0 10 10 L6 14 A4 4 0 0 0 12 20 L13.5 18.5',
  filtro: 'M3 5 L21 5 L14 13 L14 20 L10 17.5 L10 13 Z',
  etiqueta: 'M3 11 L11 3 L21 3 L21 13 L13 21 Z M16.5 7.5 L16.6 7.5',
  grafico: 'M3 21 L21 21 M6 21 L6 12 M11 21 L11 7 M16 21 L16 14 M21 21 L21 4',
  equipo: 'M8 8 A3 3 0 1 0 8.01 8 Z M2 20 A6 6 0 0 1 14 20 M16 5.5 A2.5 2.5 0 1 0 16.01 5.5 Z M13 20 A5 5 0 0 1 22 20',
  velocidad: 'M3 18 A9 9 0 0 1 21 18 L17 18 A5 5 0 0 0 7 18 Z M12 14 L16.5 8',
  globo: 'M12 3 A9 9 0 1 0 12.01 3 Z M3 12 L21 12 M12 3 C15 6.5 15 17.5 12 21 C9 17.5 9 6.5 12 3',
  capas: 'M12 3 L21 8 L12 13 L3 8 Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16',
  menu: 'M4 7 L20 7 M4 12 L20 12 M4 17 L20 17',
  documento: 'M6 3 L14 3 L18 7 L18 21 L6 21 Z M14 3 L14 7 L18 7 M9 12 L15 12 M9 16 L15 16',
  calendario: 'M4 6 L20 6 L20 21 L4 21 Z M4 10 L20 10 M8 3 L8 7 M16 3 L16 7',
  objetivo: 'M12 5 A7 7 0 1 0 12.01 5 Z M12 9.5 A2.5 2.5 0 1 0 12.01 9.5 Z M12 1 L12 4 M12 20 L12 23 M1 12 L4 12 M20 12 L23 12',
  chispa: 'M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z'
});

/**
 * Surface-syntax aliases. Spanish is canonical; these are the words a model will reach
 * for anyway. Aliases are resolved at parse time, so the IR only ever holds canonical
 * names and the validator never has to think about them.
 */
export const ALIASES = Object.freeze({
  escena: 'escena', scene: 'escena',
  lienzo: 'lienzo', canvas: 'lienzo', tamano_lienzo: 'lienzo',
  grupo: 'grupo', group: 'grupo', caja: 'grupo', box: 'grupo',
  fila: 'fila', row: 'fila',
  columna: 'columna', column: 'columna', col: 'columna',
  panel: 'panel', caja_texto: 'panel', card: 'panel', tarjeta: 'panel', bloque: 'panel',
  texto: 'texto', text: 'texto', parrafo: 'texto', parrafo_: 'texto',
  titulo: 'titulo', title: 'titulo', headline: 'titulo', encabezado: 'titulo',
  subtitulo: 'subtitulo', subtitle: 'subtitulo', subhead: 'subtitulo',
  icono: 'icono', icon: 'icono',
  imagen: 'imagen', image: 'imagen', foto: 'imagen', marcador: 'imagen', placeholder: 'imagen',

  id: 'id', nombre: 'id',
  estilo: 'estilo', style: 'estilo',
  paleta: 'paleta', palette: 'paleta',
  luz: 'luz', light: 'luz', iluminacion: 'luz', lighting: 'luz',
  fondo: 'fondo', background: 'fondo', bg: 'fondo',

  direccion: 'direccion', direction: 'direccion', dir: 'direccion', orientacion: 'direccion',
  columnas: 'columnas', columns: 'columnas', cols: 'columnas',
  espacio: 'espacio', gap: 'espacio', separacion: 'espacio', spacing: 'espacio',
  alineacion: 'alineacion', align: 'alineacion',
  distribucion: 'distribucion', justify: 'distribucion', justificado: 'distribucion',
  padding: 'padding', relleno_interno: 'padding', margen_interno: 'padding', padding_interno: 'padding',

  ancho: 'ancho', width: 'ancho', w: 'ancho',
  alto: 'alto', height: 'alto', h: 'alto',
  min_alto: 'min_alto', min_height: 'min_alto',

  relleno: 'relleno', fill: 'relleno', fondo_caja: 'relleno', background_fill: 'relleno',
  material: 'material', material_: 'material',
  color: 'color', color_: 'color', tinta: 'color',
  opacidad: 'opacidad', opacity: 'opacidad', alfa: 'opacidad', alpha: 'opacidad',

  borde: 'borde', stroke: 'borde', contorno: 'borde', outline: 'borde',
  grosor: 'grosor', stroke_width: 'grosor', grosor_borde: 'grosor',
  puntos: 'puntos', dash: 'puntos', dasharray: 'puntos',
  radio: 'radio', radius: 'radio', redondeo: 'radio', border_radius: 'radio',

  sombra: 'sombra', shadow: 'sombra',
  difuminado: 'difuminado', blur: 'difuminado', sigma: 'difuminado',
  x: 'x', dx: 'x',
  y: 'y', dy: 'y',
  extension: 'extension', spread: 'extension',

  tam: 'tam', size: 'tam', font_size: 'tam', tamano_fuente: 'tam', tamano: 'tam',
  peso: 'peso', weight: 'peso', font_weight: 'peso',
  tipografia: 'tipografia', font: 'tipografia', font_family: 'tipografia', familia: 'tipografia', typeface: 'tipografia',
  interlineado: 'interlineado', line_height: 'interlineado', leading: 'interlineado',
  tracking: 'tracking', letter_spacing: 'tracking', espaciado: 'tracking',
  mayusculas: 'mayusculas', uppercase: 'mayusculas', caps: 'mayusculas',
  lineas: 'lineas', max_lines: 'lineas', maxlines: 'lineas',
  prefijo: 'prefijo', prefix: 'prefijo',
  etiqueta: 'etiqueta', label: 'etiqueta',
  angulo: 'angulo', angle: 'angulo', angulo_gradiente: 'angulo'
});

/** Value-level helpers callable in expression position: `gradiente(90, '#a', '#b')`. */
export const FUNCTIONS = Object.freeze({
  gradiente: 'gradiente',
  degrade: 'gradiente',
  gradient: 'gradiente',
  radial: 'radial',
  rgb: 'rgb',
  hex: 'hex',
  mezcla: 'mezcla',
  mix: 'mezcla',
  sombra: 'sombra',
  borde: 'borde',
  mayusculas: 'mayusculas',
  tracking: 'tracking',
  interlineado: 'interlineado',
  lineas: 'lineas',
  icono: 'icono',
  ancho: 'ancho',
  alto: 'alto'
});

export const MATERIAL_NAMES = Object.freeze(Object.keys(MATERIALS));
export const LIGHT_NAMES = Object.freeze(Object.keys(LIGHTS));
export const STYLE_NAMES = Object.freeze(Object.keys(STYLES));
export const PALETTE_NAMES = Object.freeze(Object.keys(PALETTES));
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** Property table per node type. The validator reads this; nothing else hardcodes keys. */
export const PROPERTIES = Object.freeze({
  grupo: new Set(['id', 'direccion', 'columnas', 'espacio', 'alineacion', 'distribucion', 'padding', 'ancho', 'alto', 'min_alto', 'relleno', 'borde', 'radio', 'sombra', 'opacidad', 'estilo', 'paleta']),
  panel: new Set(['id', 'relleno', 'material', 'borde', 'radio', 'sombra', 'opacidad', 'ancho', 'alto', 'min_alto', 'padding', 'texto', 'estilo', 'paleta']),
  texto: new Set(['id', 'tam', 'peso', 'tipografia', 'color', 'alineacion', 'interlineado', 'tracking', 'mayusculas', 'lineas', 'opacidad', 'prefijo', 'estilo']),
  titulo: new Set(['id', 'tam', 'peso', 'tipografia', 'color', 'alineacion', 'interlineado', 'tracking', 'mayusculas', 'lineas', 'opacidad', 'prefijo', 'estilo']),
  subtitulo: new Set(['id', 'tam', 'peso', 'tipografia', 'color', 'alineacion', 'interlineado', 'tracking', 'mayusculas', 'lineas', 'opacidad', 'prefijo', 'estilo']),
  icono: new Set(['id', 'tam', 'color', 'opacidad', 'alineacion']),
  imagen: new Set(['id', 'etiqueta', 'relleno', 'material', 'borde', 'radio', 'sombra', 'opacidad', 'ancho', 'alto', 'texto', 'estilo', 'paleta'])
});

export const SHAPE_KEYS = new Set(['ancho', 'alto', 'min_alto', 'relleno', 'material', 'borde', 'radio', 'sombra', 'opacidad', 'padding', 'texto', 'estilo', 'paleta']);

export const SPEC = Object.freeze({
  name: 'WritterArt',
  version: '0.1',
  extension: '.wrt',
  grammar: [
    'escena <string>? { <statement>* }',
    'group    := (grupo|fila|columna) <string>? <layout>? { <statement>* }',
    'panel    := panel { <property>* }',
    'text     := (texto|subtitulo) <string> { <property>* }',
    'title    := titulo <string> { <property>* }',
    'icon     := icono <string> { <property>* }',
    'image    := imagen { <property>* }',
    'layout   := vertical | horizontal',
    'property := <ident> ":" <value> | <ident> "(" <args> ")"',
    'value    := <number> | <string> | <bool> | #hex | <call> | [<value>, ...] | { <property>* }',
    'call     := gradiente(angulo, color, color) | radial(color, color) | rgb(r,g,b)',
    '           | mezcla(colorA, colorB, 0..1) | sombra({...}) | borde({...})',
    '           | mayusculas() | tracking(n) | interlineado(n) | lineas(n)',
    'top level:= lienzo | estilo | paleta | luz | fondo | statement'
  ].join('\n')
});

/** Levenshtein-based "did you mean", capped and sorted. Used for every `near` list. */
export function nearest(input, candidates, max = 3, maxDistance = 4) {
  const target = String(input).toLowerCase();
  const scored = [];
  for (const candidate of candidates) {
    const d = editDistance(target, candidate);
    if (d <= maxDistance) scored.push({ candidate, d });
  }
  scored.sort((a, b) => (a.d - b.d) || (a.candidate < b.candidate ? -1 : 1));
  return scored.slice(0, max).map((s) => s.candidate);
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

export const VOCABULARY = Object.freeze({
  CODES,
  CANVAS_PRESETS,
  MATERIALS,
  LIGHTS,
  PALETTES,
  STYLES,
  FONT_STACKS,
  WEIGHTS,
  ALIGNMENTS,
  DIRECTIONS,
  NODE_TYPES,
  ICONS,
  ALIASES,
  FUNCTIONS,
  PROPERTIES,
  SPEC
});

export const materialNames = () => MATERIAL_NAMES.slice();
export const lightPresets = () => LIGHT_NAMES.slice();
export const stylePresets = () => STYLE_NAMES.slice();
export const paletteNames = () => PALETTE_NAMES.slice();
export const iconNames = () => ICON_NAMES.slice();