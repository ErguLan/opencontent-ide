/**
 * Deterministic, seamlessly tileable procedural textures.
 *
 * Every kind is periodic with period 1 in normalized coordinates, so a texture
 * can be repeated in both directions without a visible seam. Three rules make
 * that true, and they are applied everywhere:
 *
 * 1. **Periodic integer lattice.** Noise is defined on a lattice of integer
 *    points that wraps modulo its period. Sampling `noise(0, y)` and
 *    `noise(period, y)` yields the exact same double, because at an integer
 *    coordinate the interpolation weight is exactly 0 and only the wrapped
 *    lattice cell is read.
 * 2. **Per-octave period growth.** fBm octave `n` samples lattice `n` at
 *    `period * lacunarity^n`, so the finer octaves inherit the same period
 *    instead of introducing a new, non-wrapping frequency.
 * 3. **Integer lattices for structure.** Rings, veins and grain directions are
 *    driven by integer direction vectors (`t = dx*u + dy*v`), so shifting `u`
 *    by 1 shifts `t` by an integer and a sine of it keeps its value.
 *
 * Voronoi feature points and honeycomb cell centres wrap modulo their grid
 * instead, which is the same idea seen from the other side.
 *
 * Output is grayscale (`r === g === b`) with alpha 255: these are surface
 * response maps, not pictures, and a single channel keeps them usable as
 * height, roughness or detail maps.
 *
 * @module texture
 */

/** Every kind `generateTexture` accepts, in a stable order. */
export const TEXTURE_KINDS = Object.freeze([
  'ruido',
  'fbm',
  'voro',
  'madera',
  'metal',
  'marmol',
  'asfalto',
  'tejido',
  'piedra',
  'panal',
])

/** Full turn in radians. */
const TAU = Math.PI * 2
const SQRT3 = Math.sqrt(3)
/** Hard ceiling on `size`, chosen so 1024 finishes well inside a second. */
const MAX_SIZE = 1024
/** Hard ceiling on any single lattice, so memory stays bounded. */
const MAX_PERIOD = 256

/* ------------------------------------------------------------------ *
 * scalar helpers
 * ------------------------------------------------------------------ */

/**
 * @param {number} n
 * @returns {number} n clamped to [0, 1]
 */
function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Quintic smootherstep: 0 at 0, 1 at 1, zero first *and* second derivative at
 * both ends. Cheaper to reason about than cubic, and it removes the visible
 * grid creases value noise would otherwise show.
 *
 * @param {number} t
 * @returns {number}
 */
function quintic(t) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number} smoothstep from 0 to 1
 */
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-12))
  return t * t * (3 - 2 * t)
}

/**
 * True modulo, so negative lattice coordinates wrap the same way as positive
 * ones.
 *
 * @param {number} i
 * @param {number} p positive period
 * @returns {number} i in [0, p)
 */
function mod(i, p) {
  const m = i % p
  return m < 0 ? m + p : m
}

/**
 * Integer hash of a lattice cell. The `avalanche` step is what keeps
 * neighbouring cells uncorrelated; without it a linear mix would produce
 * diagonal stripes across a lattice.
 *
 * @param {number} ix lattice x
 * @param {number} iy lattice y
 * @param {number} seed unsigned 32-bit integer
 * @returns {number} uniform float in [0, 1)
 */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/**
 * Mix a seed and an octave index without letting two octaves share a lattice.
 *
 * @param {number} seed
 * @param {number} salt
 * @returns {number} unsigned 32-bit integer
 */
function mixSeed(seed, salt) {
  return (toSeed32(seed) + Math.imul(salt + 1, 0x9e3779b1)) >>> 0
}

/**
 * @param {unknown} value
 * @returns {number} unsigned 32-bit integer
 */
