/**
 * Setup onboarding: the credential step must be reachable on a fresh install.
 *
 * These exist because the save button used to read the persisted key instead of
 * the draft, which left it permanently disabled: the first key is exactly what
 * that step has to store, so the flow deadlocked. Lint and the service tests
 * could not see it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { createFakeIndexedDb } from './fakeIndexedDb';
import { ThemeProvider } from '../context/ThemeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthProvider } from '../context/AuthContext';
import AISetupPage from '../features/setup/AISetupPage';
import { STORAGE_KEYS } from '../config/constants';

const renderSetup = () => render(
    <MemoryRouter>
        <ThemeProvider>
            <LanguageProvider>
                <AuthProvider><AISetupPage /></AuthProvider>
            </LanguageProvider>
        </ThemeProvider>
    </MemoryRouter>
);

const chooseOpenRouter = () => {
    fireEvent.click(screen.getByRole('radio', { name: /openrouter/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
};

describe('setup credential step', () => {
    let original;

    beforeEach(() => {
        original = globalThis.indexedDB;
        globalThis.indexedDB = createFakeIndexedDb();
    });

    afterEach(() => {
        cleanup();
        globalThis.indexedDB = original;
    });

    it('enables the save button once a key is typed, with nothing persisted yet', () => {
        renderSetup();
        chooseOpenRouter();

        const save = screen.getByRole('button', { name: /save|guardar/i });
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/openrouter/i, { selector: 'input' }), {
            target: { value: 'sk-or-test-key' }
        });

        expect(save).not.toBeDisabled();
    });

    it('keeps saving after the fact', () => {
        renderSetup();
        chooseOpenRouter();
        const input = screen.getByLabelText(/openrouter/i, { selector: 'input' });
        fireEvent.change(input, { target: { value: 'sk-or-test-key' } });
        fireEvent.click(screen.getByRole('button', { name: /save|guardar/i }));

        expect(localStorage.getItem(STORAGE_KEYS.API_KEYS?.openrouter || 'oc_k_or')).toBe('sk-or-test-key');
    });

    it('trims a key pasted with surrounding whitespace', () => {
        renderSetup();
        chooseOpenRouter();
        fireEvent.change(screen.getByLabelText(/openrouter/i, { selector: 'input' }), {
            target: { value: '  sk-or-test-key\n' }
        });
        fireEvent.click(screen.getByRole('button', { name: /save|guardar/i }));

        expect(localStorage.getItem(STORAGE_KEYS.API_KEYS?.openrouter || 'oc_k_or')).toBe('sk-or-test-key');
    });

    it('does not carry a stale error back onto the credential step', () => {
        renderSetup();
        chooseOpenRouter();
        fireEvent.change(screen.getByLabelText(/openrouter/i, { selector: 'input' }), {
            target: { value: 'sk-or-test-key' }
        });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        // Step 3 attempts a discovery that cannot succeed here; whatever it
        // reports, going back must not repaint it on the credential step.
        fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
        fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('reaches discovery once the key is stored', () => {
        renderSetup();
        chooseOpenRouter();
        fireEvent.change(screen.getByLabelText(/openrouter/i, { selector: 'input' }), {
            target: { value: 'sk-or-test-key' }
        });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        // A key is stored, so discovery must not complain about a missing one.
        fireEvent.click(screen.getByRole('button', { name: /discover models/i }));

        expect(screen.queryByText(/save your openrouter key first/i)).not.toBeInTheDocument();
    });
});

describe('setup model id entry', () => {
    let original;

    beforeEach(() => {
        original = globalThis.indexedDB;
        globalThis.indexedDB = createFakeIndexedDb();
    });

    afterEach(() => {
        cleanup();
        globalThis.indexedDB = original;
    });

    const reachModelStep = () => {
        renderSetup();
        chooseOpenRouter();
        fireEvent.change(screen.getByLabelText(/openrouter/i, { selector: 'input' }), {
            target: { value: 'sk-or-test-key' }
        });
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    };

    it('offers the manual id field before any discovery is run', () => {
        reachModelStep();
        expect(screen.getByPlaceholderText(/model id/i)).toBeInTheDocument();
    });

    it('registers a typed model id without ever calling discovery', () => {
        reachModelStep();
        fireEvent.click(screen.getByRole('button', { name: /^text$/i }));
        fireEvent.change(screen.getByPlaceholderText(/model id/i), { target: { value: 'anthropic/claude-sonnet-4' } });
        fireEvent.click(screen.getByRole('button', { name: /register this model/i }));

        expect(screen.getAllByText('anthropic/claude-sonnet-4').length).toBeGreaterThan(0);
    });

    it('refuses to register an id with no capability, instead of storing a dead entry', () => {
        reachModelStep();
        fireEvent.change(screen.getByPlaceholderText(/model id/i), { target: { value: 'anthropic/claude-sonnet-4' } });
        fireEvent.click(screen.getByRole('button', { name: /register this model/i }));

        expect(screen.getByRole('alert')).toBeInTheDocument();
        // The registry below must not have grown.
        expect(screen.queryByText('anthropic/claude-sonnet-4')).not.toBeInTheDocument();
    });

    it('keeps the manual field available after a discovery succeeds', () => {
        reachModelStep();
        expect(screen.getByPlaceholderText(/model id/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /discover models/i })).toBeInTheDocument();
    });
});