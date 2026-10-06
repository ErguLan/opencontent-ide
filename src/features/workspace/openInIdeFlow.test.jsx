/**
 * The honest part of "open in an external editor".
 *
 * A browser cannot read where a user's files are, and it cannot tell whether a
 * desktop application opened a file. These tests lock both limits: the document
 * is exported before any link exists, a blocked export produces no link at all,
 * and the folder path is whatever the user typed — never an invented one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { LanguageProvider } from '../../context/LanguageContext';
import { STORAGE_KEYS } from '../../config/constants';
import { setLanguage, t } from '../../i18n/index.js';
import { chooseLocalDirectory, clearLocalDirectory } from '../../services/filePersistence';
import OpenInIdeModal from './components/OpenInIdeModal';
import { useWorkspaceActions } from './hooks/useWorkspaceActions';

const CONFIG = { scheme: 'testeditor', appName: 'Test Editor', helpUrl: '' };

const written = new Map();
const directoryHandle = {
    name: 'Docs',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (filename, options = {}) => {
        if (written.has(filename)) {
            return { createWritable: async () => ({ write: async (blob) => written.set(filename, blob), close: async () => {} }) };
        }
        if (options.create) {
            written.set(filename, null);
            return { createWritable: async () => ({ write: async (blob) => written.set(filename, blob), close: async () => {} }) };
        }
        const error = new Error('missing');
        error.name = 'NotFoundError';
        throw error;
    }
};

const stubDirectoryPicker = () => { window.showDirectoryPicker = async () => directoryHandle; };

const allowDirectoryWrites = () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_SAVE_SETTINGS, JSON.stringify({
        mode: 'configured-directory',
        allowLocalWrites: true,
        allowOverwrite: false
    }));
    stubDirectoryPicker();
};

const renderActions = (version) => {
    const notices = [];
    const agentRun = {
        openInfoNotice: (title, message) => notices.push({ title, message }),
        notifyAIError: vi.fn(),
        setPendingArtifactSaves: vi.fn(),
        isGenerating: false
    };
    const results = {
        versions: [version],
        currentVersionIndex: 0,
        currentPrompt: version.prompt,
        history: [],
        getSafeIndex: (index) => (index === 0 ? 0 : -1)
    };

    return {
        notices,
        ...renderHook(() => useWorkspaceActions({
            t,
            usageUserId: 'user_1',
            agentRun,
            results,
            projects: { loadProjects: vi.fn() },
            media: {},
            models: { imageModel: null },
            imageConfig: {},
            agenticMode: false,
            currentProjectId: 'project_1',
            onRefreshUsage: vi.fn(),
            gateAction: () => true
        }))
    };
};

const renderModal = (state) => render(
    <LanguageProvider>
        <OpenInIdeModal state={state} config={CONFIG} onClose={() => {}} t={t} />
    </LanguageProvider>
);

const textVersion = { type: 'text', prompt: 'Spring campaign', result: '# Heading\nBody' };
const imageVersion = { type: 'text', prompt: 'Spring campaign', result: '', imageUrl: 'blob:fake-image' };

beforeEach(() => {
    setLanguage('en');
    localStorage.clear();
    written.clear();
    clearLocalDirectory();
    vi.stubEnv('VITE_EXTERNAL_IDE_SCHEME', CONFIG.scheme);
    vi.stubEnv('VITE_EXTERNAL_IDE_APP_NAME', CONFIG.appName);
});

afterEach(() => {
    cleanup();
    delete window.showDirectoryPicker;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('opening a version in an external editor', () => {
    it('exports the document before offering anything', async () => {
        allowDirectoryWrites();
        await chooseLocalDirectory();
        const view = renderActions(textVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        const state = view.result.current.openInIde;
        expect(state.status).toBe('ready');
        expect(written.size).toBe(1);
        expect([...written.keys()][0]).toMatch(/^Spring campaign\.md$/);
        expect(await written.get([...written.keys()][0]).text()).toBe('# Heading\nBody');
    });

    it('reports where the export went without inventing an absolute path', async () => {
        allowDirectoryWrites();
        await chooseLocalDirectory();
        const view = renderActions(textVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        const { location, filename } = view.result.current.openInIde;
        expect(location).toContain('Docs');
        expect(location).not.toMatch(/fakepath|[A-Za-z]:\\Users/);
        expect(filename).toBe('Spring campaign.md');
    });

    it('fetches an image version and exports the bytes', async () => {
        allowDirectoryWrites();
        await chooseLocalDirectory();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['bytes'], { type: 'image/png' }) })));
        const view = renderActions(imageVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        expect(view.result.current.openInIde.status).toBe('ready');
        expect([...written.keys()][0]).toMatch(/\.png$/);
        expect(fetch).toHaveBeenCalledWith('blob:fake-image');
    });

    it('offers no link when nothing reached disk', async () => {
        // The default local save mode keeps the document inside the browser.
        const view = renderActions(textVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        const state = view.result.current.openInIde;
        expect(state.status).toBe('blocked');
        expect(state.blockKey).toBe('projectOnly');
        expect(written.size).toBe(0);
    });

    it('offers no link when local writes are disabled', async () => {
        localStorage.setItem(STORAGE_KEYS.LOCAL_SAVE_SETTINGS, JSON.stringify({
            mode: 'configured-directory',
            allowLocalWrites: false
        }));
        stubDirectoryPicker();
        await chooseLocalDirectory();
        const view = renderActions(textVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        expect(view.result.current.openInIde.blockKey).toBe('localWritesBlocked');
        expect(written.size).toBe(0);
    });

    it('says the integration is not configured instead of linking to nothing', async () => {
        vi.stubEnv('VITE_EXTERNAL_IDE_SCHEME', '');
        vi.stubEnv('VITE_EXTERNAL_IDE_APP_NAME', '');
        const view = renderActions(textVersion);

        await act(async () => { await view.result.current.handleOpenInIde(); });

        expect(view.notices.at(-1).title).toBe(t('workspace.openInIde.notConfiguredTitle'));
        expect(view.result.current.openInIde.open).toBe(false);
        expect(written.size).toBe(0);
    });

    it('reports a version with nothing to export', async () => {
        allowDirectoryWrites();
        await chooseLocalDirectory();
        const view = renderActions({ type: 'text', prompt: 'empty', result: '   ' });

        await act(async () => { await view.result.current.handleOpenInIde(); });

        expect(view.result.current.openInIde.blockKey).toBe('noContent');
        expect(written.size).toBe(0);
    });
});

describe('open in editor modal', () => {
    const readyState = { open: true, status: 'ready', filename: 'Spring campaign.md', location: 'exported', code: 'browser-download' };

    it('offers a pathless link by default and says it only opens the editor', () => {
        renderModal(readyState);

        const link = screen.getByRole('link', { name: t('workspace.openInIde.openLink', { app: CONFIG.appName }) });
        expect(link.getAttribute('href')).toBe('testeditor://open?v=1');
        expect(screen.getByText(t('workspace.openInIde.linkWithoutPath', { app: CONFIG.appName }))).toBeTruthy();
    });

    it('never claims the document was opened', () => {
        renderModal(readyState);

        expect(screen.queryByText(/opened successfully/i)).toBeNull();
        expect(screen.getByText(t('workspace.openInIde.linkHint', { app: CONFIG.appName }))).toBeTruthy();
        expect(screen.getByText(t('workspace.openInIde.help', { app: CONFIG.appName }))).toBeTruthy();
    });

    it('adds the folder the user typed, encoded', () => {
        renderModal(readyState);

        fireEvent.change(screen.getByLabelText(t('workspace.openInIde.pathLabel')), {
            target: { value: 'C:\\Users\\Ana\\Mis Documentos' }
        });

        const link = screen.getByRole('link', { name: t('workspace.openInIde.openLink', { app: CONFIG.appName }) });
        expect(link.getAttribute('href')).toBe(
            'testeditor://open?v=1&project=C%3A%5CUsers%5CAna%5CMis+Documentos&file=Spring+campaign.md&panel=editor'
        );
    });

    it('refuses a folder that is not a local path and shows the code', () => {
        renderModal(readyState);

        fireEvent.change(screen.getByLabelText(t('workspace.openInIde.pathLabel')), {
            target: { value: 'https://example.com/docs' }
        });

        expect(screen.queryByRole('link', { name: t('workspace.openInIde.openLink', { app: CONFIG.appName }) })).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('OPEN_IN_IDE_PATH_INVALID');
    });

    it('shows the export failure and no link when nothing was written', () => {
        renderModal({ open: true, status: 'blocked', filename: '', location: '', blockKey: 'projectOnly', code: 'project' });

        expect(screen.getByText(t('workspace.openInIde.projectOnly'))).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });
});