function toSeed32(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0
  if (typeof value === 'string') {
    let h = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
  return 0
}

/**
 * Read a numeric param, accepting a couple of English aliases so callers that
 * were not written against the Spanish vocabulary still work.
 *
 * @param {Record<string, unknown>} params
 * @param {string[]} keys candidate names, first match wins
 * @param {number} def fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function numberParam(params, keys, def, min, max) {
  for (const key of keys) {
    if (!params || typeof params !== 'object') break
    const raw = params[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.min(max, Math.max(min, raw))
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n))
    }
  }
  return def
}

/**
 * @param {Record<string, unknown>} params
 * @param {string[]} keys candidate names, first match wins
 * @param {number} def fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function intParam(params, keys, def, min, max) {
  return Math.round(numberParam(params, keys, def, min, max))
}

/* ------------------------------------------------------------------ *
 * periodic noise
 * ------------------------------------------------------------------ */

/**
 * Materialize the lattice of a periodic value-noise field. Values are stored as
 * doubles, so a sampled point is bit-identical whether it reads the table or
 * hashes the cell on the fly.
 *
 * @param {number} period lattice cells per axis, integer >= 1
 * @param {number} seed
 * @returns {Float64Array} period * period values in [0, 1)
 */
function buildLattice(period, seed) {
  const lattice = new Float64Array(period * period)
  for (let y = 0; y < period; y++) {
    const row = y * period
    for (let x = 0; x < period; x++) lattice[row + x] = hash2(x, y, seed)
  }
  return lattice
}

/**
 * Sample a materialized lattice with quintic interpolation.
 *
 * At an integer coordinate the x weight is exactly 0, so the result is the
 * lattice value of the wrapped cell itself. That is what makes
 * `f(0, y) === f(period, y)` hold exactly rather than approximately.
 *
 * @param {Float64Array} lattice
 * @param {number} period
 * @param {number} x lattice units
 * @param {number} y lattice units
 * @returns {number} value in [0, 1]
 */
function sampleLattice(lattice, period, x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const ux = quintic(x - x0)
  const uy = quintic(y - y0)
  const i0 = mod(x0, period)
  const i1 = mod(x0 + 1, period)
  const r0 = mod(y0, period) * period
  const r1 = mod(y0 + 1, period) * period
  const a = lattice[r0 + i0]
  const b = lattice[r0 + i1]
  const c = lattice[r1 + i0]
  const d = lattice[r1 + i1]
  const top = a + (b - a) * ux
  const bottom = c + (d - c) * ux
  return top + (bottom - top) * uy
}

/**
 * Periodic value noise with quintic interpolation.
 *
 * @example
 * const n = valueNoise(8, 1234)
 * n(0, 2.5) === n(8, 2.5)   // exactly
 *
 * @param {number} period lattice cells per axis, integer >= 1
 * @param {number} seed unsigned 32-bit integer
 * @returns {(x: number, y: number) => number} sampler in [0, 1), period-wide
 */
function valueNoise(period, seed) {
  const p = Math.max(1, Math.round(period))
  const lattice = buildLattice(p, toSeed32(seed))
  return function noise(x, y) {
    return sampleLattice(lattice, p, x, y)
  }
}

/**
 * Periodic fBm. Octave `n` samples its own lattice at `period * lacunarity^n`,
 * so the sum stays periodic with the base period.
 *
 * The returned sampler takes *lattice units of the base period*: call it with
 * `u * period` for normalized coordinates in [0, 1).
 *
 * @param {{ period?: number, octaves?: number, gain?: number, lacunarity?: number, seed?: number, ridged?: boolean }} options
 * @returns {(x: number, y: number) => number} sampler in [0, 1]
 */
function makeFbm({ period = 4, octaves = 4, gain = 0.5, lacunarity = 2, seed = 0, ridged = false } = {}) {
  const base = Math.max(1, Math.min(MAX_PERIOD, Math.round(period)))
  const levels = Math.max(1, Math.min(8, Math.round(octaves)))
  // Parallel arrays instead of an array of objects: this loop runs once per
  // pixel per octave, and flat loads keep it in the integer fast path.
  const lattices = []
  const scales = new Float64Array(levels)
  const amplitudes = new Float64Array(levels)
  const periods = new Int32Array(levels)
  let amplitude = 1
  let norm = 0
  let p = base
  for (let o = 0; o < levels; o++) {
    lattices.push(buildLattice(p, mixSeed(seed, o)))
    scales[o] = p / base
    amplitudes[o] = amplitude
    periods[o] = p
    norm += amplitude
    amplitude *= gain
    p = Math.min(p * lacunarity, MAX_PERIOD)
  }

  if (ridged) {
    return function fbmRidged(x, y) {
      let sum = 0
      for (let o = 0; o < levels; o++) {
        const n = sampleLattice(lattices[o], periods[o], x * scales[o], y * scales[o])
        sum += amplitudes[o] * (1 - Math.abs(2 * n - 1))
      }
      return sum / norm
    }
  }

  return function fbm(x, y) {
    let sum = 0
    for (let o = 0; o < levels; o++) {
      sum += amplitudes[o] * sampleLattice(lattices[o], periods[o], x * scales[o], y * scales[o])
    }
    return sum / norm
  }
}

/**
 * Periodic Worley / Voronoi sampler.
 *
 * Feature points sit at `cell + 0.5 + (hash - 0.5) * jitter`, so they never
 * leave their cell and a 3x3 neighbourhood is always enough. The cell index is
 * wrapped modulo `cells`, which is what makes the pattern periodic.
 *
 * @param {{ cells?: number, seed?: number, jitter?: number }} options
 * @returns {(u: number, v: number, dst?: Float64Array) => Float64Array}
 *   writes `[distanceToNearest, distanceToSecond, cellTone]` into `dst`
 *   (a reused array when given, so the pixel loop allocates nothing).
 */
function makeVoronoi({ cells = 8, seed = 0, jitter = 0.9 } = {}) {
  const n = Math.max(1, Math.min(128, Math.round(cells)))
  const j = Math.max(0, Math.min(1, jitter))
  const s = toSeed32(seed)
  const count = n * n
  // Feature points and tones are hashed once per cell, not once per pixel per
  // neighbour: 18 hashes per pixel becomes 3 array reads.
  const offsetX = new Float64Array(count)
  const offsetY = new Float64Array(count)
  const tones = new Float64Array(count)
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const h1 = hash2(cx, cy, s)
      const h2 = hash2(cx, cy, mixSeed(s, 7))
      const at = cy * n + cx
      offsetX[at] = 0.5 + (h1 - 0.5) * j
      offsetY[at] = 0.5 + (h2 - 0.5) * j
      tones[at] = h1
    }
  }
  const scratch = new Float64Array(3)
  return function voronoi(u, v, dst = scratch) {
    const gx = u * n
    const gy = v * n
    const ix = Math.floor(gx)
    const iy = Math.floor(gy)
    let f1 = Infinity
    let f2 = Infinity
    let tone = 0.5
    for (let dy = -1; dy <= 1; dy++) {
      const cy = iy + dy
      const row = mod(cy, n) * n
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx
        const at = row + mod(cx, n)
        // Subtract the integer cell first: both operands are then exact at the
        // wrap, so u=0 and u=1 give bit-identical distances.
        const ex = (gx - cx) - offsetX[at]
        const ey = (gy - cy) - offsetY[at]
        const d = ex * ex + ey * ey
        if (d < f1) {
          f2 = f1
          f1 = d
          tone = tones[at]
        } else if (d < f2) {
          f2 = d
        }
      }
    }
    dst[0] = Math.sqrt(f1)
    dst[1] = Math.sqrt(f2)
    dst[2] = tone
    return dst
  }
}

