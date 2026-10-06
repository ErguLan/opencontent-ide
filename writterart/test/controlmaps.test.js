import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from '../src/render/index.js'
import { compileControlMaps, writeControlMaps } from '../src/controlmaps.js'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

const SOURCE = `
escena "control maps" {
  lienzo: "800x600"
  fondo: { color: "#101418" }

  columna {
    padding: 40
    espacio: 24

    titulo "Hola WritterArt" { tam: 44 }

    fila {
      espacio: 16
      icono "check" { tam: 32 }
      subtitulo "Compila mapas de control" { tam: 18 }
    }

    imagen {
      etiqueta: "imagen"
      ancho: 300
      alto: 160
    }

    panel {
      texto: "tarjeta"
      ancho: 300
      alto: 120
    }
  }
}
`

/**
 * Solve the fixture scene through the real pipeline.
 *
 * @returns {object} layout with `width`, `height` and a flat `nodes` array
 */
function layoutOf() {
  const result = render(SOURCE)
  assert.ok(result.ok, `fixture scene must render, got ${JSON.stringify(result.errors)}`)
  assert.ok(result.layout, 'render must return a layout')
  return result.layout
}

/**
 * Every alpha byte of an RGBA buffer.
 *
 * @param {Uint8ClampedArray} rgba
 * @returns {boolean} true when no alpha byte is missing
 */
function alphaIsOpaque(rgba) {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return false
  }
  return true
}

/**
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @returns {number} the most common grey level, as a rough "how much is lit" probe
 */
function maxByte(rgba) {
  let max = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > max) max = rgba[i]
  }
  return max
}

test('every raster is width*height*4 bytes with opaque alpha', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout)

  assert.equal(maps.width, layout.width)
  assert.equal(maps.height, layout.height)

  for (const raster of [maps.depth, maps.edges, maps.segmentation]) {
    assert.equal(raster.width, layout.width, 'raster width')
    assert.equal(raster.height, layout.height, 'raster height')
    assert.equal(raster.rgba.length, layout.width * layout.height * 4, 'rgba length')
    assert.ok(alphaIsOpaque(raster.rgba), 'alpha is 255 on every pixel')
  }
})

test('depth and edges are grayscale', () => {
  const maps = compileControlMaps(layoutOf())

  for (const raster of [maps.depth, maps.edges]) {
    for (let i = 0; i < raster.rgba.length; i += 4) {
      if (raster.rgba[i] !== raster.rgba[i + 1] || raster.rgba[i] !== raster.rgba[i + 2]) {
        assert.fail(`pixel ${i / 4} is not grayscale: ${raster.rgba[i]}, ${raster.rgba[i + 1]}, ${raster.rgba[i + 2]}`)
      }
    }
  }
})

test('json carries every node in paint order with a 0..1 depth', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout, { seed: 5 })

  assert.equal(maps.json.width, layout.width)
  assert.equal(maps.json.height, layout.height)
  assert.equal(maps.json.seed, 5)
  assert.equal(maps.json.sensitivity, 0.08)
  assert.deepEqual(
    maps.json.nodes.map((node) => node.id),
    layout.nodes.map((node) => node.id),
    'json ids follow paint order'
  )

  for (const node of maps.json.nodes) {
    assert.ok(node.depth >= 0 && node.depth <= 1, `${node.id} depth ${node.depth} is inside 0..1`)
    assert.equal(typeof node.type, 'string')
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.equal(typeof node.box[key], 'number', `${node.id} box.${key}`)
    }
  }

  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  for (const node of maps.json.nodes) {
    assert.deepEqual(node.box, { ...byId.get(node.id).box }, `${node.id} box matches the layout`)
  }
})

test('the background is the darkest thing in the depth map and text the brightest', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout)

  const root = maps.json.nodes.find((node) => node.id === 'root')
  const title = maps.json.nodes.find((node) => node.type === 'text')
  const icon = maps.json.nodes.find((node) => node.type === 'icon')

  assert.equal(root.depth, 0.25, 'a full-canvas container is the darkest layer')
  assert.ok(root.depth < title.depth, 'text reads brighter than the container behind it')
  assert.ok(icon.depth < title.depth, 'icons sit below text')
  assert.ok(icon.depth > root.depth, 'icons sit above containers')
})

test('edges are drawn inside and outside every node rectangle', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout)
  const rgba = maps.edges.rgba

  const panel = layout.nodes.find((node) => node.type === 'panel')
  const x = Math.round(panel.box.x + panel.box.w / 2)
  const y = Math.round(panel.box.y)
  const at = (py) => rgba[(py * maps.width + x) * 4]

  assert.equal(at(y - 1), 255, 'one pixel outside the box')
  assert.equal(at(y), 255, 'one pixel inside the box')
  assert.equal(at(y + 1), 0, 'no stroke deeper than one pixel at the default sensitivity')
  assert.equal(maxByte(rgba), 255, 'edges reach full white')
})

