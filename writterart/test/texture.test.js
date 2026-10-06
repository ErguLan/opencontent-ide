import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTexture, TEXTURE_KINDS, __test__ } from '../src/texture.js'

const REQUIRED_KINDS = [
  'ruido', 'fbm', 'voro', 'madera', 'metal',
  'marmol', 'asfalto', 'tejido', 'piedra', 'panal',
]

/**
 * @param {Uint8ClampedArray} a
 * @param {Uint8ClampedArray} b
 * @returns {boolean}
 */
function sameBytes(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Difference between the last column and the first one (the wrap seam), against
 * the distribution of differences between adjacent columns inside the image.
 * A pattern that really tiles has a seam indistinguishable from ordinary
 * structure; a broken one shows up as a diff nothing else in the image reaches.
 *
 * @param {{ width: number, rgba: Uint8ClampedArray }} image
 * @returns {{ seamMean: number, seamMax: number, p99: number, interiorMax: number }}
 */
function seamStats({ width, rgba }) {
  const diffs = []
  let seamSum = 0
  let seamMax = 0

  for (let y = 0; y < width; y++) {
    const seam = Math.abs(rgba[(y * width) * 4] - rgba[(y * width + width - 1) * 4])
    seamSum += seam
    if (seam > seamMax) seamMax = seam
    for (let x = 0; x < width - 1; x++) {
      diffs.push(Math.abs(rgba[(y * width + x) * 4] - rgba[(y * width + x + 1) * 4]))
    }
  }

  diffs.sort((a, b) => a - b)
  return {
    seamMean: seamSum / width,
    seamMax,
    p99: diffs[Math.floor(0.99 * (diffs.length - 1))],
    interiorMax: diffs[diffs.length - 1],
  }
}

test('TEXTURE_KINDS lists exactly the ten required kinds', () => {
  assert.deepEqual([...TEXTURE_KINDS].sort(), [...REQUIRED_KINDS].sort())
  assert.equal(TEXTURE_KINDS.length, REQUIRED_KINDS.length)
})

test('every kind fills a correctly sized buffer with opaque pixels', () => {
  for (const kind of TEXTURE_KINDS) {
    const size = 64
    const { width, height, rgba } = generateTexture({ kind, size, seed: 1 })

    assert.equal(width, size, `${kind}: width`)
    assert.equal(height, size, `${kind}: height`)
    assert.ok(rgba instanceof Uint8ClampedArray, `${kind}: rgba is Uint8ClampedArray`)
    assert.equal(rgba.length, size * size * 4, `${kind}: rgba length`)

    for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], 255, `${kind}: alpha at pixel ${(i - 3) / 4}`)

    // A flat buffer would mean the generator collapsed; every kind must have
    // actual variation to be worth tiling.
    const seen = new Set()
    for (let i = 0; i < rgba.length; i += 4) seen.add(rgba[i])
    assert.ok(seen.size > 16, `${kind}: only ${seen.size} distinct tones`)
  }
})

test('alpha is 255 at a larger size too', () => {
  const { rgba } = generateTexture({ kind: 'madera', size: 256, seed: 9 })
  assert.equal(rgba.length, 256 * 256 * 4)
  for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], 255)
})

test('defaults to a 512 pixel square', () => {
  const { width, height, rgba } = generateTexture({ kind: 'fbm' })
  assert.equal(width, 512)
  assert.equal(height, 512)
  assert.equal(rgba.length, 512 * 512 * 4)
})

test('the same seed always produces the same bytes', () => {
  for (const kind of TEXTURE_KINDS) {
    const a = generateTexture({ kind, size: 64, seed: 11 }).rgba
    const b = generateTexture({ kind, size: 64, seed: 11 }).rgba
    assert.ok(sameBytes(a, b), `${kind}: not deterministic`)
  }
})

test('different seeds produce different bytes', () => {
  for (const kind of TEXTURE_KINDS) {
    const a = generateTexture({ kind, size: 64, seed: 1 }).rgba
    const b = generateTexture({ kind, size: 64, seed: 2 }).rgba
    assert.ok(!sameBytes(a, b), `${kind}: seed had no effect`)
  }
})

test('the same seed with different params produces different bytes', () => {
  const a = generateTexture({ kind: 'voro', size: 64, seed: 1, params: { celdas: 4 } }).rgba
  const b = generateTexture({ kind: 'voro', size: 64, seed: 1, params: { celdas: 16 } }).rgba
  assert.ok(!sameBytes(a, b))
})