/**
 * Periodic honeycomb sampler (flat-top hexes).
 *
 * Hexes are laid out in `cols` columns spaced 1.5 apart with alternating
 * columns offset by sqrt(3)/2 vertically, and `cols` is forced even so the
 * column parity survives the horizontal wrap. Horizontal period is
 * `cols * 1.5`, vertical period is `cols * sqrt(3)`, both axis aligned, which is
 * what makes the honeycomb square-tileable.
 *
 * @param {{ cells?: number, seed?: number }} options
 * @returns {(u: number, v: number, dst?: Float64Array) => Float64Array}
 *   writes `[normalizedHexDistance, cellTone, 0]`; distance is 0 at a hex
 *   centre and 1 on its border.
 */
function makeHoneycomb({ cells = 8, seed = 0 } = {}) {
  const n = evenize(Math.max(2, Math.min(64, Math.round(cells))))
  const s = toSeed32(seed)
  const tones = new Float64Array(n * n)
  for (let ry = 0; ry < n; ry++) {
    for (let cx = 0; cx < n; cx++) tones[ry * n + cx] = hash2(cx, ry, s)
  }
  const scratch = new Float64Array(3)
  return function honeycomb(u, v, dst = scratch) {
    const px = u * n * 1.5
    const py = v * n * SQRT3
    const c0 = Math.floor(px / 1.5)
    const r0 = Math.floor(py / SQRT3)
    let best = Infinity
    let tone = 0.5
for (let dr = -1; dr <= 1; dr++) {
      const rr = r0 + dr
      const row = mod(rr, n) * n
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c0 + dc
        const wc = mod(cc, n)
        const cx = cc * 1.5 + 1
        const cy = (rr + 0.5) * SQRT3 + (wc & 1 ? SQRT3 * 0.5 : 0)
        const ex = Math.abs(px - cx)
        const ey = Math.abs(py - cy)
        const d = Math.max(ex * (SQRT3 * 0.5) + ey * 0.5, ey)
        if (d < best) {
          best = d
          tone = tones[row + wc]
        }
      }
    }
    dst[0] = best / (SQRT3 * 0.5)
    dst[1] = tone
    dst[2] = 0
    return dst
  }
}