test('a higher sensitivity softens the edges', () => {
  const layout = layoutOf()

  const count = (rgba) => {
    let hard = 0
    let lit = 0
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] > 0) lit += 1
      if (rgba[i] === 255) hard += 1
    }
    return { hard, lit }
  }

  const sharp = count(compileControlMaps(layout, { sensitivity: 0 }).edges.rgba)
  const soft = count(compileControlMaps(layout, { sensitivity: 0.9 }).edges.rgba)

  assert.equal(sharp.hard, sharp.lit, 'sensitivity 0 is a hard line everywhere')
  assert.ok(soft.lit > soft.hard, 'a high sensitivity leaves few hard pixels')
  assert.ok(soft.lit > sharp.lit, 'a high sensitivity spreads the same outlines')
})

test('segmentation has one distinct colour per node plus the reserved background', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout, { seed: 5 })
  const index = maps.segmentation.index

  assert.deepEqual(Object.keys(index), ['_fondo', ...layout.nodes.map((node) => node.id)])
  assert.deepEqual(index._fondo, [0, 0, 0], 'the reserved background is pure black')

  const keys = new Set()
  for (const [id, rgb] of Object.entries(index)) {
    assert.equal(rgb.length, 3, `${id} is an RGB triplet`)
    for (const channel of rgb) {
      assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, `${id} channel is a byte`)
    }
    const key = rgb.join(',')
    assert.ok(!keys.has(key), `${id} duplicates the colour of another segment (${key})`)
    keys.add(key)
  }
  assert.equal(keys.size, layout.nodes.length + 1)
})

test('segments never bleed into their neighbours', () => {
  const layout = layoutOf()
  const maps = compileControlMaps(layout, { seed: 5 })
  const index = maps.segmentation.index
  const rgba = maps.segmentation.rgba

  const icon = layout.nodes.find((node) => node.type === 'icon')
  const x = Math.round(icon.box.x + icon.box.w / 2)
  const y = Math.round(icon.box.y)
  const own = index[icon.id]
  const darkened = own.map((channel) => (channel * 0.42) | 0)

  for (const offset of [0, 1]) {
    const p = ((y - offset) * maps.width + x) * 4
    assert.deepEqual(
      [rgba[p], rgba[p + 1], rgba[p + 2]],
      darkened,
      `row ${y - offset} is a darker ${own.join(',')}, not a neighbour's colour`
    )
  }
})

test('the same seed produces byte-identical buffers', () => {
  const layout = layoutOf()
  const first = compileControlMaps(layout, { seed: 11, sensitivity: 0.2 })
  const second = compileControlMaps(layout, { seed: 11, sensitivity: 0.2 })

  assert.deepEqual(first.depth.rgba, second.depth.rgba, 'depth')
  assert.deepEqual(first.edges.rgba, second.edges.rgba, 'edges')
  assert.deepEqual(first.segmentation.rgba, second.segmentation.rgba, 'segmentation')
  assert.deepEqual(first.segmentation.index, second.segmentation.index, 'palette')
  assert.deepEqual(first.json, second.json, 'json')
})

test('a different seed only moves the segmentation colours', () => {
  const layout = layoutOf()
  const a = compileControlMaps(layout, { seed: 1 })
  const b = compileControlMaps(layout, { seed: 2 })

  assert.deepEqual(a.depth.rgba, b.depth.rgba, 'depth does not depend on the seed')
  assert.deepEqual(a.edges.rgba, b.edges.rgba, 'edges do not depend on the seed')
  assert.notDeepEqual(a.segmentation.rgba, b.segmentation.rgba, 'segmentation pixels move')
  assert.notDeepEqual(a.segmentation.index, b.segmentation.index, 'palette moves')

  const root = 'root'
  assert.notDeepEqual(a.segmentation.index[root], b.segmentation.index[root])
  assert.deepEqual(a.segmentation.index._fondo, b.segmentation.index._fondo, 'the background is reserved')
  assert.equal(a.json.seed, 1)
  assert.equal(b.json.seed, 2)
})

test('a layout carrying only a root tree yields the same paint order', () => {
  const layout = layoutOf()
  const tree = { ...layout, nodes: undefined, root: layout.nodes[0] }
  const fromNodes = compileControlMaps(layout, { seed: 4 })
  const fromRoot = compileControlMaps(tree, { seed: 4 })

  assert.deepEqual(
    fromRoot.json.nodes.map((node) => node.id),
    fromNodes.json.nodes.map((node) => node.id),
    'identity de-duplication keeps paint order'
  )
  assert.deepEqual(fromRoot.depth.rgba, fromNodes.depth.rgba)
})

