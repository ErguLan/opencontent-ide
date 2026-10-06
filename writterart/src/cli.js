#!/usr/bin/env node
/**
 * WritterArt command line interface.
 *
 * Zero dependencies, hand written argument parsing, no stack traces: the CLI is
 * meant to be driven by a language model as often as by a human, so every failure
 * becomes one clear line on stderr and an exit code.
 *
 *   0  the command succeeded
 *   1  the command ran but the input has diagnostics
 *   2  usage error (bad flag, missing argument, unreadable file)
 *
 * Human readable output goes to stdout. Diagnostics and errors go to stderr.
 * `-` as a file path reads the scene from stdin. `--json` prints the
 * machine-readable result instead of the prose, which is what an agent wants.
 *
 * @module cli
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parse } from './parse.js'
import { validate } from './validate.js'
import { hashScene } from './hash.js'
import { render } from './render/index.js'
import { generateTexture, TEXTURE_KINDS } from './texture.js'
import { encodePng } from './png.js'
import {
  ALIASES,
  CANVAS_PRESETS,
  CODES,
  ICONS,
  ICON_NAMES,
  LIGHTS,
  MATERIALS,
  PALETTES,
  SPEC,
  STYLES,
  nearest
} from './vocabulary.js'

/** Thrown for anything the caller got wrong. Always maps to exit code 2. */
class UsageError extends Error {}

const HELP = `writterart — deterministic scene descriptions for agents

Usage
  wrt spec                                      print the grammar
  wrt vocabulary [--json]                       materials, lights, palettes, styles, icons, aliases
  wrt validate <file...> [--json]                exit 0 if all valid, 1 if any diagnostic
  wrt render <file> [-o out.svg] [--compact] [--seed N] [--json]
  wrt hash <file>                                print the canonical 16-hex scene hash
  wrt texture <kind> [-o out.png] [--size N] [--seed N] [--param key=value ...]
  wrt control <file> [-o dir] [--scale N] [--seed N]
  wrt help

Options
  -o, --out <path>   output file, or directory for control
      --json         machine-readable output instead of prose
      --compact      render the SVG without indentation
      --size <n>     texture edge in pixels, 1..1024 (default 512)
      --seed <n>     deterministic seed
      --scale <n>    control map scale factor (default 1)
      --param k=v    texture parameter, repeatable
  -                  read the scene from stdin

Exit codes
  0 ok   1 diagnostics   2 usage error

Examples
  wrt render poster.wrt -o poster.svg
  cat poster.wrt | wrt validate - --json
  wrt texture madera --size 256 --param anillos=14 -o wood.png
  wrt control poster.wrt --scale 2`

// -----------------------------------------------------------------------------
// argument parsing
// -----------------------------------------------------------------------------

/**
 * Hand written parser. Understands `--key value`, `--key=value`, `-o value`,
 * repeatable keys and a `--` terminator. No dependency, ~40 lines.
 *
 * @param {string[]} argv arguments after the node executable and script
 * @returns {{ positionals: string[], flags: Record<string, string|boolean|string[]> }}
 *   repeated keys collapse into an array, in the order they appeared
 */
export function parseArgs(argv) {
  const positionals = [];
  const flags = Object.create(null);

  const add = (token, value) => {
    const key = token.replace(/^--?/, '');
    const current = flags[key];
    if (current === undefined) flags[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else flags[key] = [current, value];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.length > 1 && token[0] === '-') {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        add(token.slice(0, eq), token.slice(eq + 1));
        continue;
      }
      const next = argv[i + 1];
      const isValue = next !== undefined && !isFlagLike(next);
      if (isValue) {
        add(token, next);
        i += 1;
      } else add(token, true);
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags };
}

/**
 * @param {string} token
 * @returns {boolean} true when the token should be read as a flag, not a value
 */
function isFlagLike(token) {
  if (token === '-') return false;
  if (token[0] !== '-') return false;
  // A negative number is a value, `-o` is a flag.
  return !/^-?\d/.test(token.slice(1));
}

/**
 * @param {Record<string, string|boolean|string[]>} flags
 * @param {string[]} names accepted spellings, first match wins
 * @returns {string|undefined}
 */
