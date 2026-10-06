import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, '..', 'src', 'cli.js')

const Q = String.fromCharCode(34)
const VALID = [
  'escena ' + Q + 'poster' + Q + ' {',
  '  lienzo: og',
  '  luz: suave',
  '  grupo ' + Q + 'contenido' + Q + ' {',
  '    espacio: 16',
  '    titulo ' + Q + 'Hola mundo' + Q + ' { tam: 44 }',
  '    subtitulo ' + Q + 'Un subtitulo' + Q + ' { tam: 18 }',
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
 * @param {string[]} args
 * @param {{ stdin?: string, cwd?: string }} [options]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: options.cwd ?? HERE,
    input: options.stdin ?? ''
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * @returns {string} a fresh temp dir, removed when the process exits
 */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wrt-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('validate exits 0 on a valid scene', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  writeFileSync(file, VALID)

  const result = run(['validate', file])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /1 file\(s\) checked, 0 error\(s\)/)
  assert.equal(result.stderr, '', 'a clean file produces no diagnostic output')
})

test('validate exits 1 on a broken scene and prints code, path, hint and near', () => {
  const dir = tempDir()
  const file = join(dir, 'bad.wrt')
  writeFileSync(file, BROKEN)

  const result = run(['validate', file])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /UNKNOWN_MATERIAL/)
  assert.match(result.stderr, /panel\.material/)
  assert.match(result.stderr, /3:\d+/)
  assert.match(result.stderr, /hint: /)
  assert.match(result.stderr, /did you mean: /)
  assert.match(result.stdout, /1 file\(s\) checked, 1 error\(s\)/)
  assert.match(result.stdout, /bad\.wrt: failed/)
})

test('validate reads stdin when the path is -', () => {
  const result = run(['validate', '-'], { stdin: VALID })
  assert.equal(result.status, 0, result.stderr)

  const broken = run(['validate', '-'], { stdin: BROKEN })
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /UNKNOWN_MATERIAL/)
})

test('validate --json emits parseable JSON on stdout', () => {
  const dir = tempDir()
  const good = join(dir, 'ok.wrt')
  const bad = join(dir, 'bad.wrt')
  writeFileSync(good, VALID)
  writeFileSync(bad, BROKEN)

  const ok = run(['validate', good, '--json'])
  assert.equal(ok.status, 0, ok.stderr)
  const okPayload = JSON.parse(ok.stdout)
  assert.equal(okPayload.ok, true)
  assert.equal(okPayload.errorCount, 0)
  assert.equal(okPayload.files.length, 1)
  assert.match(okPayload.files[0].hash, /^[0-9a-f]{16}$/)

  const failed = run(['validate', bad, '--json'])
  assert.equal(failed.status, 1)
  const failedPayload = JSON.parse(failed.stdout)
  assert.equal(failedPayload.ok, false)
  assert.equal(failedPayload.files[0].errors[0].code, 'UNKNOWN_MATERIAL')
  assert.ok(Array.isArray(failedPayload.files[0].errors[0].near))
})

test('validate accepts several files and reports the broken one', () => {
  const dir = tempDir()
  const good = join(dir, 'a.wrt')
  const bad = join(dir, 'b.wrt')
  writeFileSync(good, VALID)
  writeFileSync(bad, BROKEN)

  const result = run(['validate', good, bad])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /2 file\(s\) checked, 1 error\(s\)/)
})

test('render writes SVG that parses as XML-ish to stdout', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  writeFileSync(file, VALID)

  const result = run(['render', file])
  assert.equal(result.status, 0, result.stderr)
  const svg = result.stdout.trim()
  assert.ok(svg.startsWith('<svg'), 'starts with <svg')
  assert.ok(svg.includes('</svg>'), 'closes with </svg>')
  assert.match(svg, /<svg[^>]*viewBox="0 0 1200 630"/)
})

test('render -o writes the file and reports the hash', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  const out = join(dir, 'out', 'poster.svg')
  writeFileSync(file, VALID)

  const result = run(['render', file, '-o', out])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /1200x630 [0-9a-f]{16}/)
  const svg = readFileSync(out, 'utf8')
  assert.ok(svg.trim().startsWith('<svg'))
})

test('render --compact produces the same SVG without indentation', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  writeFileSync(file, VALID)

  const pretty = run(['render', file])
  const compact = run(['render', file, '--compact'])
  assert.equal(compact.status, 0, compact.stderr)
  assert.ok(!compact.stdout.includes('\n  <'), 'no indentation in compact output')
  assert.ok(compact.stdout.trim().startsWith('<svg'))
  assert.ok(pretty.stdout.length > compact.stdout.length)
})

test('render --json returns svg, hash and dimensions', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  writeFileSync(file, VALID)

  const result = run(['render', file, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)
  assert.match(payload.hash, /^[0-9a-f]{16}$/)
  assert.equal(payload.width, 1200)
  assert.equal(payload.height, 630)
  assert.ok(payload.svg.startsWith('<svg'))
})

test('render exits 1 and keeps the diagnostics on a broken scene', () => {
  const dir = tempDir()
  const file = join(dir, 'bad.wrt')
  writeFileSync(file, BROKEN)

  const result = run(['render', file])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /UNKNOWN_MATERIAL/)

  const asJson = run(['render', file, '--json'])
  assert.equal(asJson.status, 1)
  assert.equal(JSON.parse(asJson.stdout).errors[0].code, 'UNKNOWN_MATERIAL')
})

