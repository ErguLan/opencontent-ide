/**
 * Rectangle helpers. Pure, no state.
 */

/** @typedef {{x:number,y:number,w:number,h:number}} Rect */

/** @param {Rect} a @param {Rect} b @returns {Rect} */
export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, bt - y) };
}

/** @param {Rect} a @param {Rect} b @returns {number} */
export function intersectionArea(a, b) {
  const r = intersect(a, b);
  return r.w * r.h;
}

/** @param {Rect} rect @param {number} amount @returns {Rect} */
export function outset(rect, amount) {
  return { x: rect.x - amount, y: rect.y - amount, w: rect.w + amount * 2, h: rect.h + amount * 2 };
}

/** @param {Rect} rect @returns {Rect} */
export function normaliseRect(rect) {
  return {
    x: round(rect.x),
    y: round(rect.y),
    w: Math.max(0, round(rect.w)),
    h: Math.max(0, round(rect.h))
  };
}

/** @param {number} value @returns {number} two decimals, kills float noise */
export function round(value) {
  return Math.round(value * 100) / 100;
}

/** @param {Rect} rect @param {{top:number,right:number,bottom:number,number:left:number}} padding @returns {Rect} */
export function inset(rect, padding) {
  return {
    x: rect.x + padding.left,
    y: rect.y + padding.top,
    w: Math.max(0, rect.w - padding.left - padding.right),
    h: Math.max(0, rect.h - padding.top - padding.bottom)
  };
}