function flagValue(flags, names) {
  for (const name of names) {
    const value = flags[name];
    if (value === undefined) continue;
    if (Array.isArray(value)) return value[value.length - 1];
    if (value === true) return '';
    return value;
  }
  return undefined;
}

/**
 * @param {Record<string, string|boolean|string[]>} flags
 * @param {string[]} names
 * @returns {boolean}
 */
function flagBool(flags, names) {
  for (const name of names) {
    const value = flags[name];
    if (value === undefined) continue;
    if (value === false || value === 'false' || value === 'no') return false;
    return true;
  }
  return false;
}

/**
 * @param {Record<string, string|boolean|string[]>} flags
 * @param {string[]} names
 * @param {number} fallback
 * @param {string} label used in the usage error message
 * @returns {number}
 * @throws {UsageError} when the flag is present but not a finite number
 */
function flagNumber(flags, names, fallback, label) {
  const raw = flagValue(flags, names);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`${label} expects a number, received '${raw}'`);
  return value;
}

// -----------------------------------------------------------------------------
// io helpers
// -----------------------------------------------------------------------------

/** @param {string[]} lines */
function out(lines) {
  process.stdout.write(`${lines.join('\n')}\n`);
}

/** @param {string} message */
function err(message) {
  process.stderr.write(`${message}\n`);
}

/**
 * @param {string} file path, or `-` for stdin
 * @returns {string} file contents
 * @throws {UsageError} when the file cannot be read
 */
function readSource(file) {
  try {
    if (file === '-') return readFileSync(0, 'utf8');
    return readFileSync(file, 'utf8');
  } catch (error) {
    const reason = error && error.code ? error.code : String(error);
    throw new UsageError(`cannot read '${file}': ${reason}`);
  }
}

/**
 * @param {string} path
 * @param {string|Buffer} data
 */
function writeOut(path, data) {
  try {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, data);
  } catch (error) {
    const reason = error && error.code ? error.code : String(error);
    throw new UsageError(`cannot write '${path}': ${reason}`);
  }
}

/**
 * Control maps come back as `{ width, height, rgba }`; the PNG encoder wants
 * `{ width, height, data }`. This is the only place the two shapes meet.
 *
 * @param {{ width: number, height: number, rgba: Uint8ClampedArray|Uint8Array }} map
 * @returns {{ width: number, height: number, data: Uint8ClampedArray|Uint8Array }}
 */
function toImage(map) {
  return { width: map.width, height: map.height, data: map.rgba };
}

/**
 * Parse + validate a scene in one go, exactly the way `render()` does it, so the
 * hash printed here matches the hash the MCP server reports.
 *
 * @param {string} source `.wrt` text
 * @returns {{ ok: boolean, scene: object|null, errors: object[], warnings: object[], hash: string|null }}
 */
function check(source) {
  const parsed = parse(source);
  const scene = parsed.scene;
  if (!scene) {
    return { ok: false, scene: null, errors: parsed.errors, warnings: [], hash: null };
  }
  const result = validate(scene);
  const errors = parsed.errors.concat(result.errors);
  const warnings = result.warnings;
  const ok = errors.length === 0;
  return { ok, scene, errors, warnings, hash: ok ? hashScene(scene) : null };
}

/**
 * One diagnostic as the human sees it: code, position, path, message, then the
 * two lines that are the actual product — what to do and what you probably meant.
 *
 * @param {object} diagnostic
 * @param {string} [prefix] `'warning: '` for warnings
 * @returns {string[]}
 */
export function formatDiagnostic(diagnostic, prefix = '') {
  const at = diagnostic.line == null ? '-' : `${diagnostic.line}:${diagnostic.col ?? 1}`;
  const lines = [`${prefix}${diagnostic.code} ${at} ${diagnostic.path ?? 'root'}`, `  ${diagnostic.message}`];
  if (diagnostic.hint) lines.push(`  hint: ${diagnostic.hint}`);
  if (Array.isArray(diagnostic.near) && diagnostic.near.length) {
    lines.push(`  did you mean: ${diagnostic.near.join(', ')}`);
  }
  return lines;
}

// -----------------------------------------------------------------------------
// commands
// -----------------------------------------------------------------------------

/**
 * `wrt spec` — the grammar, straight from the vocabulary module.
 *
 * @returns {Promise<number>} exit code
 */