test('rejects a bad size or an unknown kind', () => {
  assert.throws(() => generateTexture({ kind: 'ruido', size: 0 }), TypeError)
  assert.throws(() => generateTexture({ kind: 'ruido', size: -4 }), TypeError)
  assert.throws(() => generateTexture({ kind: 'ruido', size: 12.5 }), TypeError)
  assert.throws(() => generateTexture({ kind: 'ruido', size: 2048 }), RangeError)
  assert.throws(() => generateTexture({ kind: 'ceramica', size: 32 }), RangeError)
  assert.throws(() => generateTexture({}), RangeError)
})

test('__test__ exposes the periodic value noise', () => {
  assert.equal(typeof __test__.valueNoise, 'function')

  for (const period of [2, 3, 8, 16]) {
    for (const seed of [0, 1, 1234, 0xffffffff]) {
      const noise = __test__.valueNoise(period, seed)
      for (const y of [0, 0.25, 1.5, 3.75, period, period * 3, -2.5]) {
        assert.equal(noise(0, y), noise(period, y), `period ${period} seed ${seed}: x wrap at y=${y}`)
        assert.equal(noise(y, 0), noise(y, period), `period ${period} seed ${seed}: y wrap at x=${y}`)
      }
      // Several periods apart, not just one.
      assert.equal(noise(0, 1.5), noise(period * 4, 1.5))
      assert.equal(noise(1.5, 0), noise(1.5, period * 4))
    }
  }
})

test('the noise stays inside [0, 1]', () => {
  const noise = __test__.valueNoise(7, 5)
  for (let i = 0; i < 2000; i++) {
    const n = noise((i * 0.37) % 7, (i * 0.91) % 7)
    assert.ok(n >= 0 && n <= 1, `out of range: ${n}`)
  }
})

test('fBm, Voronoi and honeycomb repeat at the wrap', () => {
  // fBm with a power of two base period scales every octave by a power of two,
  // so the wrap is exact. The honeycomb lays its rows at sqrt(3) spacing, which
  // cannot be represented exactly, so there the wrap is asserted to floating
  // point noise instead of bit for bit.
  const fbm = __test__.makeFbm({ period: 4, octaves: 5, seed: 3 })
  const voronoi = __test__.makeVoronoi({ cells: 6, seed: 3 })
  const honeycomb = __test__.makeHoneycomb({ cells: 5, seed: 3 })

  for (const y of [0, 0.5, 2.25, 0.9999]) {
    assert.equal(fbm(0, y), fbm(4, y), `fbm x wrap at y=${y}`)
    assert.equal(fbm(y, 0), fbm(y, 4), `fbm y wrap at x=${y}`)

    assert.equal(voronoi(0, y)[0], voronoi(1, y)[0], `voronoi x wrap at y=${y}`)
    assert.equal(voronoi(0, y)[2], voronoi(1, y)[2], 'voronoi cell tone wraps')
    assert.equal(voronoi(y, 0)[0], voronoi(y, 1)[0], `voronoi y wrap at x=${y}`)
    assert.equal(voronoi(y, 0)[2], voronoi(y, 1)[2], 'voronoi cell tone wraps in y')

    for (const [a, b, what] of [
      [honeycomb(0, y)[0], honeycomb(1, y)[0], 'x'],
      [honeycomb(y, 0)[0], honeycomb(y, 1)[0], 'y'],
      [honeycomb(0, y)[1], honeycomb(1, y)[1], 'tone in x'],
    ]) {
      assert.ok(Math.abs(a - b) < 1e-12, `honeycomb ${what} wrap at ${y}: ${a} vs ${b}`)
    }
  }
})

test('the wrap seam is no rougher than the interior of the image', () => {
  for (const kind of TEXTURE_KINDS) {
    const image = generateTexture({ kind, size: 128, seed: 3 })
    const { seamMean, seamMax, p99, interiorMax } = seamStats(image)

    assert.ok(seamMean <= p99, `${kind}: seam mean ${seamMean.toFixed(2)} above interior p99 ${p99}`)
    assert.ok(seamMax <= interiorMax, `${kind}: seam max ${seamMax} above interior max ${interiorMax}`)
  }
})