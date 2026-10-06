import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodePng, writePng } from '../src/png.js'

const WIDTH = 5
const HEIGHT = 3

/**
 * Deterministic non-uniform RGBA bytes: depends on x and y, never on time.
 *
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
function makeData(w = WIDTH, h = HEIGHT) {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < data.length; i++) {
    data[i] = (i * 37 + (i % (w * h)) * 11) & 0xff
  }
  return data
}

/**
 * Walk the PNG chunk stream without decoding anything.
 *
 * @param {Buffer} buf
 * @returns {{ type: string, start: number, length: number }[]}
 */
function chunks(buf) {
  const out = []
  let at = 8
  while (at < buf.length) {
    const length = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    out.push({ type, start: at, length })
    at += 12 + length
  }
  return out
}

test('starts with the PNG signature', () => {
  const buf = encodePng({ width: WIDTH, height: HEIGHT, data: makeData() })
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})

test('IHDR carries width, height and colour type at fixed offsets', () => {
  const buf = encodePng({ width: WIDTH, height: HEIGHT, data: makeData() })

  // 8..11 length, 12..15 type, 16..19 width, 20..23 height
  assert.equal(buf.readUInt32BE(8), 13, 'IHDR length')
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR')
  assert.equal(buf.readUInt32BE(16), WIDTH, 'width at offset 16')
  assert.equal(buf.readUInt32BE(20), HEIGHT, 'height at offset 20')
  assert.equal(buf[24], 8, 'bit depth')
  assert.equal(buf[25], 6, 'colour type 6 = RGBA')
  assert.equal(buf[26], 0, 'compression method')
  assert.equal(buf[27], 0, 'filter method')
  assert.equal(buf[28], 0, 'interlace method')
})

test('ends with IEND', () => {
  const buf = encodePng({ width: WIDTH, height: HEIGHT, data: makeData() })
  const list = chunks(buf)

  assert.equal(list[list.length - 1].type, 'IEND')
  assert.equal(list[list.length - 1].length, 0)
  assert.equal(buf.subarray(-8, -4).toString('latin1'), 'IEND')
  assert.equal(buf.readUInt32BE(buf.length - 4), 0xae426082, 'well known IEND CRC')
  assert.equal(buf.length, 8 + 25 + (12 + list[1].length) + 12, 'no bytes after IEND')
})

test('emits exactly one IDAT and no ancillary chunks', () => {
  const buf = encodePng({ width: WIDTH, height: HEIGHT, data: makeData() })
  const list = chunks(buf)

  assert.deepEqual(list.map((c) => c.type), ['IHDR', 'IDAT', 'IEND'])
  assert.equal(list.filter((c) => c.type === 'IDAT').length, 1)
})

test('IDAT inflates to filter-0 scanlines that match the input pixels', () => {
  const data = makeData()
  const buf = encodePng({ width: WIDTH, height: HEIGHT, data })
  const idat = chunks(buf).find((c) => c.type === 'IDAT')
  const raw = inflateSync(buf.subarray(idat.start + 8, idat.start + 8 + idat.length))

  const stride = WIDTH * 4
  assert.equal(raw.length, HEIGHT * (stride + 1), 'one filter byte per scanline')

  for (let y = 0; y < HEIGHT; y++) {
    const at = y * (stride + 1)
    assert.equal(raw[at], 0, `filter byte of row ${y} is None`)
    for (let b = 0; b < stride; b++) {
      assert.equal(raw[at + 1 + b], data[y * stride + b], `row ${y} byte ${b}`)
    }
  }
})

test('two encodes of the same input are byte-identical', () => {
  const image = { width: WIDTH, height: HEIGHT, data: makeData() }
  const first = encodePng(image)
  const second = encodePng(image)

  assert.ok(first.equals(second), 'byte-for-byte equal')
  assert.deepEqual([...first], [...second])
})

test('accepts Uint8ClampedArray input', () => {
  const clamped = new Uint8ClampedArray(makeData())
  assert.ok(encodePng({ width: WIDTH, height: HEIGHT, data: clamped }).equals(encodePng({ width: WIDTH, height: HEIGHT, data: makeData() })))
})

test('rejects data whose length is not width*height*4', () => {
  const data = makeData()

  assert.throws(() => encodePng({ width: WIDTH, height: HEIGHT, data: data.subarray(0, -1) }), TypeError)
  assert.throws(() => encodePng({ width: WIDTH, height: HEIGHT, data: new Uint8Array(data.length + 4) }), TypeError)
  assert.throws(() => encodePng({ width: WIDTH + 1, height: HEIGHT, data }), TypeError)
  assert.throws(() => encodePng({ width: WIDTH, height: HEIGHT }), TypeError)
  assert.throws(() => encodePng({ width: WIDTH, height: HEIGHT, data: [0, 0, 0, 0] }), TypeError)
})

test('rejects non-positive and non-integer dimensions', () => {
  const data = makeData()

  assert.throws(() => encodePng({ width: 0, height: HEIGHT, data }), TypeError)
  assert.throws(() => encodePng({ width: WIDTH, height: -1, data }), TypeError)
  assert.throws(() => encodePng({ width: 2.5, height: HEIGHT, data }), TypeError)
  assert.throws(() => encodePng({ width: '5', height: HEIGHT, data }), TypeError)
  assert.throws(() => encodePng({ height: HEIGHT, data }), TypeError)
})

test('writePng writes exactly the bytes encodePng returns', () => {
  const image = { width: WIDTH, height: HEIGHT, data: makeData() }
  const expected = encodePng(image)
  const dir = join(tmpdir(), `writterart-png-test-${process.pid}`)

  try {
    const path = join(dir, 'out.png')
    mkdirSync(dir, { recursive: true })
    const written = writePng(path, image)
    assert.equal(written, expected.length)
    assert.ok(readFileSync(path).equals(expected))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})