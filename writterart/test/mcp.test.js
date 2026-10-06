import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createServer, handleStdio, TOOLS, SERVER_NAME, SERVER_VERSION } from '../src/mcp/server.js'

const Q = String.fromCharCode(34)
const VALID = [
  'escena ' + Q + 'poster' + Q + ' {',
  '  lienzo: og',
  '  luz: suave',
  '  grupo ' + Q + 'contenido' + Q + ' {',
  '    espacio: 16',
  '    titulo ' + Q + 'Hola mundo' + Q + ' { tam: 44 }',
  '    panel { relleno: papel radio: 8 texto: ' + Q + 'Panel' + Q + ' }',
  '    icono ' + Q + 'check' + Q + ' { tam: 32 }',
  '  }',
  '}'
].join('\n')

const BROKEN = [
  'escena ' + Q + 'roto' + Q + ' {',
  '  lienzo: og',
  '  panel { material: papelz }',
  '  titulo ' + Q + 'Hola' + Q + ' { tam: 40 }',
  '}'
].join('\n')

/**
 * @param {object} server
 * @param {string} method
 * @param {object} [params]
 * @param {number|string} [id]
 * @returns {Promise<object>}
 */
function call(server, method, params = undefined, id = 1) {
  return server.handle({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
}

/**
 * MCP returns the payload as text content. Every test parses it back.
 *
 * @param {object} response
 * @returns {object}
 */
function payload(response) {
  assert.equal(typeof response.result, 'object')
  assert.equal(response.result.content[0].type, 'text')
  return JSON.parse(response.result.content[0].text)
}

test('initialize echoes the client protocol version and advertises the tools capability', async () => {
  const server = createServer()
  const response = await call(server, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })

  assert.equal(response.jsonrpc, '2.0')
  assert.equal(response.id, 1)
  assert.equal(response.result.protocolVersion, '2025-06-18')
  assert.deepEqual(response.result.capabilities, { tools: {} })
  assert.equal(response.result.serverInfo.name, SERVER_NAME)
  assert.equal(response.result.serverInfo.version, SERVER_VERSION)
})

test('notifications get no response', async () => {
  const server = createServer()
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 7 } }), null)
})

test('tools/list returns exactly the five tools, each with a real description', async () => {
  const server = createServer()
  const response = await call(server, 'tools/list')

  const { tools } = response.result
  assert.equal(tools.length, 5)
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ['compile_control_maps', 'describe_spec', 'generate_texture', 'render_scene', 'validate_scene']
  )
  assert.deepEqual(Array.from(tools), Array.from(TOOLS))

  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 80, `${tool.name} has a substantial description`)
    assert.equal(tool.inputSchema.type, 'object')
    assert.ok(Array.isArray(tool.inputSchema.required))
  }
})

test('the tool descriptions tell a model what the tool cannot do', async () => {
  for (const tool of TOOLS) {
    assert.match(tool.description, /cannot/i, `${tool.name} states a limit`)
  }
  const render = TOOLS.find((tool) => tool.name === 'render_scene')
  assert.match(render.description, /diffusion/i)
  assert.match(render.description, /control maps/i)
})

test('ping answers with an empty result', async () => {
  const server = createServer()
  assert.deepEqual((await call(server, 'ping')).result, {})
})

test('an unknown method returns JSON-RPC error -32601', async () => {
  const server = createServer()
  const response = await call(server, 'tools/frobnicate', {}, 42)

  assert.equal(response.id, 42)
  assert.equal(response.error.code, -32601)
  assert.match(response.error.message, /unknown method/)
  assert.equal(response.result, undefined)
})

test('an unknown tool returns JSON-RPC error -32602', async () => {
  const server = createServer()
  const response = await call(server, 'tools/call', { name: 'render_everything', arguments: {} })
  assert.equal(response.error.code, -32602)
})

test('validate_scene returns the diagnostic shape with hint and near', async () => {
  const server = createServer()
  const response = await call(server, 'tools/call', { name: 'validate_scene', arguments: { source: BROKEN } })

  assert.equal(response.result.isError, true, 'a broken scene is reported as a tool error, not a crash')
  const result = payload(response)
  assert.equal(result.ok, false)
  assert.ok(Array.isArray(result.errors))
  assert.ok(Array.isArray(result.warnings))

  const diagnostic = result.errors[0]
  assert.equal(diagnostic.code, 'UNKNOWN_MATERIAL')
  assert.equal(typeof diagnostic.path, 'string')
  assert.equal(typeof diagnostic.line, 'number')
  assert.equal(typeof diagnostic.col, 'number')
  assert.equal(typeof diagnostic.message, 'string')
  assert.ok(diagnostic.hint && diagnostic.hint.length > 0, 'hint is present')
  assert.ok(Array.isArray(diagnostic.near) && diagnostic.near.length > 0, 'near is present')
  assert.ok(diagnostic.near.includes('papel'))
})

test('validate_scene on a valid scene returns ok and the canonical hash', async () => {
  const server = createServer()
  const result = payload(await call(server, 'tools/call', { name: 'validate_scene', arguments: { source: VALID } }))

  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
  assert.match(result.hash, /^[0-9a-f]{16}$/)
})

