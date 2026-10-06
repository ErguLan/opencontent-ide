/**
 * WritterArt MCP server — zero dependencies, JSON-RPC 2.0 over stdio.
 *
 * The transport is one JSON object per line on stdin/stdout, which is what the
 * MCP stdio transport uses. Nothing is written to stdout except protocol
 * messages, so the server can be piped straight into a client.
 *
 * The server never throws at a caller. A scene that does not compile comes back
 * as `{ ok: false, errors }` with the diagnostics intact — `hint` and `near`
 * included — because those two fields are the reason this server exists: a
 * diffusion model cannot produce them, this one can.
 *
 * @module mcp/server
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { compile, render } from '../render/index.js'
import { generateTexture, TEXTURE_KINDS } from '../texture.js'
import { encodePng } from '../png.js'
import {
  ALIASES,
  CANVAS_PRESETS,
  CODES,
  ICON_NAMES,
  LIGHTS,
  MATERIALS,
  PALETTES,
  SPEC,
  STYLES,
  nearest
} from '../vocabulary.js'

/** Reported in the initialize handshake. Bump with the package version. */
export const SERVER_NAME = 'writterart'
export const SERVER_VERSION = '0.1.0'

/** JSON-RPC error codes used by this server. */
const CODES_RPC = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
})

/**
 * The five tools this server exposes. Descriptions are written for a language
 * model caller: what the tool does, what it cannot do, and when to prefer it
 * over calling a diffusion image API.
 *
 * @type {ReadonlyArray<{ name: string, description: string, inputSchema: object }>}
 */
export const TOOLS = Object.freeze([
  Object.freeze({
    name: 'validate_scene',
    description:
      'Check a WritterArt scene before rendering it. Parses the `.wrt` source, validates every word, ' +
      'property, colour and value against the vocabulary, and returns the canonical scene hash. ' +
      'On failure it returns the diagnostics verbatim, each with a stable code, a JSON-pointer path, ' +
      'a source line and column, an actionable `hint`, and a `near` list of the closest valid words. ' +
      'Those two fields are the point of this tool: a diffusion image model can never emit them. ' +
      'It cannot check whether a composition looks good, and it does not render anything. ' +
      'Call it first, on every scene, before render_scene, and use it to repair scenes you did not write.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Full `.wrt` scene source text, starting with `escena`.'
        }
      },
      required: ['source'],
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: 'render_scene',
    description:
      'Compile a WritterArt scene into deterministic SVG. Exact text, exact element counts, exact layout, ' +
      'byte-identical output for the same source and seed. Every element carries a stable `wrt-`-prefixed id, ' +
      'so the result is editable and diffable. ' +
      'It cannot paint organic texture, shading realism, faces, lighting realism or photorealism — for those, ' +
      'compile control maps with compile_control_maps and hand them to a diffusion backend, then use this ' +
      'SVG as the reference geometry. It also never returns a raster image. On failure it returns the ' +
      'diagnostics instead of throwing, so a bad scene is a repairable answer rather than a crash.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Full `.wrt` scene source text.' },
        pretty: {
          type: 'boolean',
          description: 'Indent the SVG for human reading. Defaults to true.'
        },
        seed: {
          type: 'number',
          description: 'Deterministic solver seed. Same source and seed give the same bytes.'
        }
      },
      required: ['source'],
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: 'compile_control_maps',
    description:
      'Compile a scene into depth, edge and segmentation maps (PNG) plus a json description of the geometry, ' +
      'and write them to a directory. This is the honest bridge to a diffusion model: WritterArt computes ' +
      'where everything is, a ControlNet or Flux backend decides what it looks like. ' +
      'It cannot generate pixels, it ships no model weights and it calls no external API. ' +
      'Use it when you need structure-aware generation, then feed the maps to your own diffusion pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Full `.wrt` scene source text.' },
        outDir: {
          type: 'string',
          description: 'Directory for depth.png, edges.png, segmentation.png and maps.json. Required: the server picks no default directory.'
        },
        scale: {
          type: 'number',
          description: 'Scale factor applied to the canvas size. Defaults to 1.'
        },
        seed: { type: 'number', description: 'Deterministic seed. Defaults to 1.' }
      },
      required: ['source'],
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: 'generate_texture',
    description:
      'Generate a seamlessly tileable grayscale procedural texture and write it as a PNG. ' +
      'Tileable in both axes: the right edge continues into the left one, so it can repeat without a seam. ' +
      'Output is single-channel grayscale with alpha, meant to be used as a height, roughness or detail map, ' +
      'not as a picture. ' +
      'It cannot produce colour, cannot produce a picture of anything, and needs no model weights. ' +
      'For colour surfaces prefer the named materials in a scene; for photoreal surfaces prefer a diffusion ' +
      'backend driven by compile_control_maps.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: `One of: ${TEXTURE_KINDS.join(', ')}. An unknown kind returns the closest names instead of guessing.`
        },
        size: { type: 'number', description: 'Square edge in pixels, 1..1024. Defaults to 512.' },
        seed: { type: 'number', description: 'Deterministic seed. Defaults to 1.' },
        params: {
          type: 'object',
          description:
            'Kind-specific parameters, all optional: octaves, frecuencia, celdas, anillos, cepillado, vetas, ' +
            'turbulence, hilos, intensidad, angulo, gain, grosor, frecuencia_fina. Unknown keys are ignored.'
        },
        outPath: {
          type: 'string',
          description: 'Destination PNG path. When omitted the file goes to the system temp directory.'
        }
      },
      required: ['kind'],
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: 'describe_spec',
    description:
      'Return the whole language as data: the grammar, the canvas presets, and every valid word — materials, ' +
      'lights, palettes, styles, icons and aliases — plus the full diagnostic code table. ' +
      'Call it once at the start of a session, before writing a scene, instead of guessing names and ' +
      'discovering the vocabulary through validate_scene errors. It cannot render, cannot lay out and ' +
      'cannot produce pixels: it is data only, and it accepts no arguments.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    }
  })
])

