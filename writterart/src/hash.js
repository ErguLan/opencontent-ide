/**
 * Canonical serialisation and hashing. This is the reproducibility contract:
 * `hashScene(parse(source).scene)` is a fingerprint of the *description*, not of
 * the render. Same description => same hash, no matter how the file is formatted.
 */

/**
 * Deterministic JSON: object keys sorted, `undefined` dropped, arrays kept in order.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJSON(value) {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value) {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'src') continue;
      const child = value[key];
      if (child === undefined) continue;
      out[key] = canonicalise(child);
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

/**
 * 64-bit FNV-1a over the canonical form. 16 lowercase hex characters.
 * @param {unknown} value
 * @returns {string}
 */
export function hashScene(value) {
  const bytes = new TextEncoder().encode(canonicalJSON(value));
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Hash of an already-built layout. Two layouts with the same hash are
 * guaranteed to render to the same pixels.
 * @param {unknown} layout
 * @returns {string}
 */
export function hashLayout(layout) {
  return hashScene(layout);
}