/**
 * Eight snapped directions. Rings, veins and brushed streaks are driven by
 * these, so their coordinates stay integer-valued and a sine of them keeps its
 * value across the wrap. A diagonal direction is sqrt(2) longer than an axial
 * one, which shows up as a slightly higher apparent frequency; that is a
 * deliberate trade for keeping the lattice exact.
 */
const DIRECTIONS = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
]

/**
 * @param {number} angle radians
 * @returns {[number, number]} integer direction vector
 */
function directionFor(angle) {
  const a = Number.isFinite(angle) ? angle : 0
  const idx = mod(Math.round(a / (Math.PI / 4)), 8)
  return DIRECTIONS[idx]
}

/* ------------------------------------------------------------------ *
 * pixel loop scaffolding
 * ------------------------------------------------------------------ */

/*
 * Rotated sampling frame. Every generator that follows a direction (wood grain,
 * marble veins, brushed metal) builds two coordinates out of `u` and `v`:
 *
 *     t =  dx * u + dy * v      along the snapped direction
 *     s = -dy * u + dx * v      across it
 *
 * `dx` and `dy` are integers, so crossing the wrap shifts `t` by `dx` and `s`
 * by `-dy`: both integer shifts, which is what makes a sine of `t` repeat and
 * what forces every sampling multiplier to be a multiple of the lattice period
 * (see freqStep). These are written out inline in the generators rather than
 * factored into a helper returning `{t, s}`: that object would be allocated
 * once per pixel and costs seconds at 1024.
 */

/* ------------------------------------------------------------------ *
 * pixel loop scaffolding
 * ------------------------------------------------------------------ */

/**
 * Fill a single-channel buffer with `fn(u, v)`, `u` and `v` normalized to
 * [0, 1) so the caller only has to worry about periodicity.
 *
 * @param {Float32Array} out length size * size
 * @param {number} size
 * @param {(u: number, v: number, x: number, y: number) => number} fn
 */
function fill(out, size, fn) {
  const inv = 1 / size
  for (let y = 0; y < size; y++) {
    const v = y * inv
    const row = y * size
    for (let x = 0; x < size; x++) out[row + x] = fn(x * inv, v, x, y)
  }
}

/**
 * Quantize a frequency expressed in cells across the texture into a sampling
 * multiplier that a sampler built with base period 2 accepts.
 *
 * This is not cosmetic. A wrapped lattice only repeats when the sampling input
 * shifts by a whole number of periods. The rotated frame coordinates `t` and
 * `s` shift by integers when `u` or `v` crosses the wrap, so the multiplier
 * applied to them must be a multiple of the sampler's base period. Forcing it
 * even removes the divisibility trap entirely: any two independently chosen
 * frequencies can be combined without breaking the seam.
 *
 * @param {number} wanted desired cells across the texture
 * @returns {number} even integer >= 2
 */
function freqStep(wanted) {
  const n = Math.max(2, Math.round(wanted))
  return n % 2 === 0 ? n : n + 1
}

