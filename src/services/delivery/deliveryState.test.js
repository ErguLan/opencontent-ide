import { describe, expect, it } from 'vitest';
import {
  DELIVERY_ERROR_CODES,
  DELIVERY_OPERATION_TYPE,
  DELIVERY_STATES,
  DELIVERY_TRANSITIONS,
  DeliveryTransitionError,
  baseDelivery,
  createDelivery,
  describePendingReview,
  isDeliveryState,
  isTerminal,
  isValidTransition,
  nextStates,
  normalizeDelivery,
  resolveDeliveryState,
  statusForNewItem,
  validateTransition,
  withDeliveryState
} from './deliveryState.js';

const AT = '2026-01-01T00:00:00.000Z';

const deliveryOperation = (state, id) => ({ id, type: DELIVERY_OPERATION_TYPE, state, createdAt: AT });
const contentOperation = (id) => ({ id, type: 'set_content', value: { text: id }, createdAt: AT });

describe('deliveryState machine definition', () => {
  it('exposes exactly four states', () => {
    expect(Object.values(DELIVERY_STATES)).toEqual(['draft', 'in-review', 'approved', 'published']);
    expect(Object.keys(DELIVERY_TRANSITIONS)).toHaveLength(4);
  });

  it('freezes the state definitions', () => {
    expect(Object.isFrozen(DELIVERY_STATES)).toBe(true);
    expect(Object.isFrozen(DELIVERY_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(DELIVERY_TRANSITIONS.draft)).toBe(true);
  });

  it('starts new items as draft', () => {
    expect(statusForNewItem()).toBe(DELIVERY_STATES.DRAFT);
    expect(createDelivery(AT)).toEqual({ state: 'draft', history: [{ state: 'draft', at: AT }] });
  });

  it('only knows the four state identifiers', () => {
    expect(isDeliveryState('draft')).toBe(true);
    expect(isDeliveryState('published')).toBe(true);
    expect(isDeliveryState('archived')).toBe(false);
    expect(isDeliveryState('completed')).toBe(false);
    expect(isDeliveryState(null)).toBe(false);
    expect(isDeliveryState(undefined)).toBe(false);
  });

  it('reads legacy values as draft', () => {
    expect(resolveDeliveryState('completed')).toBe('draft');
    expect(resolveDeliveryState(undefined)).toBe('draft');
    expect(resolveDeliveryState('approved')).toBe('approved');
  });
});

describe('deliveryState transitions', () => {
  const valid = [
    ['draft', 'in-review'],
    ['in-review', 'approved'],
    ['approved', 'published']
  ];

  it.each(valid)('allows %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
    expect(validateTransition(from, to)).toBe(to);
    expect(nextStates(from)).toContain(to);
  });

  it('has no other forward transitions', () => {
    expect(nextStates('draft')).toEqual(['in-review']);
    expect(nextStates('in-review')).toEqual(['approved']);
    expect(nextStates('approved')).toEqual(['published']);
    expect(nextStates('published')).toEqual([]);
    expect(nextStates('unknown')).toEqual([]);
  });

  const invalid = [
    ['draft', 'draft'],
    ['draft', 'approved'],
    ['draft', 'published'],
    ['in-review', 'in-review'],
    ['in-review', 'published'],
    ['approved', 'approved'],
    ['published', 'draft'],
    ['published', 'in-review'],
    ['published', 'approved'],
    ['published', 'published']
  ];

  it.each(invalid)('rejects %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it('rejects out-of-order moves with a coded error', () => {
    expect.assertions(4);
    try {
      validateTransition('draft', 'published');
    } catch (error) {
      expect(error).toBeInstanceOf(DeliveryTransitionError);
      expect(error.code).toBe(DELIVERY_ERROR_CODES.INVALID_TRANSITION);
      expect(error.from).toBe('draft');
      expect(error.to).toBe('published');
    }
  });

  it('rejects unknown states with a distinct code', () => {
    expect(() => validateTransition('archived', 'published')).toThrow(/DELIVERY_UNKNOWN_STATE/);
    expect(() => validateTransition('draft', 'rejected')).toThrow(/DELIVERY_UNKNOWN_STATE/);
  });

  it('reports terminal states with their own code', () => {
    expect(() => validateTransition('published', 'draft')).toThrow(/DELIVERY_TERMINAL_STATE/);
  });

  it('marks only published as terminal', () => {
    expect(isTerminal('published')).toBe(true);
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('in-review')).toBe(false);
    expect(isTerminal('approved')).toBe(false);
    expect(isTerminal('unknown')).toBe(false);
  });
});

