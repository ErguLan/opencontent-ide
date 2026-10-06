import { describe, it, expect, beforeEach } from 'vitest';
import { t, getSection, getLanguages, setLanguage } from './index.js';

describe('i18n', () => {
    beforeEach(() => {
        setLanguage('en');
    });

    it('returns nested translations', () => {
        const value = t('common.close');
        expect(value).toBe('Close');
    });

    it('returns a fallback key when missing', () => {
        const value = t('nonexistent.key.that.does.not.exist');
        expect(value).toBe('nonexistent.key.that.does.not.exist');
    });

    it('supports interpolation', () => {
        setLanguage('en');
        const value = t('cli.themeSet', { theme: 'dark' });
        expect(value).toBe('Theme set to dark');
    });

    it('switches languages', () => {
        setLanguage('es');
        expect(t('common.close')).toBe('Cerrar');
        setLanguage('en');
        expect(t('common.close')).toBe('Close');
    });

    it('lists supported languages', () => {
        const languages = getLanguages();
        expect(languages.some((l) => l.code === 'en')).toBe(true);
        expect(languages.some((l) => l.code === 'es')).toBe(true);
    });

    it('returns sections', () => {
        const section = getSection('common');
        expect(section.close).toBe('Close');
    });

    it('keeps the imageArtifact keys in parity between English and Spanish', () => {
        const flatten = (value, prefix = '') => Object.entries(value)
            .flatMap(([key, child]) => (child && typeof child === 'object' ? flatten(child, `${prefix}${key}.`) : [`${prefix}${key}`]))
            .sort();
        expect(flatten(getSection('imageArtifact', 'en'))).toEqual(flatten(getSection('imageArtifact', 'es')));
        expect(flatten(getSection('imageArtifact', 'en')).length).toBeGreaterThan(0);
    });

    it('resolves the image artifact labels the studio renders', () => {
        expect(t('imageArtifact.regenerate', {}, 'en')).toBe('Regenerate image');
        expect(t('imageArtifact.regenerate', {}, 'es')).toBe('Regenerar imagen');
        expect(t('imageArtifact.assetId', { id: 'asset_1' }, 'en')).toContain('asset_1');
    });
});