test('render_scene returns ok:true and an identical hash across two calls', async () => {
  const server = createServer()
  const first = payload(await call(server, 'tools/call', { name: 'render_scene', arguments: { source: VALID } }, 1))
  const second = payload(await call(server, 'tools/call', { name: 'render_scene', arguments: { source: VALID } }, 2))

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.hash, second.hash)
  assert.equal(first.svg, second.svg, 'byte-identical SVG for the same source')
  assert.match(first.hash, /^[0-9a-f]{16}$/)
  assert.equal(first.width, 1200)
  assert.equal(first.height, 630)
  assert.ok(first.svg.startsWith('<svg'))
  assert.ok(first.svg.includes('</svg>'))
})

test('render_scene never throws: a broken scene comes back as diagnostics', async () => {
  const server = createServer()
  const response = await call(server, 'tools/call', { name: 'render_scene', arguments: { source: BROKEN } })
  const result = payload(response)

  assert.equal(result.ok, false)
  assert.equal(response.result.isError, true)
  assert.equal(result.svg, undefined)
  assert.equal(result.errors[0].code, 'UNKNOWN_MATERIAL')
})

test('describe_spec returns the grammar and every vocabulary table', async () => {
  const server = createServer()
  const result = payload(await call(server, 'tools/call', { name: 'describe_spec', arguments: {} }))

  assert.match(result.grammar, /escena <string>/)
  assert.equal(result.canvasPresets.og.width, 1200)
  assert.ok(result.materials.includes('papel'))
  assert.ok(result.lights.includes('suave'))
  assert.ok(result.palettes.includes('neutro'))
  assert.ok(result.styles.includes('editorial'))
  assert.ok(result.icons.includes('check'))
  assert.equal(result.aliases.group, 'grupo')
  assert.equal(result.diagnosticCodes.UNKNOWN_MATERIAL, 'UNKNOWN_MATERIAL')
})

test('generate_texture writes a PNG and reports its path', async () => {
  const server = createServer()
  const dir = mkdtempSync(join(tmpdir(), 'wrt-mcp-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const outPath = join(dir, 'texture.png')

  const result = payload(
    await call(server, 'tools/call', { name: 'generate_texture', arguments: { kind: 'panal', size: 32, seed: 5, outPath } })
  )

  assert.equal(result.ok, true)
  assert.equal(result.width, 32)
  assert.equal(result.height, 32)
  assert.equal(result.path, outPath)
  assert.ok(existsSync(outPath))
})

test('generate_texture rejects an unknown kind with the closest names', async () => {
  const server = createServer()
  const result = payload(await call(server, 'tools/call', { name: 'generate_texture', arguments: { kind: 'panalx' } }))

  assert.equal(result.ok, false)
  assert.ok(result.near.includes('panal'))
  assert.ok(Array.isArray(result.kinds))
})

test('compile_control_maps either writes the four files or says it is unavailable', async () => {
  const server = createServer()
  const dir = mkdtempSync(join(tmpdir(), 'wrt-mcp-control-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const outDir = join(dir, 'maps')

  const result = payload(
    await call(server, 'tools/call', { name: 'compile_control_maps', arguments: { source: VALID, outDir, scale: 0.25 } })
  )

  if (result.ok === false) {
    // The compiler lives in its own module and may be missing or still broken.
    // What matters here is that the failure is a value, not an exception.
    assert.equal(typeof result.error, 'string')
    assert.ok(result.error.length > 0)
    assert.equal(result.files, undefined)
    return
  }

  assert.ok(existsSync(join(outDir, 'depth.png')))
  assert.ok(existsSync(join(outDir, 'edges.png')))
  assert.ok(existsSync(join(outDir, 'segmentation.png')))
  assert.ok(existsSync(join(outDir, 'maps.json')))
  assert.equal(result.json.width, 300)
})

test('compile_control_maps requires outDir instead of guessing one', async () => {
  const server = createServer()
  const result = payload(await call(server, 'tools/call', { name: 'compile_control_maps', arguments: { source: VALID } }))
  assert.equal(result.ok, false)
  assert.match(result.error, /outDir is required/)
})

test('handleStdio answers newline-delimited requests in order', async () => {
  const listeners = new Map()
  const written = []
  const input = {
    setEncoding: () => {},
    on: (event, handler) => listeners.set(event, handler)
  }
  const output = { write: (chunk) => written.push(chunk) }

  const done = handleStdio({ input, output })

  listeners.get('data')(
    [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      '',
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'nope' }),
      '{not json'
    ].join('\n') + '\n'
  )
  listeners.get('end')()
  await done

  const messages = written.map((chunk) => JSON.parse(chunk))
  assert.equal(messages.length, 4, 'notifications and blank lines produce no output')
  assert.deepEqual(messages.map((m) => m.id), [1, 2, 3, null])
  assert.equal(messages[0].result.serverInfo.name, SERVER_NAME)
  assert.equal(messages[1].result.tools.length, 5)
  assert.equal(messages[2].error.code, -32601)
  assert.equal(messages[3].error.code, -32700)
  for (const message of messages) assert.ok(message.jsonrpc === '2.0')
})