/**
 * Round to an even integer. Structures whose phase alternates per cell (weave,
 * honeycomb columns) only wrap correctly when the cell count is even.
 *
 * @param {number} n
 * @param {number} [min=2]
 * @returns {number}
 */
function evenize(n, min = 2) {
  const i = Math.max(min, Math.round(n))
  return i % 2 === 0 ? i : i + 1
}

/**
 * @param {number} value
 * @param {number} amount
 * @returns {number} value stretched around 0.5 and clamped
 */
function grade(value, amount) {
  return clamp01((value - 0.5) * amount + 0.5)
}

/* ------------------------------------------------------------------ *
 * kinds
 * ------------------------------------------------------------------ */

/** Plain periodic noise with a contrast control. */
function texRuido({ size, seed, params, out }) {
  const octaves = intParam(params, ['octaves', 'octavas'], 4, 1, 8)
  const freq = intParam(params, ['frecuencia', 'frequency'], 4, 2, MAX_PERIOD)
  const gain = numberParam(params, ['gain', 'ganancia'], 0.5, 0.05, 0.95)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const fbm = makeFbm({ period: freq, octaves, gain, seed })

  fill(out, size, (u, v) => grade(fbm(u * freq, v * freq), intensity))
}

/** Classic fBm: smooth, cloud-like, octaves stacked with decreasing amplitude. */
function texFbm({ size, seed, params, out }) {
  const octaves = intParam(params, ['octaves', 'octavas'], 6, 1, 8)
  const freq = intParam(params, ['frecuencia', 'frequency'], 3, 1, MAX_PERIOD)
  const gain = numberParam(params, ['gain', 'ganancia'], 0.5, 0.05, 0.95)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1.1, 0, 4)
  const fbm = makeFbm({ period: freq, octaves, gain, seed })

  fill(out, size, (u, v) => {
    const n = smoothstep(0.15, 0.85, fbm(u * freq, v * freq))
    return grade(n, intensity)
  })
}

/** Voronoi cells with dark borders and per-cell tone. */
function texVoro({ size, seed, params, out }) {
  const cells = intParam(params, ['celdas', 'cells'], 8, 1, 128)
  const edgeWidth = numberParam(params, ['grosor', 'width'], 3, 0.5, 12)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const voronoi = makeVoronoi({ cells, seed })
  const cell = new Float64Array(3)

  fill(out, size, (u, v) => {
    voronoi(u, v, cell)
    const f1 = cell[0]
    const gap = clamp01((cell[1] - f1) * edgeWidth)
    const body = 0.18 + 0.62 * cell[2] * (0.55 + 0.45 * Math.min(f1, 1.4))
    return grade(body * (1 - gap * 0.75) - gap * 0.06, intensity)
  })
}

/** Wood: warped growth rings plus fibres running along the grain. */
function texMadera({ size, seed, params, out }) {
  const rings = intParam(params, ['anillos', 'rings'], 9, 1, 256)
  const freq = intParam(params, ['frecuencia', 'frequency'], 6, 2, MAX_PERIOD)
  const turbulence = numberParam(params, ['turbulence', 'turbulencia'], 0.6, 0, 4)
  const brushing = numberParam(params, ['cepillado', 'brush'], 0.4, 0, 1)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const angle = numberParam(params, ['angulo', 'angle'], 0, -Math.PI * 8, Math.PI * 8)
  const dir = directionFor(angle)
  const dx = dir[0]
  const dy = dir[1]

  const warpPeriod = Math.max(2, Math.round(freq / 2))
  const warp = makeFbm({ period: warpPeriod, octaves: 4, seed: mixSeed(seed, 1) })
  const fibre = makeFbm({ period: 2, octaves: 3, gain: 0.6, seed: mixSeed(seed, 2) })
  const fibreAcross = freqStep(intParam(params, ['hilos', 'threads'], 96, 8, MAX_PERIOD))

  fill(out, size, (u, v) => {
    const t = dx * u + dy * v
    const s = -dy * u + dx * v
    const warpN = warp(t * warpPeriod, s * warpPeriod) - 0.5
    const phase = rings * t + warpN * turbulence
    let g = 0.5 + 0.5 * Math.sin(TAU * phase)
    g = g * g * g
    const late = 1 - smoothstep(0.02, 0.3, g)
    const fibreN = fibre(t * 2, s * fibreAcross) - 0.5
    const value = 0.34 + 0.46 * g - 0.18 * late + fibreN * brushing * 0.4
    return grade(value, intensity)
  })
}