function commandSpec() {
  out([`${SPEC.name} ${SPEC.version} (${SPEC.extension})`, '', SPEC.grammar]);
  return 0;
}

/**
 * `wrt vocabulary [--json]` — every valid word, so an agent never has to guess.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} exit code
 */
function commandVocabulary(args) {
  const payload = {
    materials: Object.keys(MATERIALS),
    lights: Object.keys(LIGHTS),
    palettes: Object.keys(PALETTES),
    styles: Object.keys(STYLES),
    icons: ICON_NAMES,
    aliases: { ...ALIASES },
    canvasPresets: { ...CANVAS_PRESETS },
    diagnosticCodes: { ...CODES },
    textureKinds: [...TEXTURE_KINDS]
  };

  if (flagBool(args.flags, ['json'])) {
    out([JSON.stringify(payload, null, 2)]);
    return 0;
  }

  const lines = ['materials'];
  for (const name of Object.keys(MATERIALS)) lines.push(`  ${name}`);
  lines.push('lights');
  for (const name of Object.keys(LIGHTS)) lines.push(`  ${name}`);
  lines.push('palettes');
  for (const name of Object.keys(PALETTES)) lines.push(`  ${name}`);
  lines.push('styles');
  for (const name of Object.keys(STYLES)) lines.push(`  ${name}`);
  lines.push('icons');
  for (const name of ICON_NAMES) lines.push(`  ${name}`);
  lines.push('canvas presets');
  for (const name of Object.keys(CANVAS_PRESETS)) {
    lines.push(`  ${name} ${CANVAS_PRESETS[name].width}x${CANVAS_PRESETS[name].height}`);
  }
  lines.push(`aliases (${Object.keys(ALIASES).length})`);
  for (const [alias, canonical] of Object.entries(ALIASES)) lines.push(`  ${alias} -> ${canonical}`);
  lines.push('texture kinds');
  for (const kind of TEXTURE_KINDS) lines.push(`  ${kind}`);
  lines.push('diagnostic codes');
  for (const code of Object.keys(CODES)) lines.push(`  ${code}`);
  out(lines);
  return 0;
}

/**
 * `wrt validate <file...>` — the linter. Per file status goes to stdout, the
 * diagnostics themselves go to stderr, errors first and warnings after them.
 * Exit 1 is reserved for errors: a warning is something an author should read,
 * not a reason to fail a build.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} 0 when no error diagnostic was produced
 */
function commandValidate(args) {
  const files = args.positionals;
  if (files.length === 0) throw new UsageError('validate expects at least one file, or - for stdin');

  const asJson = flagBool(args.flags, ['json']);
  const reports = [];
  const status = [];
  const diagnostics = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    const result = check(readSource(file));
    errorCount += result.errors.length;
    warningCount += result.warnings.length;
    reports.push({
      file,
      ok: result.ok,
      hash: result.hash,
      errors: result.errors,
      warnings: result.warnings
    });
    status.push(`${file}: ${result.ok ? 'ok' : 'failed'}${result.hash ? ` ${result.hash}` : ''}`);
    for (const diagnostic of result.errors) diagnostics.push(...formatDiagnostic(diagnostic));
    for (const diagnostic of result.warnings) diagnostics.push(...formatDiagnostic(diagnostic, 'warning: '));
  }

  if (asJson) {
    out([JSON.stringify({ ok: errorCount === 0, errorCount, warningCount, files: reports }, null, 2)]);
    return errorCount === 0 ? 0 : 1;
  }

  if (diagnostics.length) err(diagnostics);
  out([...status, `${files.length} file(s) checked, ${errorCount} error(s), ${warningCount} warning(s)`]);
  return errorCount === 0 ? 0 : 1;
}

/**
 * `wrt render <file>` — deterministic SVG to a file or to stdout.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} exit code
 */
