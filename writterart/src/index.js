/**
 * WritterArt public API.
 *
 * WritterArt is not an image generator. It is a compiler for scene descriptions:
 * you (or a language model) write intent, a solver places it deterministically, and
 * a vector backend turns it into an SVG whose every element is addressable.
 */

export { tokenize } from './tokenize.js';
export { parse, defaultLayout, defaultPanelStyle, defaultTextStyle, defaultGroupStyle } from './parse.js';
export { validate, readFill, normaliseColor, hexToRgb, mixColors, materialFill } from './validate.js';
export { canonicalJSON, hashScene, hashLayout } from './hash.js';
export { solve } from './layout/solve.js';
export { measureText, wrapText } from './layout/measure.js';
export { buildDrawList } from './render/draw.js';
export { renderSvg } from './render/svg.js';
export { render, compile } from './render/index.js';
export { createRng } from './rng.js';
export { encodePng, writePng } from './png.js';
export { generateTexture, TEXTURE_KINDS } from './texture.js';

export {
  VOCABULARY,
  SPEC,
  CODES,
  MATERIALS,
  LIGHTS,
  PALETTES,
  STYLES,
  ICONS,
  ALIASES,
  CANVAS_PRESETS,
  FONT_STACKS,
  NODE_TYPES,
  materialNames,
  lightPresets,
  stylePresets,
  paletteNames,
  iconNames,
  nearest
} from './vocabulary.js';

/**
 * Lazily wired so that importing the package does not pay for the control-map
 * compiler, which is the heaviest module in the box.
 * @returns {typeof import('./controlmaps.js').compileControlMaps}
 */
export function compileControlMapsLazy() {
  return controlmaps.compileControlMaps;
}

let controlmaps = null;

/** @returns {Promise<typeof import('./controlmaps.js')>} */
export async function loadControlMaps() {
  if (!controlmaps) controlmaps = await import('./controlmaps.js');
  return controlmaps;
}