/**
 * Control maps come back as `{ width, height, rgba }`; the PNG encoder wants
 * `{ width, height, data }`.
 *
 * @param {{ width: number, height: number, rgba: Uint8ClampedArray|Uint8Array }} map
 * @returns {{ width: number, height: number, data: Uint8ClampedArray|Uint8Array }}
 */
function toImage(map) {
  return { width: map.width, height: map.height, data: map.rgba };
}

/**
 * Loads the control map compiler. It is a heavy module and it may not be present
 * in a partial checkout, so a failure here is a normal, reportable condition
 * rather than a crash.
 *
 * @returns {Promise<{ ok: boolean, compile?: Function, error?: string }>}
 */
async function loadControlMaps() {
  try {
    const module = await import('../controlmaps.js');
    if (typeof module.compileControlMaps !== 'function') {
      return { ok: false, error: 'controlmaps unavailable: compileControlMaps is not exported' };
    }
    return { ok: true, compile: module.compileControlMaps };
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      return { ok: false, error: 'controlmaps unavailable' };
    }
    return { ok: false, error: `controlmaps unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * @param {object} args tool arguments
 * @returns {Promise<object>} plain result object, never a JSON-RPC error
 */
async function toolValidateScene(args) {
  const source = args?.source;
  if (typeof source !== 'string') {
    return { ok: false, errors: [{ code: 'MISSING_PROPERTY', message: 'source must be a string', path: 'source', line: null, col: null, hint: 'Pass the full .wrt scene source as the source argument.', near: [] }], warnings: [], hash: null };
  }
  const result = compile(source);
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    hash: result.hash
  };
}

/**
 * @param {object} args
 * @returns {Promise<object>}
 */
async function toolRenderScene(args) {
  const source = args?.source;
  if (typeof source !== 'string') {
    return {
      ok: false,
      errors: [{ code: 'MISSING_PROPERTY', message: 'source must be a string', path: 'source', line: null, col: null, hint: 'Pass the full .wrt scene source as the source argument.', near: [] }]
    };
  }
  const pretty = args.pretty === undefined ? true : args.pretty !== false;
  const seed = typeof args.seed === 'number' && Number.isFinite(args.seed) ? args.seed : 1;
  const result = render(source, { pretty, seed });

  if (!result.ok) {
    return { ok: false, hash: result.hash ?? null, errors: result.errors, warnings: result.warnings };
  }
  return {
    ok: true,
    svg: result.svg,
    hash: result.hash,
    width: result.layout?.width ?? null,
    height: result.layout?.height ?? null,
    warnings: result.warnings
  };
}

/**
 * @param {object} args
 * @returns {Promise<object>}
 */
async function toolCompileControlMaps(args) {
  const source = args?.source;
  if (typeof source !== 'string') {
    return { ok: false, error: 'source must be a string' };
  }
  if (typeof args.outDir !== 'string' || args.outDir.trim() === '') {
    return { ok: false, error: 'outDir is required: the server never picks a directory on the caller filesystem' };
  }

  const seed = typeof args.seed === 'number' && Number.isFinite(args.seed) ? args.seed : 1;
  const scale = typeof args.scale === 'number' && Number.isFinite(args.scale) && args.scale > 0 ? args.scale : 1;

  const loaded = await loadControlMaps();
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const rendered = render(source, { pretty: true, seed });
  if (!rendered.ok) return { ok: false, error: 'scene does not compile', errors: rendered.errors };

  const layout = rendered.layout;
  const width = Math.max(1, Math.round(layout.width * scale));
  const height = Math.max(1, Math.round(layout.height * scale));

  let maps;
  try {
    maps = loaded.compile(layout, { width, height, seed });
  } catch (error) {
    return { ok: false, error: `compileControlMaps failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const outDir = args.outDir;
  const files = {
    depth: join(outDir, 'depth.png'),
    edges: join(outDir, 'edges.png'),
    segmentation: join(outDir, 'segmentation.png'),
    json: join(outDir, 'maps.json')
  };

  try {
    mkdirSync(outDir, { recursive: true });
    mkdirSync(dirname(files.depth), { recursive: true });
    writeFileSync(files.depth, encodePng(toImage(maps.depth)));
    writeFileSync(files.edges, encodePng(toImage(maps.edges)));
    writeFileSync(files.segmentation, encodePng(toImage(maps.segmentation)));
    writeFileSync(files.json, `${JSON.stringify(maps.json, null, 2)}\n`);
  } catch (error) {
    const reason = error && error.code ? error.code : String(error);
    return { ok: false, error: `cannot write control maps: ${reason}` };
  }

  return { ok: true, files, json: maps.json };
}

/**
 * @param {object} args
 * @returns {Promise<object>}
 */
async function toolGenerateTexture(args) {
  const kind = args?.kind;
  if (typeof kind !== 'string' || !TEXTURE_KINDS.includes(kind)) {
    return {
      ok: false,
      error: `unknown texture kind '${String(kind)}'`,
      kinds: [...TEXTURE_KINDS],
      near: typeof kind === 'string' ? nearest(kind, TEXTURE_KINDS) : [...TEXTURE_KINDS.slice(0, 3)]
    };
  }

  const size = typeof args.size === 'number' && Number.isInteger(args.size) && args.size > 0 ? Math.min(args.size, 1024) : 512;
  const seed = typeof args.seed === 'number' && Number.isFinite(args.seed) ? args.seed : 1;
  const params = args.params && typeof args.params === 'object' && !Array.isArray(args.params) ? args.params : {};
  const outPath =
    typeof args.outPath === 'string' && args.outPath.trim() !== ''
      ? args.outPath
      : join(tmpdir(), `writterart-${kind}-${size}-${seed}.png`);

  try {
    const texture = generateTexture({ kind, size, seed, params });
    const png = encodePng(toImage(texture));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
    return { ok: true, width: texture.width, height: texture.height, path: outPath, bytes: png.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * @returns {Promise<object>}
 */
async function toolDescribeSpec() {
  return {
    grammar: SPEC.grammar,
    canvasPresets: { ...CANVAS_PRESETS },
    materials: Object.keys(MATERIALS),
    lights: Object.keys(LIGHTS),
    palettes: Object.keys(PALETTES),
    styles: Object.keys(STYLES),
    icons: [...ICON_NAMES],
    aliases: { ...ALIASES },
    diagnosticCodes: { ...CODES }
  };
}

/** tool name -> implementation */
const IMPLEMENTATIONS = Object.freeze({
  validate_scene: toolValidateScene,
  render_scene: toolRenderScene,
  compile_control_maps: toolCompileControlMaps,
  generate_texture: toolGenerateTexture,
  describe_spec: toolDescribeSpec
})

/**
 * Which tool results should be flagged with `isError`. A tool that answered with
 * `{ ok: false, errors }` is a reportable failure for the model, not a protocol
 * error, so the caller can read the diagnostics and try again.
 *
 * @param {object} result
 * @returns {boolean}
 */
function isToolError(result) {
  if (!result || typeof result !== 'object') return true;
  if (result.ok === false) return true;
  if (typeof result.error === 'string') return true;
  return false;
}

/**
 * @param {string|null|number} id
 * @param {number} code
 * @param {string} message
 * @returns {object} a JSON-RPC error response
 */
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/**
 * Creates a server instance. Stateless: one instance can serve any number of
 * requests, and two instances behave identically.
 *
 * @returns {{
 *   tools: ReadonlyArray<{ name: string, description: string, inputSchema: object }>,
 *   handle: (message: object) => Promise<object|null>
 * }}
 *   `handle` takes one JSON-RPC message and returns the response object, or
 *   `null` for notifications, which by definition get no reply.
 */
export function createServer() {
  /**
   * @param {object} message a parsed JSON-RPC 2.0 message
   * @returns {Promise<object|null>} response, or null for notifications
   */
  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return rpcError(null, CODES_RPC.INVALID_REQUEST, 'request must be a JSON-RPC object');
    }

    const id = message.id ?? null;
    const isNotification = message.method === undefined && id === null && message.result === undefined;
    const method = message.method;

    if (typeof method !== 'string') {
      if (isNotification) return null;
      return rpcError(id, CODES_RPC.INVALID_REQUEST, 'missing method');
    }

    // Notifications never get a response, whatever they are.
    if (method.startsWith('notifications/')) return null;

    const params = message.params && typeof message.params === 'object' ? message.params : {};

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : SPEC.version,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
          }
        };

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

      case 'tools/call': {
        const name = params.name;
        const implementation = typeof name === 'string' ? IMPLEMENTATIONS[name] : undefined;
        if (!implementation) {
          return rpcError(id, CODES_RPC.INVALID_PARAMS, `unknown tool '${String(name)}'`);
        }
        let result;
        try {
          result = await implementation(params.arguments ?? {});
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        const payload = { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        if (isToolError(result)) payload.isError = true;
        if (result && typeof result === 'object') payload.structuredContent = result;
        return { jsonrpc: '2.0', id, result: payload };
      }

      default:
        return rpcError(id, CODES_RPC.METHOD_NOT_FOUND, `unknown method '${method}'`);
    }
  }

  return { tools: TOOLS, handle };
}

/**
 * Reads newline-delimited JSON-RPC from a stream and writes responses back.
 * Responses are emitted in request order, so a caller can pair them by position
 * as well as by id.
 *
 * @param {{ input?: { setEncoding: Function, on: Function }, output?: { write: Function } }} [streams]
 * @returns {Promise<void>} resolves when the input stream ends
 */
export function handleStdio(streams = {}) {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stdout;

  return new Promise((resolve) => {
    let buffer = '';
    let chain = Promise.resolve();

    const write = (payload) => {
      output.write(`${JSON.stringify(payload)}\n`);
    };

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (trimmed === '') return;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        // Queued like everything else, so a malformed line cannot overtake the
        // answers to the requests before it.
        chain = chain.then(async () => {
          write(rpcError(null, CODES_RPC.PARSE_ERROR, 'invalid JSON'));
        });
        return;
      }
      if (Array.isArray(message)) {
        // Batch requests are legal JSON-RPC; answer each in order.
        chain = chain.then(async () => {
          const responses = [];
          for (const entry of message) {
            const response = await handleOne(entry);
            if (response) responses.push(response);
          }
          if (responses.length) write(responses);
        });
        return;
      }
      chain = chain.then(async () => {
        const response = await handleOne(message);
        if (response) write(response);
      });
    };

    const handleOne = async (message) => {
      try {
        return await server.handle(message);
      } catch (error) {
        return rpcError(message && message.id ? message.id : null, CODES_RPC.INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
      }
    };

    if (typeof input.setEncoding === 'function') input.setEncoding('utf8');

    input.on('data', (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : String(chunk);
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        handleLine(line);
        index = buffer.indexOf('\n');
      }
    });

    input.on('end', () => {
      const rest = buffer;
      buffer = '';
      if (rest.trim() !== '') handleLine(rest);
      chain.then(() => resolve(), () => resolve());
    });

    input.on('error', () => {
      chain.then(() => resolve(), () => resolve());
    });
  });
}

/** The module level server instance used by {@link handleStdio}. */
const server = createServer();

/**
 * Convenience wrapper mirroring {@link handleStdio} for the process-wide streams.
 *
 * @returns {Promise<void>}
 */
export function serve() {
  return handleStdio();
}

export { CODES_RPC as RPC_ERROR_CODES };