/** Brushed metal: streaks stretched along one direction plus a slow mottle. */
function texMetal({ size, seed, params, out }) {
  const freq = intParam(params, ['frecuencia', 'frequency'], 24, 2, MAX_PERIOD)
  const brushing = numberParam(params, ['cepillado', 'brush'], 0.75, 0, 1)
  const mottle = numberParam(params, ['turbulence', 'turbulencia'], 0.3, 0, 1)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const angle = numberParam(params, ['angulo', 'angle'], 0, -Math.PI * 8, Math.PI * 8)
  const dir = directionFor(angle)
  const dx = dir[0]
  const dy = dir[1]

  const across = freqStep(freq)
  const along = freqStep(freq * (1 - 0.94 * brushing))
  const streak = makeFbm({ period: 2, octaves: 4, gain: 0.55, seed })
  const cloud = makeFbm({ period: 3, octaves: 3, seed: mixSeed(seed, 3) })

  fill(out, size, (u, v) => {
    const t = dx * u + dy * v
    const s = -dy * u + dx * v
    const st = streak(t * along, s * across)
    const cl = cloud(u * 3, v * 3) - 0.5
    const shine = st * st * st * st * st
    const value = 0.34 + 0.3 * st + 0.34 * cl * mottle + 0.3 * shine - 0.12 * (1 - st) * (1 - st)
    return grade(value, intensity)
  })
}

/** Marble: veins are thin bands on an integer ring lattice, warped by fBm. */
function texMarmol({ size, seed, params, out }) {
  const veins = intParam(params, ['vetas', 'veins'], 5, 1, 64)
  const freq = intParam(params, ['frecuencia', 'frequency'], 3, 1, MAX_PERIOD)
  const turbulence = numberParam(params, ['turbulence', 'turbulencia'], 1.4, 0, 6)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const angle = numberParam(params, ['angulo', 'angle'], 0.7, -Math.PI * 8, Math.PI * 8)
  const dir = directionFor(angle)
  const dx = dir[0]
  const dy = dir[1]

  const warp = makeFbm({ period: freq, octaves: 5, seed: mixSeed(seed, 4) })
  const warp2 = makeFbm({ period: freq * 2, octaves: 4, seed: mixSeed(seed, 5) })
  const stone = makeFbm({ period: 2, octaves: 4, seed: mixSeed(seed, 6) })

  fill(out, size, (u, v) => {
    const t = dx * u + dy * v
    const s = -dy * u + dx * v
    const w1 = warp(t * freq, s * freq) - 0.5
    const w2 = warp2(t * freq * 2, s * freq * 2) - 0.5
    const phase = veins * t + w1 * turbulence * 1.6
    const band = Math.abs(Math.sin(Math.PI * phase))
    const vein = 1 - smoothstep(0, 0.18, band)
    const phase2 = veins * 3 * t + w2 * turbulence * 0.8
    const thin = 1 - smoothstep(0, 0.07, Math.abs(Math.sin(Math.PI * phase2)))
    const body = stone(u * 2, v * 2)
    const value = 0.4 + 0.26 * body + 0.34 * vein - 0.12 * thin * (1 - vein)
    return grade(value, intensity)
  })
}

/** Asphalt: dense pebbles separated by dark gaps, plus a fine grain. */
function texAsfalto({ size, seed, params, out }) {
  const cells = intParam(params, ['celdas', 'cells'], 24, 1, 128)
  const freq = intParam(params, ['frecuencia', 'frequency'], 64, 2, MAX_PERIOD)
  const octaves = intParam(params, ['octaves', 'octavas'], 3, 1, 6)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const voronoi = makeVoronoi({ cells, seed, jitter: 0.96 })
  const grain = makeFbm({ period: freq, octaves, gain: 0.6, seed: mixSeed(seed, 7) })
  const cell = new Float64Array(3)

  fill(out, size, (u, v) => {
    voronoi(u, v, cell)
    const f1 = cell[0]
    const gap = clamp01((cell[1] - f1) * 4)
    const pebble = 0.14 + 0.5 * cell[2]
    const crown = 0.16 * (1 - clamp01(f1 * 1.5))
    const g = grain(u * freq, v * freq)
    const value = pebble * (1 - gap * 0.7) + crown * (1 - gap) + 0.24 * g - gap * 0.05
    return grade(value, intensity)
  })
}

