/**
 * Renders the real feature routes inside the real providers and fails if any of
 * them throws while rendering.
 *
 * This is a smoke test, not a behaviour test. It exists because a single
 * mismatched prop in a feature component used to blank the whole app, and
 * neither lint nor the service-level tests could see it. If a route throws on
 * mount, this fails.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { createFakeIndexedDb } from './fakeIndexedDb';
import { ThemeProvider } from '../context/ThemeContext';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthProvider } from '../context/AuthContext';

import Workspace from '../features/workspace/Workspace';
import LibraryPage from '../features/library/LibraryPage';
import AISetupPage from '../features/setup/AISetupPage';
import ArtifactStudio from '../features/artifacts/ArtifactStudio';

const wrap = (ui) => (
    <MemoryRouter>
        <ThemeProvider>
            <LanguageProvider>
                <AuthProvider>{ui}</AuthProvider>
            </LanguageProvider>
        </ThemeProvider>
    </MemoryRouter>
);

describe('route render smoke test', () => {
    let fake;
    let original;

    beforeEach(() => {
        original = globalThis.indexedDB;
        fake = createFakeIndexedDb();
        globalThis.indexedDB = fake;
    });

    afterEach(() => {
        cleanup();
        globalThis.indexedDB = original;
    });

    it('renders the workspace without throwing', () => {
        expect(() => render(wrap(<Workspace />))).not.toThrow();
    });

    it('renders the library without throwing', () => {
        expect(() => render(wrap(<LibraryPage />))).not.toThrow();
    });

    it('renders AI setup without throwing', () => {
        expect(() => render(wrap(<AISetupPage />))).not.toThrow();
    });

    it('renders the artifact studio without throwing', () => {
        expect(() => render(wrap(<ArtifactStudio />))).not.toThrow();
    });
});