describe('deliveryState records', () => {
  it('appends history without mutating the previous record', () => {
    const draft = createDelivery(AT);
    const review = withDeliveryState(draft, 'in-review', { at: AT, note: 'ready' });
    const approved = withDeliveryState(review, 'approved', { at: AT });

    expect(draft).toEqual({ state: 'draft', history: [{ state: 'draft', at: AT }] });
    expect(review.history).toHaveLength(2);
    expect(review.history[1]).toEqual({ state: 'in-review', at: AT, note: 'ready' });
    expect(approved.state).toBe('approved');
    expect(approved.history).toHaveLength(3);
  });

  it('refuses an illegal append', () => {
    const draft = createDelivery(AT);
    expect(() => withDeliveryState(draft, 'published', { at: AT })).toThrow(DeliveryTransitionError);
  });

  it('normalizes missing, partial and legacy records', () => {
    expect(normalizeDelivery(undefined, { at: AT })).toEqual({ state: 'draft', history: [{ state: 'draft', at: AT }] });
    expect(normalizeDelivery({}, { at: AT }).state).toBe('draft');
    expect(normalizeDelivery({ state: 'completed' }, { at: AT }).state).toBe('draft');
    expect(normalizeDelivery({ state: 'approved' }, { at: AT })).toEqual({ state: 'approved', history: [{ state: 'approved', at: AT }] });
    expect(normalizeDelivery({ state: 'approved', history: 'nope' }, { at: AT }).state).toBe('approved');
  });

  it('drops history entries that are not delivery states', () => {
    const normalized = normalizeDelivery({ state: 'in-review', history: [{ state: 'in-review', at: AT }, { state: 'nope' }] }, { at: AT });
    expect(normalized.history).toEqual([{ state: 'in-review', at: AT }]);
  });

  it('rewinds to the first history entry for replay', () => {
    const published = withDeliveryState(withDeliveryState(createDelivery(AT), 'in-review', { at: AT }), 'approved', { at: AT });
    const delivered = withDeliveryState(published, 'published', { at: AT });

    expect(baseDelivery(delivered, { at: AT })).toEqual({ state: 'draft', history: [{ state: 'draft', at: AT }] });
  });
});

describe('pending review derivation', () => {
  it('is false for a draft', () => {
    expect(describePendingReview({ delivery: createDelivery(AT), operations: [contentOperation('a')], operationCursor: 0 })).toBe(false);
  });

  it('is false for an artifact without delivery (legacy)', () => {
    expect(describePendingReview({ operations: [contentOperation('a')], operationCursor: 0 })).toBe(false);
  });

  it('is false right after a transition', () => {
    const artifact = { delivery: withDeliveryState(createDelivery(AT), 'in-review', { at: AT }), operations: [contentOperation('a'), deliveryOperation('in-review', 'd')], operationCursor: 1 };
    expect(describePendingReview(artifact)).toBe(false);
  });

  it('is true when work was applied after the transition', () => {
    const artifact = {
      delivery: withDeliveryState(createDelivery(AT), 'in-review', { at: AT }),
      operations: [contentOperation('a'), deliveryOperation('in-review', 'd'), contentOperation('b')],
      operationCursor: 2
    };
    expect(describePendingReview(artifact)).toBe(true);
  });

  it('is true when work was applied after approval', () => {
    const delivery = withDeliveryState(withDeliveryState(createDelivery(AT), 'in-review', { at: AT }), 'approved', { at: AT });
    const artifact = { delivery, operations: [deliveryOperation('in-review', 'd'), deliveryOperation('approved', 'e'), contentOperation('b')], operationCursor: 2 };
    expect(describePendingReview(artifact)).toBe(true);
  });

  it('is false for a published piece with no later work', () => {
    const delivery = withDeliveryState(withDeliveryState(withDeliveryState(createDelivery(AT), 'in-review', { at: AT }), 'approved', { at: AT }), 'published', { at: AT });
    const artifact = { delivery, operations: [deliveryOperation('in-review', 'd'), deliveryOperation('approved', 'e'), deliveryOperation('published', 'p')], operationCursor: 2 };
    expect(describePendingReview(artifact)).toBe(false);
  });

  it('ignores operations undone past the cursor', () => {
    const artifact = {
      delivery: withDeliveryState(createDelivery(AT), 'in-review', { at: AT }),
      operations: [deliveryOperation('in-review', 'd'), contentOperation('b')],
      operationCursor: 0
    };
    expect(describePendingReview(artifact)).toBe(false);
  });

  it('is false for an empty or invalid input', () => {
    expect(describePendingReview(null)).toBe(false);
    expect(describePendingReview({})).toBe(false);
    expect(describePendingReview({ delivery: { state: 'in-review' } })).toBe(false);
  });
});
