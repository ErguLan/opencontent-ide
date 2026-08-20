import { describe, expect, it } from 'vitest';
import { ARTIFACT_TYPES, OPERATION_TYPES, applyArtifactOperation, createArtifact, redoArtifact, undoArtifact, withHistoryBase } from './artifactEngine.js';

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
