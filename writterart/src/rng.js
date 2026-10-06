/**
 * Deterministic pseudo-random number generation.
 *
 * The whole package must be reproducible: identical seed => identical bytes.
 * `Math.random()` is therefore forbidden everywhere and every module that needs
 * randomness goes through {@link createRng}.
 *
 * Algorithm: mulberry32. Small, fast, well distributed for texture work, and
 * it needs nothing but 32-bit integer arithmetic, which JS does exactly.
 *
 * @module rng
 */

/** @typedef {Object} Rng
 * @property {() => number} next                 Uniform float in [0, 1).
 * @property {(a: number, b: number) => number} range Uniform float in [a, b).
 * @property {(a: number, b: number) => number} int    Uniform integer in [a, b], both ends included.
 * @property {<T>(arr: readonly T[]) => T} pick          Uniform element of a non-empty array.
 * @property {(p?: number) => boolean} bool              True with probability p (default 0.5).
 * @property {(tag?: string|number) => Rng} fork         Independent child generator.
 */

/** Largest value `next()` can return is 1 - 2^-32. */
const TWO_POW_32 = 4294967296

/** Odd constant of the mulberry32 generator. */
const K = 0x6d2b79f5

/**
 * FNV-1a, 32 bit. Used to turn strings (fork tags) into seeds.
 *
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Coerce any seed-ish value into an unsigned 32-bit integer.
 * Numbers are truncated, everything else is hashed as its string form.
 *
 * @param {unknown} seed
 * @returns {number}
 */
function toSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0
  if (typeof seed === 'boolean') return seed ? 1 : 0
  if (seed === null || seed === undefined) return 0
  return fnv1a(String(seed))
}

/**
 * Combine a parent state and a tag into a fresh seed. Mixing through fnv1a
 * keeps distinct tags apart even when the states are close.
 *
 * @param {number} state
 * @param {string|number} tag
 * @returns {number}
 */
function deriveSeed(state, tag) {
  return fnv1a(state.toString(36) + '\u0000' + String(tag))
}

/**
 * Create a seeded generator.
 *
 * Every call returns an independent stream: two generators created with the same
 * seed produce the same sequence, and `fork` derives a child stream from the
 * parent's *current* state so that asking for two children always gives two
 * different generators without consuming anything by accident.
 *
 * @example
 * const rng = createRng(42)
 * rng.int(1, 6)            // 1..6
 * const child = rng.fork('veins')
 * child.next()             // independent stream
 *
 * @param {number|string} seed Any finite number or string.
 * @returns {Rng} frozen generator with next/range/int/pick/bool/fork
 */
export function createRng(seed) {
  let state = toSeed(seed)

  /**
   * @returns {number} uniform float in [0, 1)
   */
  function next() {
    state = (state + K) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32
  }

  const rng = {
    next,

    /**
     * @param {number} a lower bound (inclusive)
     * @param {number} b upper bound (exclusive)
     * @returns {number}
     */
    range(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new TypeError('rng.range: bounds must be finite numbers')
      }
      return a + (b - a) * next()
    },

    /**
     * @param {number} a lower bound, included
     * @param {number} b upper bound, included
     * @returns {number}
     */
    int(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new TypeError('rng.int: bounds must be finite numbers')
      }
      const lo = Math.ceil(a)
      const hi = Math.floor(b)
      if (hi < lo) throw new RangeError(`rng.int: empty range [${a}, ${b}]`)
      return lo + Math.floor(next() * (hi - lo + 1))
    },

    /**
     * @template T
     * @param {readonly T[]} arr non-empty array
     * @returns {T}
     */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new TypeError('rng.pick: expected a non-empty array')
      }
      return arr[Math.floor(next() * arr.length)]
    },

    /**
     * @param {number} [p=0.5] probability in [0, 1]
     * @returns {boolean}
     */
    bool(p = 0.5) {
      const q = Number.isFinite(p) ? p : 0.5
      return next() < q
    },

    /**
     * @param {string|number} [tag=''] distinguishes one child from another
     * @returns {Rng} independent child generator
     */
    fork(tag = '') {
      return createRng(deriveSeed(state, tag))
    },
  }

  return Object.freeze(rng)
}