test('hash prints 16 hex chars and is stable across runs', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  writeFileSync(file, VALID)

  const first = run(['hash', file])
  const second = run(['hash', file])
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout.trim(), /^[0-9a-f]{16}$/)
  assert.equal(first.stdout, second.stdout)

  const viaStdin = run(['hash', '-'], { stdin: VALID })
  assert.equal(viaStdin.stdout, first.stdout)
})

test('hash exits 1 on a broken scene', () => {
  const dir = tempDir()
  const file = join(dir, 'bad.wrt')
  writeFileSync(file, BROKEN)

  const result = run(['hash', file])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
})

test('spec prints the grammar', () => {
  const result = run(['spec'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /WritterArt/)
  assert.match(result.stdout, /escena <string>\? \{ <statement>\* \}/)
  assert.match(result.stdout, /top level:= lienzo/)
})

test('vocabulary prints every registry and supports --json', () => {
  const result = run(['vocabulary'])
  assert.equal(result.status, 0, result.stderr)
  for (const name of ['materials', 'lights', 'palettes', 'styles', 'icons']) {
    assert.ok(result.stdout.includes(name), `prints the ${name} section`)
  }
  assert.match(result.stdout, /papel/)

  const asJson = run(['vocabulary', '--json'])
  assert.equal(asJson.status, 0, asJson.stderr)
  const payload = JSON.parse(asJson.stdout)
  assert.ok(payload.materials.includes('papel'))
  assert.ok(payload.lights.includes('suave'))
  assert.ok(payload.styles.includes('editorial'))
  assert.ok(Array.isArray(payload.icons))
  assert.equal(payload.aliases.group, 'grupo')
})

test('texture writes a PNG and an unknown kind exits 1 with the closest names', () => {
  const dir = tempDir()
  const out = join(dir, 'wood.png')

  const ok = run(['texture', 'madera', '-o', out, '--size', '64', '--seed', '3'])
  assert.equal(ok.status, 0, ok.stderr)
  assert.ok(existsSync(out))
  const bytes = readFileSync(out)
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])

  const unknown = run(['texture', 'madera_', '-o', join(dir, 'nope.png')])
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /unknown texture kind/)
  assert.match(unknown.stderr, /did you mean: madera/)
  assert.ok(!existsSync(join(dir, 'nope.png')))
})

test('texture accepts repeatable --param key=value', () => {
  const dir = tempDir()
  const a = join(dir, 'a.png')
  const b = join(dir, 'b.png')

  const first = run(['texture', 'voro', '-o', a, '--size', '32', '--param', 'celdas=4', '--param', 'intensidad=1.2'])
  const second = run(['texture', 'voro', '-o', b, '--size', '32', '--param', 'celdas=4', '--param', 'intensidad=1.2'])
  assert.equal(first.status, 0, first.stderr)
  assert.ok(readFileSync(a).equals(readFileSync(b)), 'same params, same bytes')
})

test('control writes depth, edges, segmentation and maps.json', () => {
  const dir = tempDir()
  const file = join(dir, 'ok.wrt')
  const outDir = join(dir, 'maps')
  writeFileSync(file, VALID)

  const result = run(['control', file, '-o', outDir, '--scale', '0.25'])
  if (result.status !== 0) {
    // The control map compiler lives in its own module and may be missing or
    // broken. The command must degrade into one clear line, never a stack trace.
    assert.equal(result.status, 1)
    assert.match(result.stderr, /^control maps (unavailable|failed): /)
    assert.equal(result.stderr.trim().split('\n').length, 1, 'exactly one line on stderr')
    assert.equal(result.stderr.includes('at Object'), false, 'no stack trace')
    assert.equal(result.stdout, '')
    return
  }

  assert.match(result.stdout, /depth\.png/)
  for (const name of ['depth.png', 'edges.png', 'segmentation.png', 'maps.json']) {
    assert.ok(existsSync(join(outDir, name)), `${name} written`)
  }
  const maps = JSON.parse(readFileSync(join(outDir, 'maps.json'), 'utf8'))
  assert.equal(maps.width, 300)
  assert.equal(maps.height, 158)
  assert.ok(Array.isArray(maps.nodes))
})

test('usage errors exit 2 with one line and no stack trace', () => {
  const unknownCommand = run(['nope'])
  assert.equal(unknownCommand.status, 2)
  assert.match(unknownCommand.stderr, /unknown command/)
  assert.equal(unknownCommand.stderr.includes('at Object'), false)

  const missingFile = run(['render'])
  assert.equal(missingFile.status, 2)
  assert.match(missingFile.stderr, /error: render expects a file/)

  const noArgs = run(['validate'])
  assert.equal(noArgs.status, 2)

  const unreadable = run(['validate', join(tmpdir(), 'definitely-missing.wrt')])
  assert.equal(unreadable.status, 2)
  assert.match(unreadable.stderr, /cannot read/)

  const badNumber = run(['texture', 'fbm', '--size', 'big'])
  assert.equal(badNumber.status, 2)
  assert.match(badNumber.stderr, /--size expects a number/)
})

test('help lists every command', () => {
  const result = run(['help'])
  assert.equal(result.status, 0)
  for (const command of ['spec', 'vocabulary', 'validate', 'render', 'hash', 'texture', 'control', 'help']) {
    assert.ok(result.stdout.includes(command), `help mentions ${command}`)
  }

  const bare = run([])
  assert.equal(bare.status, 0)
  assert.equal(bare.stdout, result.stdout)
})
