/**
 * Publishing is the delivery cycle, not a queue.
 *
 * The workspace used to push the current version into an in-memory list stored
 * under a localStorage key: nothing was validated, nothing survived a reload and
 * nothing corresponded to the piece the library knows about. These tests lock the
 * replacement: publishing resolves the piece, asks the state machine for
 * permission, and records the move as an artifact operation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { createFakeIndexedDb } from '../../../test/fakeIndexedDb';
import { closeConnection } from '../../../services/db/connection';
import { resetMigrationState } from '../../../services/db/migration';
import {
    ARTIFACT_TYPES,
    OPERATION_TYPES,
    applyArtifactOperation,
    createArtifact,
    getArtifact,
    listArtifacts,
    saveArtifact,
    undoArtifact
} from '../../../services/artifacts/artifactEngine';
import { DELIVERY_STATES } from '../../../services/delivery/deliveryState';
import { setLanguage, t } from '../../../i18n/index.js';
import { useWorkspaceActions } from './useWorkspaceActions';

const originalIndexedDB = globalThis.indexedDB;
const PROJECT_ID = 'project_under_test';

/** An artifact walked to `state` through the machine, never set directly. */
const buildPiece = (state, overrides = {}) => {
    const path = [DELIVERY_STATES.DRAFT, DELIVERY_STATES.IN_REVIEW, DELIVERY_STATES.APPROVED, DELIVERY_STATES.PUBLISHED];
    const target = path.indexOf(state);
    if (target < 0) throw new Error(`Unknown delivery state: ${state}`);
    let artifact = createArtifact({ type: ARTIFACT_TYPES.DOCUMENT, projectId: PROJECT_ID, name: 'Piece', ...overrides });
    for (const step of path.slice(1, target + 1)) {
        artifact = applyArtifactOperation(artifact, { type: OPERATION_TYPES.SET_DELIVERY_STATE, state: step });
    }
    return artifact;
};

const renderActions = ({ currentProjectId = PROJECT_ID } = {}) => {
    const notices = [];
    const agentRun = {
        openInfoNotice: (title, message) => notices.push({ title, message }),
        notifyAIError: vi.fn(),
        setPendingArtifactSaves: vi.fn(),
        isGenerating: false
    };
    const results = {
        versions: [{ type: 'text', prompt: 'a prompt', result: 'a result' }],
        currentVersionIndex: 0,
        currentPrompt: 'a prompt',
        history: [],
        getSafeIndex: (index) => (index >= 0 && index < 1 ? index : -1)
    };

    const view = renderHook(() => useWorkspaceActions({
        t,
        usageUserId: 'user_1',
        agentRun,
        results,
        projects: { loadProjects: vi.fn() },
        media: {},
        models: { imageModel: null },
        imageConfig: {},
        agenticMode: false,
        currentProjectId,
        onRefreshUsage: vi.fn(),
        gateAction: () => true
    }));

    return { ...view, notices };
};

const publish = async (view) => {
    await act(async () => { await view.result.current.handlePublishProject(); });
};

beforeEach(async () => {
    setLanguage('en');
    globalThis.indexedDB = createFakeIndexedDb();
    await closeConnection();
    resetMigrationState();
});

afterEach(async () => {
    cleanup();
    await closeConnection();
    resetMigrationState();
    if (originalIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDB;
    vi.restoreAllMocks();
});

describe('publishing a version', () => {
    it('publishes from approved and records the move as a version', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.APPROVED));
        const view = renderActions();

        await publish(view);

        const stored = await getArtifact(piece.id);
        expect(stored.delivery.state).toBe(DELIVERY_STATES.PUBLISHED);
        expect(stored.versions).toHaveLength(1);
        expect(stored.versions[0].delivery.state).toBe(DELIVERY_STATES.PUBLISHED);
        expect(stored.operations.at(-1).type).toBe(OPERATION_TYPES.SET_DELIVERY_STATE);
        expect(stored.operations.at(-1).state).toBe(DELIVERY_STATES.PUBLISHED);
        expect(view.notices.at(-1).title).toBe(t('workspace.publish.publishedTitle'));
    });

    it('stays undoable, because publishing is an ordinary operation', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.APPROVED));
        const view = renderActions();
        await publish(view);

        const stored = await getArtifact(piece.id);
        expect(undoArtifact(stored).delivery.state).toBe(DELIVERY_STATES.APPROVED);
    });

    it('refuses to publish from draft and says which state it is in', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.DRAFT));
        const view = renderActions();

        await publish(view);

        const stored = await getArtifact(piece.id);
        expect(stored.delivery.state).toBe(DELIVERY_STATES.DRAFT);
        expect(stored.versions).toHaveLength(0);
        expect(stored.operations).toHaveLength(0);
        expect(view.notices.at(-1).title).toBe(t('workspace.publish.notApprovedTitle'));
        expect(view.notices.at(-1).message).toContain(t('delivery.states.draft'));
        expect(view.notices.at(-1).message).toContain(t('delivery.states.in-review'));
    });

    it('refuses to publish from in-review and names the next state', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.IN_REVIEW));
        const view = renderActions();

        await publish(view);

        const stored = await getArtifact(piece.id);
        expect(stored.delivery.state).toBe(DELIVERY_STATES.IN_REVIEW);
        expect(view.notices.at(-1).message).toContain(t('delivery.states.approved'));
    });

    it('does nothing from published, which is terminal', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.PUBLISHED));
        const operationsBefore = piece.operations.length;
        const view = renderActions();

        await publish(view);

        const stored = await getArtifact(piece.id);
        expect(stored.delivery.state).toBe(DELIVERY_STATES.PUBLISHED);
        expect(stored.operations).toHaveLength(operationsBefore);
        expect(stored.versions).toHaveLength(0);
        expect(view.notices.at(-1).title).toBe(t('workspace.publish.alreadyPublishedTitle'));
    });

    it('survives a reload, because the state is persisted and not queued', async () => {
        const piece = await saveArtifact(buildPiece(DELIVERY_STATES.APPROVED));
        const view = renderActions();
        await publish(view);

        await closeConnection();
        const reread = await getArtifact(piece.id);

        expect(reread.delivery.state).toBe(DELIVERY_STATES.PUBLISHED);
        expect(reread.delivery.history.map((entry) => entry.state)).toEqual([
            DELIVERY_STATES.DRAFT,
            DELIVERY_STATES.IN_REVIEW,
            DELIVERY_STATES.APPROVED,
            DELIVERY_STATES.PUBLISHED
        ]);
    });

    it('explains that delivery is managed on artifacts when the project has none', async () => {
        const view = renderActions();

        await publish(view);

        expect(view.notices.at(-1).title).toBe(t('workspace.publish.noArtifactTitle'));
        expect(await listArtifacts({ projectId: PROJECT_ID })).toHaveLength(0);
    });

    it('never touches a piece that belongs to another project', async () => {
        const other = await saveArtifact(buildPiece(DELIVERY_STATES.APPROVED, { projectId: 'another_project' }));
        const view = renderActions();

        await publish(view);

        expect((await getArtifact(other.id)).delivery.state).toBe(DELIVERY_STATES.APPROVED);
        expect(view.notices.at(-1).title).toBe(t('workspace.publish.noArtifactTitle'));
    });

    it('explains that a version without a project has no piece to publish', async () => {
        await saveArtifact(buildPiece(DELIVERY_STATES.APPROVED));
        const view = renderActions({ currentProjectId: null });

        await publish(view);

        expect(view.notices.at(-1).title).toBe(t('workspace.publish.needsProjectTitle'));
    });
});