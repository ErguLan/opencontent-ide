/**
 * One call: source text in, SVG out, diagnostics included. Never throws.
 */

import { parse } from '../parse.js';
import { validate } from '../validate.js';
import { solve } from '../layout/solve.js';
import { buildDrawList } from './draw.js';
import { renderSvg } from './svg.js';
import { hashScene } from '../hash.js';

/**
 * @param {string|object} source `.wrt` text, or an already parsed scene
 * @param {{ seed?:number, pretty?:boolean }} [options]
 * @returns {{ ok:boolean, svg:string|null, layout:object|null, scene:object|null,
 *            errors:object[], warnings:object[], hash:string|null }}
 */
export function render(source, options = {}) {
  let scene = null;
  let errors = [];

  if (source && typeof source === 'object') {
    scene = source;
  } else {
    const parsed = parse(String(source ?? ''));
    errors = parsed.errors;
    scene = parsed.scene;
    if (!scene) return { ok: false, svg: null, layout: null, scene: null, errors, warnings: [], hash: null };
  }

  const result = validate(scene);
  errors = errors.concat(result.errors);
  const warnings = result.warnings;

  if (!scene) return { ok: false, svg: null, layout: null, scene: null, errors, warnings, hash: null };

  const hash = hashScene(scene);
  if (errors.length) return { ok: false, svg: null, layout: null, scene, errors, warnings, hash };

  const layout = solve(scene, { seed: options.seed ?? 1 });
  const draw = buildDrawList(layout);
  const svg = renderSvg(layout, { pretty: options.pretty !== false });
  layout.draw = draw;

  return { ok: true, svg, layout, scene, errors, warnings, hash };
}

/**
 * Compile only: source -> normalised scene, no rendering. Useful for linting a
 * corpus of scenes in CI.
 *
 * @param {string|object} source
 * @returns {{ ok:boolean, scene:object|null, errors:object[], warnings:object[], hash:string|null }}
 */
export function compile(source) {
  const parsed = typeof source === 'object' && source ? { scene: source, errors: [] } : parse(String(source ?? ''));
  const scene = parsed.scene;
  if (!scene) return { ok: false, scene: null, errors: parsed.errors, warnings: [], hash: null };
  const result = validate(scene);
  const errors = parsed.errors.concat(result.errors);
  return {
    ok: errors.length === 0,
    scene,
    errors,
    warnings: result.warnings,
    hash: errors.length ? null : hashScene(scene)
  };
}