/** Plain weave: warp and weft threads alternating over and under. */
function texTejido({ size, seed, params, out }) {
  const threads = evenize(intParam(params, ['hilos', 'threads'], 18, 2, 256), 2)
  const fibreFreq = freqStep(intParam(params, ['frecuencia', 'frequency'], 96, 8, MAX_PERIOD))
  const fuzz = numberParam(params, ['turbulence', 'turbulencia'], 0.6, 0, 2)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const fibre = makeFbm({ period: 2, octaves: 3, gain: 0.6, seed: mixSeed(seed, 8) })
  const s = toSeed32(seed)

  fill(out, size, (u, v) => {
    const fu = u * threads
    const fv = v * threads
    const cu = Math.floor(fu)
    const cv = Math.floor(fv)
    const du = fu - cu
    const dv = fv - cv
    const i = cu
    const j = cv
    // Cross-section of a round thread: gap at both edges, crest at the centre,
    // which sits at du = 0.5 because du runs from one thread edge to the next.
    const wu = 0.5 + 0.5 * Math.cos(TAU * (du + 0.5))
    const wv = 0.5 + 0.5 * Math.cos(TAU * (dv + 0.5))
    const over = ((i + j) & 1) === 0
    const top = over ? wu : wv
    const bottom = over ? wv : wu
    const slope = over ? -Math.sin(TAU * (du + 0.5)) : Math.sin(TAU * (dv + 0.5))
    const n = fibre(u * fibreFreq, v * fibreFreq) - 0.5
    const tone = (hash2(i, j, s) - 0.5) * 0.07
    const value = 0.3 + 0.34 * top + 0.16 * bottom + 0.16 * slope + n * fuzz * 0.2 + tone
    return grade(value, intensity)
  })
}

/** Stone: fBm body, voronoi facets, ridged cracks and a fine grain. */
function texPiedra({ size, seed, params, out }) {
  const cells = intParam(params, ['celdas', 'cells'], 9, 1, 128)
  const freq = intParam(params, ['frecuencia', 'frequency'], 4, 1, MAX_PERIOD)
  const octaves = intParam(params, ['octaves', 'octavas'], 5, 1, 8)
  const freqFine = intParam(params, ['frecuencia_fina', 'fine'], 48, 2, MAX_PERIOD)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const voronoi = makeVoronoi({ cells, seed })
  const body = makeFbm({ period: freq, octaves, seed: mixSeed(seed, 9) })
  const crack = makeFbm({ period: Math.max(3, Math.round(freq * 2)), octaves: 4, seed: mixSeed(seed, 10), ridged: true })
  const grain = makeFbm({ period: freqFine, octaves: 2, gain: 0.6, seed: mixSeed(seed, 11) })
  const cell = new Float64Array(3)

  fill(out, size, (u, v) => {
    voronoi(u, v, cell)
    const gap = clamp01((cell[1] - cell[0]) * 5)
    const facet = cell[2] * (0.5 + 0.5 * gap)
    const b = body(u * freq, v * freq)
    const c = crack(u * freq * 2, v * freq * 2)
    const seam = 1 - smoothstep(0.72, 0.98, c)
    const g = grain(u * freqFine, v * freqFine)
    const value = 0.34 + 0.32 * b + 0.16 * facet + 0.1 * g - 0.3 * seam * gap
    return grade(value, intensity)
  })
}

