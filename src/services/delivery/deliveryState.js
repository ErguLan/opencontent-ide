/**
 * Delivery State Machine
 * OpenContent IDE
 *
 * A piece of content is not done when it is generated. It is done when it has
 * been asked for, refined, reviewed, approved and published. This module is the
 * single source of truth for that lifecycle.
 *
 * The model is deliberately linear:
 *
 *   draft -> in-review -> approved -> published
 *
 * Rules:
 * - Only forward transitions exist. No jumps, no skips, no going back.
 * - `published` is terminal. A published piece is never un-published; the way to
 *   change a published piece is to create a new version of it.
 * - Anything else is a programming error and is reported as one.
 *
 * This module is pure: no React, no IndexedDB, no clock reading of its own
 * (callers pass `at`). It also has no knowledge of i18n. The state values are
 * stable machine identifiers, never user-facing copy; translating them is the
 * responsibility of the interface layer, which owns the `delivery.state.*` keys.
 */

export const DELIVERY_STATES = Object.freeze({
  DRAFT: 'draft',
  IN_REVIEW: 'in-review',
  APPROVED: 'approved',
  PUBLISHED: 'published'
});

/** Forward-only adjacency list. A missing key means "not a state". */
export const DELIVERY_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['in-review']),
  'in-review': Object.freeze(['approved']),
  approved: Object.freeze(['published']),
  published: Object.freeze([])
});

/** Operation type used when an artifact changes state through its operation log. */
export const DELIVERY_OPERATION_TYPE = 'set_delivery_state';

export const DELIVERY_ERROR_CODES = Object.freeze({
  UNKNOWN_STATE: 'DELIVERY_UNKNOWN_STATE',
  TERMINAL_STATE: 'DELIVERY_TERMINAL_STATE',
  INVALID_TRANSITION: 'DELIVERY_INVALID_TRANSITION'
});

/** Thrown by `validateTransition` and `withDeliveryState`. Always carries a code. */
export class DeliveryTransitionError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'DeliveryTransitionError';
    this.code = code;
    this.from = details.from ?? null;
    this.to = details.to ?? null;
  }
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => (value == null ? value : structuredClone(value));

export function isDeliveryState(state) {
  return typeof state === 'string' && Object.prototype.hasOwnProperty.call(DELIVERY_TRANSITIONS, state);
}

export function isValidTransition(from, to) {
  if (!isDeliveryState(from) || !isDeliveryState(to)) return false;
  return DELIVERY_TRANSITIONS[from].includes(to);
}

export function nextStates(from) {
  if (!isDeliveryState(from)) return [];
  return [...DELIVERY_TRANSITIONS[from]];
}

export function isTerminal(state) {
  return isDeliveryState(state) && DELIVERY_TRANSITIONS[state].length === 0;
}

/**
 * Returns `to` when the transition is legal, throws a coded error otherwise.
 * Failures are never silent: an unknown state, a terminal state and a plain
 * out-of-order move are three different problems with three different codes.
 */
export function validateTransition(from, to) {
  if (!isDeliveryState(from)) {
    throw new DeliveryTransitionError(DELIVERY_ERROR_CODES.UNKNOWN_STATE, `"${from}" is not a delivery state`, { from, to });
  }
  if (!isDeliveryState(to)) {
    throw new DeliveryTransitionError(DELIVERY_ERROR_CODES.UNKNOWN_STATE, `"${to}" is not a delivery state`, { from, to });
  }
  if (isTerminal(from)) {
    throw new DeliveryTransitionError(DELIVERY_ERROR_CODES.TERMINAL_STATE, `"${from}" is terminal and cannot move to "${to}"`, { from, to });
  }
  if (!isValidTransition(from, to)) {
    throw new DeliveryTransitionError(DELIVERY_ERROR_CODES.INVALID_TRANSITION, `cannot move from "${from}" to "${to}"`, { from, to });
  }
  return to;
}

/** Every new item starts as a draft. */
export function statusForNewItem() {
  return DELIVERY_STATES.DRAFT;
}

/**
 * Tolerant reader for persisted values. Artifacts and assets written before the
 * delivery model existed have no delivery state, or a legacy `status` value
 * such as `completed`. Both are read as a draft instead of failing to load.
 */
export function resolveDeliveryState(value) {
  return isDeliveryState(value) ? value : statusForNewItem();
}

/** Initial delivery record for a freshly created item. */
export function createDelivery(at) {
  const state = statusForNewItem();
  return { state, history: [{ state, at }] };
}

/**
 * Normalizes a persisted delivery record. Missing or malformed history is
 * rebuilt from the current state so that a legacy record stays usable without a
 * write, and a corrupted history never invents a transition that did not happen.
 */
export function normalizeDelivery(value, { at } = {}) {
  const record = isPlainObject(value) ? value : null;
  const history = record && Array.isArray(record.history)
    ? record.history.filter((entry) => isPlainObject(entry) && isDeliveryState(entry.state)).map((entry) => ({ ...clone(entry) }))
    : [];
  if (record && isDeliveryState(record.state)) {
    return { state: record.state, history: history.length ? history : [{ state: record.state, at }] };
  }
  const recorded = history.length ? history[history.length - 1].state : null;
  const state = isDeliveryState(recorded) ? recorded : statusForNewItem();
  return { state, history: history.length ? history : [{ state, at }] };
}

/**
 * The delivery record a replay starts from: the very first history entry.
 * Rebuilding the operation log means rewinding delivery too, otherwise replaying
 * a transition would be validated against a state it already passed through.
 */
export function baseDelivery(value, { at } = {}) {
  const delivery = normalizeDelivery(value, { at });
  return { state: delivery.history[0].state, history: [clone(delivery.history[0])] };
}

/** Validated, append-only state change. Returns a new record; never mutates. */
export function withDeliveryState(deliveryInput, to, { at, note } = {}) {
  const delivery = normalizeDelivery(deliveryInput, { at });
  validateTransition(delivery.state, to);
  const entry = { state: to, at };
  if (note) entry.note = note;
  return { state: to, history: [...delivery.history, entry] };
}

/**
 * Derives whether an item has changes that no human has reviewed yet.
 *
 * This is a derivation, not a fifth state: a piece already sent to review can
 * still be edited, and those edits are exactly what is pending. Drafts are
 * never "pending review" because nothing has been submitted yet.
 *
 * The derivation is operation-log based: everything applied after the last
 * delivery transition is unreviewed work.
 */
export function describePendingReview(artifact) {
  if (!isPlainObject(artifact)) return false;
  const delivery = normalizeDelivery(artifact.delivery, { at: artifact.createdAt });
  if (delivery.state === DELIVERY_STATES.DRAFT) return false;
  const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
  const cursor = Number.isInteger(artifact.operationCursor) ? artifact.operationCursor : operations.length - 1;
  const applied = operations.slice(0, cursor + 1);
  let boundary = -1;
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    if (applied[index]?.type === DELIVERY_OPERATION_TYPE) { boundary = index; break; }
  }
  return applied.slice(boundary + 1).some((operation) => operation?.type !== DELIVERY_OPERATION_TYPE);
}