function commandRender(args) {
  const file = args.positionals[0];
  if (file === undefined) throw new UsageError('render expects a file, or - for stdin');

  const seed = flagNumber(args.flags, ['seed'], 1, '--seed');
  const pretty = !flagBool(args.flags, ['compact']);
  const outPath = flagValue(args.flags, ['o', 'out']);
  const asJson = flagBool(args.flags, ['json']);

  const result = render(readSource(file), { seed, pretty });

  if (!result.ok) {
    if (asJson) {
      out([
        JSON.stringify(
          {
            ok: false,
            hash: result.hash,
            errors: result.errors,
            warnings: result.warnings
          },
          null,
          2
        )
      ]);
      return 1;
    }
    err([`${file}: ${result.errors.length} error(s)`, ...result.errors.flatMap((d) => formatDiagnostic(d))].join('\n'));
    return 1;
  }

  const width = result.layout?.width ?? null;
  const height = result.layout?.height ?? null;

  if (asJson) {
    out([
      JSON.stringify(
        {
          ok: true,
          file,
          out: outPath ?? null,
          hash: result.hash,
          width,
          height,
          warnings: result.warnings,
          svg: result.svg
        },
        null,
        2
      )
    ]);
    return 0;
  }

  if (outPath) {
    writeOut(outPath, result.svg);
    out([`${outPath} ${width}x${height} ${result.hash}`]);
    return 0;
  }

  process.stdout.write(result.svg);
  return 0;
}

/**
 * `wrt hash <file>` — the fingerprint of the description, not of the render.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} exit code
 */
function commandHash(args) {
  const file = args.positionals[0];
  if (file === undefined) throw new UsageError('hash expects a file, or - for stdin');

  const result = check(readSource(file));
  if (!result.ok) {
    err([`${file}: ${result.errors.length} error(s)`, ...result.errors.flatMap((d) => formatDiagnostic(d))].join('\n'));
    return 1;
  }
  out([result.hash]);
  return 0;
}

/**
 * `wrt texture <kind>` — a seamless grayscale surface map as a PNG.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} exit code
 */
function commandTexture(args) {
  const kind = args.positionals[0];
  if (kind === undefined) throw new UsageError(`texture expects a kind, one of: ${TEXTURE_KINDS.join(', ')}`);

  if (!TEXTURE_KINDS.includes(kind)) {
    const close = nearest(kind, TEXTURE_KINDS);
    err([
      `unknown texture kind '${kind}'`,
      `  did you mean: ${close.length ? close.join(', ') : TEXTURE_KINDS.join(', ')}`,
      `  known kinds: ${TEXTURE_KINDS.join(', ')}`
    ]);
    return 1;
  }

  const size = flagNumber(args.flags, ['size'], 512, '--size');
  const seed = flagNumber(args.flags, ['seed'], 1, '--seed');
  const outPath = flagValue(args.flags, ['o', 'out']);

  const raw = flagValue(args.flags, ['param']);
  const params = {};
  const pairs = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  for (const pair of pairs) {
    const eq = String(pair).indexOf('=');
    if (eq === -1) throw new UsageError(`--param expects key=value, received '${pair}'`);
    const key = String(pair).slice(0, eq).trim();
    const value = Number(String(pair).slice(eq + 1));
    if (!key) throw new UsageError(`--param expects a key before '=', received '${pair}'`);
    params[key] = Number.isFinite(value) ? value : String(pair).slice(eq + 1);
  }

  let texture;
  try {
    texture = generateTexture({ kind, size: Math.round(size), seed, params });
  } catch (error) {
    throw new UsageError(`texture: ${error instanceof Error ? error.message : String(error)}`);
  }

  const png = encodePng({ width: texture.width, height: texture.height, data: texture.rgba });
  if (outPath) {
    writeOut(outPath, png);
    out([`${outPath} ${texture.width}x${texture.height} ${kind} seed=${seed} ${png.length} bytes`]);
    return 0;
  }

  process.stdout.write(png);
  return 0;
}

/**
 * `wrt control <file>` — compile depth, edge and segmentation maps and write them
 * next to a small json description of the geometry. This is the honest bridge to
 * a diffusion backend: WritterArt computes the structure, the model paints it.
 *
 * The control map compiler is loaded lazily, so the CLI keeps working while the
 * module is still being written.
 *
 * @param {{ positionals: string[], flags: Record<string, string|boolean|string[]> }} args
 * @returns {Promise<number>} exit code
 */