test('resizing returns correctly sized buffers', () => {
  const layout = layoutOf()

  for (const [width, height] of [[400, 300], [1200, 900], [97, 61]]) {
    const maps = compileControlMaps(layout, { width, height })

    assert.equal(maps.width, width)
    assert.equal(maps.height, height)
    assert.equal(maps.json.width, width)
    assert.equal(maps.json.height, height)

    for (const raster of [maps.depth, maps.edges, maps.segmentation]) {
      assert.equal(raster.width, width, `raster width at ${width}x${height}`)
      assert.equal(raster.height, height, `raster height at ${width}x${height}`)
      assert.equal(raster.rgba.length, width * height * 4, `rgba length at ${width}x${height}`)
      assert.ok(alphaIsOpaque(raster.rgba), `opaque at ${width}x${height}`)
    }

    assert.deepEqual(
      Object.keys(maps.segmentation.index),
      ['_fondo', ...layout.nodes.map((node) => node.id)],
      'the palette does not depend on the raster size'
    )
  }
})

test('resizing is deterministic and never blends two segment colours', () => {
  const layout = layoutOf()
  const native = compileControlMaps(layout, { seed: 5 })
  const maps = compileControlMaps(layout, { width: 640, height: 480, seed: 5 })
  const again = compileControlMaps(layout, { width: 640, height: 480, seed: 5 })

  assert.deepEqual(maps.edges.rgba, again.edges.rgba)
  assert.deepEqual(maps.segmentation.rgba, again.segmentation.rgba)

  // Nearest-neighbour resampling can only ever copy a pixel that already
  // exists, so no output colour is a blend of two segments.
  const known = new Set()
  for (let i = 0; i < native.segmentation.rgba.length; i += 4) {
    known.add(
      `${native.segmentation.rgba[i]},${native.segmentation.rgba[i + 1]},${native.segmentation.rgba[i + 2]}`
    )
  }
  for (let i = 0; i < maps.segmentation.rgba.length; i += 4) {
    const key = `${maps.segmentation.rgba[i]},${maps.segmentation.rgba[i + 1]},${maps.segmentation.rgba[i + 2]}`
    assert.ok(known.has(key), `pixel ${i / 4} is not a source colour: ${key}`)
  }
})

test('rejects a layout that is not a layout', () => {
  assert.throws(() => compileControlMaps(null), TypeError)
  assert.throws(() => compileControlMaps({ width: 0, height: 10, nodes: [] }), TypeError)
  assert.throws(() => compileControlMaps({ width: 10, height: 10, nodes: [] }, { width: -4 }), TypeError)
  assert.throws(() => writeControlMaps({ width: 10, height: 10, nodes: [] }, ''), TypeError)
})

test('writeControlMaps writes depth, edges, segmentation and maps.json', () => {
  const layout = layoutOf()
  const dir = mkdtempSync(join(tmpdir(), 'writterart-controlmaps-'))

  try {
    const result = writeControlMaps(layout, join(dir, 'nested'), { width: 320, height: 240, seed: 9 })

    assert.deepEqual(result.files, {
      depth: join(dir, 'nested', 'depth.png'),
      edges: join(dir, 'nested', 'edges.png'),
      segmentation: join(dir, 'nested', 'segmentation.png')
    })

    for (const name of ['depth.png', 'edges.png', 'segmentation.png', 'maps.json']) {
      assert.ok(existsSync(join(dir, 'nested', name)), `${name} exists`)
    }

    for (const path of [result.files.depth, result.files.edges, result.files.segmentation]) {
      const bytes = readFileSync(path)
      assert.deepEqual([...bytes.subarray(0, 8)], SIGNATURE, `${path} starts with the PNG signature`)
      assert.equal(bytes.readUInt32BE(16), 320, `${path} carries the requested width`)
      assert.equal(bytes.readUInt32BE(20), 240, `${path} carries the requested height`)
    }

    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'nested', 'maps.json'), 'utf8')), result.json)
    assert.deepEqual(
      result.json.nodes.map((node) => node.id),
      layout.nodes.map((node) => node.id)
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeControlMaps writes into an existing directory without complaining', () => {
  const layout = layoutOf()
  const dir = mkdtempSync(join(tmpdir(), 'writterart-controlmaps-'))

  try {
    writeControlMaps(layout, dir, { width: 160, height: 120 })
    const second = writeControlMaps(layout, dir, { width: 160, height: 120 })

    assert.ok(existsSync(second.files.depth))
    assert.ok(existsSync(join(dir, 'maps.json')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})