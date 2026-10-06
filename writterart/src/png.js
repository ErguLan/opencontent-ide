/**
 * Minimal PNG encoder, RGBA8 only.
 *
 * The package has zero dependencies, so the encoder is written here instead of
 * pulled from npm. It emits the shortest legal PNG for the job:
 *
 *   signature | IHDR | IDAT | IEND
 *
 * No ancillary chunks (no tEXt, no tIME, no pHYs, no gAMA): a file produced
 * here is a pure function of its pixels, so two encodes of the same input are
 * byte-identical and diffable.
 *
 * Layout of the emitted file, useful when reading raw bytes in tests:
 *
 *   0..7    signature
 *   8..11   IHDR length (13)
 *   12..15  'IHDR'
 *   16..19  width      (uint32 BE)
 *   20..23  height     (uint32 BE)
 *   24      bit depth  (8)
 *   25      colour type (6 = truecolour with alpha)
 *   26..28  compression, filter method, interlace (0, 0, 0)
 *   29..32  IHDR CRC
 *   33..    IDAT ...
 *
 * @module png
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

/** The 8 PNG signature bytes. */
const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** CRC-32 lookup table for the PNG polynomial, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/**
 * CRC-32 of `buf[start, end)`.
 *
 * @param {Uint8Array} buf
 * @param {number} start inclusive
 * @param {number} end exclusive
 * @returns {number} unsigned 32-bit integer
 */
function crc32(buf, start, end) {
  let c = 0xffffffff
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Wrap payload bytes into a PNG chunk: length, type, data, CRC of type+data.
 *
 * @param {string} type four ASCII characters
 * @param {Uint8Array} data chunk payload
 * @returns {Buffer}
 */
function chunk(type, data) {
  const out = Buffer.allocUnsafe(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 4, 'latin1')
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8)
  out.writeUInt32BE(crc32(out, 4, 8 + data.length), 8 + data.length)
  return out
}

/**
 * Validate one dimension.
 *
 * @param {unknown} value
 * @param {string} name 'width' or 'height'
 * @returns {number} positive integer
 */
function dimension(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`png: ${name} must be a positive integer, received ${String(value)}`)
  }
  if (value > 0x7fffffff) {
    throw new RangeError(`png: ${name} exceeds the PNG limit of 2147483647`)
  }
  return value
}

/**
 * Encode raw RGBA bytes as a PNG.
 *
 * @example
 * const buf = encodePng({ width: 2, height: 1, data: Uint8Array.from([
 *   255, 0, 0, 255, 0, 255, 0, 255
 * ]) })
 *
 * @param {{ width: number, height: number, data: Uint8Array|Uint8ClampedArray }} image
 *   `data` holds `width * height * 4` RGBA bytes, row major, top row first.
 * @returns {Buffer} complete PNG file bytes
 * @throws {TypeError} if a dimension is not a positive integer or `data` has the wrong length or type
 * @throws {RangeError} if a dimension exceeds the PNG limit
 */
export function encodePng({ width, height, data } = {}) {
  const w = dimension(width, 'width')
  const h = dimension(height, 'height')

  const isBytes = data instanceof Uint8Array || data instanceof Uint8ClampedArray
  if (!isBytes) {
    throw new TypeError('png: data must be a Uint8Array or Uint8ClampedArray of width*height*4 RGBA bytes')
  }
  const expected = w * h * 4
  if (data.length !== expected) {
    throw new TypeError(`png: data length ${data.length} does not match width*height*4 = ${expected}`)
  }

  // Raw scanlines: one filter byte (0 = None) followed by the row's RGBA bytes.
  const stride = w * 4
  const raw = Buffer.allocUnsafe(h * (stride + 1))
  const src = new Uint8Array(data.buffer, data.byteOffset, data.length)
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1)
    raw[at] = 0
    raw.set(src.subarray(y * stride, y * stride + stride), at + 1)
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  ihdr[10] = 0 // compression method: deflate
  ihdr[11] = 0 // filter method: adaptive
  ihdr[12] = 0 // interlace: none

  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Encode and write a PNG to disk.
 *
 * @example
 * const bytes = writePng('out/texture.png', { width, height, data: rgba })
 *
 * @param {string} path destination file path
 * @param {{ width: number, height: number, data: Uint8Array|Uint8ClampedArray }} image
 *   same input as {@link encodePng}
 * @returns {number} number of bytes written
 * @throws {TypeError} see {@link encodePng}
 */
export function writePng(path, image) {
  const bytes = encodePng(image)
  writeFileSync(path, bytes)
  return bytes.length
}