async function commandControl(args) {
  const file = args.positionals[0];
  if (file === undefined) throw new UsageError('control expects a file, or - for stdin');

  const seed = flagNumber(args.flags, ['seed'], 1, '--seed');
  const scale = flagNumber(args.flags, ['scale'], 1, '--scale');
  if (scale <= 0) throw new UsageError(`--scale expects a positive number, received '${scale}'`);

  const result = render(readSource(file), { seed, pretty: true });
  if (!result.ok) {
    err([`${file}: ${result.errors.length} error(s)`, ...result.errors.flatMap((d) => formatDiagnostic(d))].join('\n'));
    return 1;
  }

  let compileControlMaps;
  try {
    const module = await import('./controlmaps.js');
    compileControlMaps = module.compileControlMaps;
  } catch (error) {
    const reason = error && error.code === 'ERR_MODULE_NOT_FOUND' ? 'not found' : String(error);
    err(`control maps unavailable: src/controlmaps.js ${reason}`);
    return 1;
  }
  if (typeof compileControlMaps !== 'function') {
    err('control maps unavailable: src/controlmaps.js does not export compileControlMaps');
    return 1;
  }

  const layout = result.layout;
  const width = Math.max(1, Math.round(layout.width * scale));
  const height = Math.max(1, Math.round(layout.height * scale));

  let maps;
  try {
    maps = compileControlMaps(layout, { width, height, seed });
  } catch (error) {
    err(`control maps failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const outDir = flagValue(args.flags, ['o', 'out']) ?? join('.wrt-control', result.hash.slice(0, 8));
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (error) {
    const reason = error && error.code ? error.code : String(error);
    throw new UsageError(`cannot create '${outDir}': ${reason}`);
  }

  const files = {
    depth: join(outDir, 'depth.png'),
    edges: join(outDir, 'edges.png'),
    segmentation: join(outDir, 'segmentation.png'),
    json: join(outDir, 'maps.json')
  };

  try {
    writeFileSync(files.depth, encodePng(toImage(maps.depth)));
    writeFileSync(files.edges, encodePng(toImage(maps.edges)));
    writeFileSync(files.segmentation, encodePng(toImage(maps.segmentation)));
    writeFileSync(files.json, `${JSON.stringify(maps.json, null, 2)}\n`);
  } catch (error) {
    const reason = error && error.code ? error.code : String(error);
    throw new UsageError(`cannot write control maps into '${outDir}': ${reason}`);
  }

  out([
    `${outDir} ${maps.json.width}x${maps.json.height} seed=${maps.json.seed} hash=${result.hash}`,
    `  ${files.depth}`,
    `  ${files.edges}`,
    `  ${files.segmentation}`,
    `  ${files.json}`
  ]);
  return 0;
}

const COMMANDS = {
  spec: commandSpec,
  vocabulary: commandVocabulary,
  validate: commandValidate,
  render: commandRender,
  hash: commandHash,
  texture: commandTexture,
  control: commandControl,
  help: async () => {
    out(HELP.split('\n'));
    return 0;
  },
  '--help': async () => {
    out(HELP.split('\n'));
    return 0;
  },
  '-h': async () => {
    out(HELP.split('\n'));
    return 0;
  },
  '--version': async () => {
    out([`${SPEC.name} ${SPEC.version}`]);
    return 0;
  }
};

/**
 * Runs one CLI invocation. Never throws: every failure becomes a line on stderr
 * and an exit code.
 *
 * @param {string[]} argv arguments after the node executable and the script path
 * @returns {Promise<number>} process exit code
 */
export async function main(argv = process.argv.slice(2)) {
  const { positionals, flags } = parseArgs(argv);
  const name = positionals[0];
  const command = COMMANDS[name === undefined ? 'help' : name];

  if (typeof command !== 'function') {
    err([
      `unknown command '${name}'`,
      `  known commands: ${Object.keys(COMMANDS).filter((key) => !key.startsWith('-')).join(', ')}`,
      "  run 'wrt help' for usage"
    ]);
    return 2;
  }

  try {
    const code = await command({ positionals: positionals.slice(1), flags });
    return typeof code === 'number' ? code : 0;
  } catch (error) {
    if (error instanceof UsageError) {
      err(`error: ${error.message}`);
      return 2;
    }
    err(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      err(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    }
  );
}
