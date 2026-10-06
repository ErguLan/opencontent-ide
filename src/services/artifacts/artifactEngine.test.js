import { describe, expect, it } from 'vitest';
import { ARTIFACT_TYPES, OPERATION_TYPES, applyArtifactOperation, createArtifact, redoArtifact, snapshotArtifact, undoArtifact, withHistoryBase } from './artifactEngine.js';
import { DELIVERY_STATES, describePendingReview, isDeliveryState } from '../delivery/deliveryState.js';

describe('artifactEngine', () => {
  it('applies structured operations', () => {
    const artifact = withHistoryBase(createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } }));
    const next = applyArtifactOperation(artifact, { type: OPERATION_TYPES.ADD_ELEMENT, element: { id: 'a', label: 'A' } });
    expect(next.content.elements).toHaveLength(1);
    expect(next.operationCursor).toBe(0);
  });
  it('supports undo and redo', () => {
    const base = withHistoryBase(createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } }));
    const changed = applyArtifactOperation(base, { type: OPERATION_TYPES.ADD_ELEMENT, element: { id: 'a' } });
    const undone = undoArtifact(changed);
    expect(undone.content.elements).toHaveLength(0);
    expect(redoArtifact(undone).content.elements).toHaveLength(1);
  });
  it('rejects unknown operations', () => {
    expect(() => applyArtifactOperation(createArtifact(), { type: 'shell' })).toThrow();
  });
});

describe('artifactEngine delivery state', () => {
  const moveTo = (artifact, state) => applyArtifactOperation(artifact, { type: OPERATION_TYPES.SET_DELIVERY_STATE, state });

  it('creates every artifact as a draft with history', () => {
    const artifact = createArtifact({ type: ARTIFACT_TYPES.DOCUMENT });
    expect(artifact.delivery.state).toBe(DELIVERY_STATES.DRAFT);
    expect(artifact.delivery.history).toHaveLength(1);
    expect(artifact.delivery.history[0].state).toBe(DELIVERY_STATES.DRAFT);
    expect(artifact.delivery.history[0].at).toBeTruthy();
  });

  it('reads artifacts stored before the delivery model as drafts', () => {
    const legacy = { id: 'artifact_legacy', type: ARTIFACT_TYPES.DOCUMENT, name: 'Legacy', createdAt: '2025-01-01T00:00:00.000Z' };
    const artifact = createArtifact(legacy);
    expect(isDeliveryState(artifact.delivery.state)).toBe(true);
    expect(artifact.delivery.state).toBe(DELIVERY_STATES.DRAFT);
    expect(artifact.delivery.history[0].at).toBe(legacy.createdAt);
  });

  it('records a delivery change as a regular operation', () => {
    const reviewed = moveTo(createArtifact({ type: ARTIFACT_TYPES.DOCUMENT }), DELIVERY_STATES.IN_REVIEW);
    expect(reviewed.delivery.state).toBe(DELIVERY_STATES.IN_REVIEW);
    expect(reviewed.operations).toHaveLength(1);
    expect(reviewed.operations[0].type).toBe(OPERATION_TYPES.SET_DELIVERY_STATE);
    expect(reviewed.operations[0].state).toBe(DELIVERY_STATES.IN_REVIEW);
    expect(reviewed.operationCursor).toBe(0);
    expect(reviewed.delivery.history).toHaveLength(2);
  });

  it('walks the full cycle and never goes backwards', () => {
    let artifact = createArtifact({ type: ARTIFACT_TYPES.DOCUMENT });
    for (const state of [DELIVERY_STATES.IN_REVIEW, DELIVERY_STATES.APPROVED, DELIVERY_STATES.PUBLISHED]) {
      artifact = moveTo(artifact, state);
    }
    expect(artifact.delivery.state).toBe(DELIVERY_STATES.PUBLISHED);
    expect(artifact.delivery.history.map((entry) => entry.state)).toEqual(['draft', 'in-review', 'approved', 'published']);
    expect(() => moveTo(artifact, DELIVERY_STATES.APPROVED)).toThrow(/DELIVERY_TERMINAL_STATE/);
    expect(() => moveTo(createArtifact(), DELIVERY_STATES.PUBLISHED)).toThrow(/DELIVERY_INVALID_TRANSITION/);
  });

  it('rejects a delivery operation with an unknown state', () => {
    expect(() => applyArtifactOperation(createArtifact(), { type: OPERATION_TYPES.SET_DELIVERY_STATE, state: 'archived' })).toThrow(/Unsupported delivery state/);
  });

  it('undoes and redoes a delivery change like any other edit', () => {
    const base = withHistoryBase(createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } }));
    const reviewed = moveTo(base, DELIVERY_STATES.IN_REVIEW);
    const undone = undoArtifact(reviewed);
    expect(undone.delivery.state).toBe(DELIVERY_STATES.DRAFT);
    expect(undone.delivery.history).toHaveLength(1);
    expect(undone.operationCursor).toBe(-1);
    expect(redoArtifact(undone).delivery.state).toBe(DELIVERY_STATES.IN_REVIEW);
  });

  it('keeps delivery in sync when undoing an edit made after approval', () => {
    let artifact = withHistoryBase(createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } }));
    artifact = moveTo(artifact, DELIVERY_STATES.IN_REVIEW);
    artifact = moveTo(artifact, DELIVERY_STATES.APPROVED);
    artifact = applyArtifactOperation(artifact, { type: OPERATION_TYPES.ADD_ELEMENT, element: { id: 'a' } });
    expect(describePendingReview(artifact)).toBe(true);
    const undone = undoArtifact(artifact);
    expect(undone.delivery.state).toBe(DELIVERY_STATES.APPROVED);
    expect(describePendingReview(undone)).toBe(false);
    expect(redoArtifact(undone).delivery.state).toBe(DELIVERY_STATES.APPROVED);
    expect(redoArtifact(undone).content.elements).toHaveLength(1);
  });

  it('carries the delivery state into versions', () => {
    const reviewed = moveTo(createArtifact({ type: ARTIFACT_TYPES.DOCUMENT }), DELIVERY_STATES.IN_REVIEW);
    const versioned = snapshotArtifact(reviewed, 'sent to review');
    expect(versioned.versions).toHaveLength(1);
    expect(versioned.versions[0].delivery.state).toBe(DELIVERY_STATES.IN_REVIEW);
  });
});