/** Honeycomb: periodic hex cells with domed interiors and dark wax walls. */
function texPanal({ size, seed, params, out }) {
  const cells = intParam(params, ['celdas', 'cells'], 9, 2, 64)
  const freq = intParam(params, ['frecuencia', 'frequency'], 96, 8, MAX_PERIOD)
  const intensity = numberParam(params, ['intensidad', 'intensity'], 1, 0, 4)
  const honeycomb = makeHoneycomb({ cells, seed })
  const grain = makeFbm({ period: freq, octaves: 2, gain: 0.6, seed: mixSeed(seed, 12) })
  const cell = new Float64Array(3)

  fill(out, size, (u, v) => {
    honeycomb(u, v, cell)
    const q = Math.min(cell[0], 1)
    const wall = smoothstep(0.82, 0.99, q)
    const dome = Math.sqrt(Math.max(0, 1 - q * q))
    const tone = 0.82 + 0.18 * cell[1]
    const g = grain(u * freq, v * freq)
    const body = (0.26 + 0.5 * dome) * tone
    const value = body * (1 - wall) + (0.08 + 0.1 * g) * wall
    return grade(value, intensity)
  })
}

/** kind -> generator */
const GENERATORS = {
  ruido: texRuido,
  fbm: texFbm,
  voro: texVoro,
  madera: texMadera,
  metal: texMetal,
  marmol: texMarmol,
  asfalto: texAsfalto,
  tejido: texTejido,
  piedra: texPiedra,
  panal: texPanal,
}

/**
 * Generate a seamless procedural texture.
 *
 * The result is grayscale with alpha 255 and is periodic in both axes: the
 * right edge continues into the left one and the bottom into the top.
 *
 * Params are read per kind and unknown keys are ignored. Accepted keys (with
 * English aliases in parentheses), all optional:
 *
 *   octaves (octavas), frecuencia (frequency), celdas (cells), anillos (rings),
 *   cepillado (brush), vetas (veins), turbulence (turbulencia), hilos (threads),
 *   intensidad (intensity), angulo (angle), gain (ganancia),
 *   grosor (width), frecuencia_fina (fine)
 *
 * @example
 * const { width, height, rgba } = generateTexture({ kind: 'madera', size: 512, seed: 7 })
 *
 * @param {{ kind: string, size?: number, seed?: number|string, params?: Record<string, unknown> }} options
 *   `kind` must be one of {@link TEXTURE_KINDS}; `size` is square and clamped to
 *   1..1024.
 * @returns {{ width: number, height: number, rgba: Uint8ClampedArray }}
 *   `rgba` has `size * size * 4` bytes, row major, top row first.
 * @throws {TypeError} if `size` is not a positive integer
 * @throws {RangeError} if `size` exceeds 1024 or `kind` is unknown
 */
export function generateTexture({ kind, size = 512, seed = 1, params = {} } = {}) {
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    throw new TypeError(`texture: size must be a positive integer, received ${String(size)}`)
  }
  if (size > MAX_SIZE) {
    throw new RangeError(`texture: size ${size} exceeds the maximum of ${MAX_SIZE}`)
  }
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(GENERATORS, kind)) {
    throw new RangeError(`texture: unknown kind ${String(kind)}`)
  }

  const opts = params && typeof params === 'object' ? params : {}
  const scalar = new Float32Array(size * size)
  GENERATORS[kind]({ size, seed: toSeed32(seed), params: opts, out: scalar })

  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let i = 0, o = 0; i < scalar.length; i++, o += 4) {
    const value = scalar[i] <= 0 ? 0 : scalar[i] >= 1 ? 255 : Math.round(scalar[i] * 255)
    rgba[o] = value
    rgba[o + 1] = value
    rgba[o + 2] = value
    rgba[o + 3] = 255
  }
  return { width: size, height: size, rgba }
}

/**
 * Internals exposed for tests. Not part of the public API: the object exists so
 * the periodic noise can be asserted directly instead of through pixels.
 *
 * @type {Readonly<{
 *   mod: typeof mod,
 *   quintic: typeof quintic,
 *   smoothstep: typeof smoothstep,
 *   hash2: typeof hash2,
 *   valueNoise: typeof valueNoise,
 *   makeFbm: typeof makeFbm,
 *   makeVoronoi: typeof makeVoronoi,
 *   makeHoneycomb: typeof makeHoneycomb,
 *   directionFor: typeof directionFor
 * }>}
 */
export const __test__ = Object.freeze({
  mod,
  quintic,
  smoothstep,
  hash2,
  valueNoise,
  makeFbm,
  makeVoronoi,
  makeHoneycomb,
  directionFor,
})