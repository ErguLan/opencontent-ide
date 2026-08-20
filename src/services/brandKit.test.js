import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildBrandContextText,
    getBrandKit,
    normalizeBrandKit,
    saveBrandKit
} from './brandKit';

describe('Brand Kit service', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('normalizes and persists identity settings locally', () => {
        saveBrandKit({
            name: 'North Star',
            colors: [{ name: 'Primary', value: ' #123456 ' }],
            requiredWords: ['clarity', 'clarity'],
            logoAssetIds: ['asset_logo']
        });

        expect(getBrandKit()).toMatchObject({
            name: 'North Star',
            colors: [{ name: 'Primary', value: '#123456' }],
            requiredWords: ['clarity'],
            logoAssetIds: ['asset_logo']
        });
    });

    it('builds prompt context only from meaningful values', () => {
        const context = buildBrandContextText(normalizeBrandKit({
            name: 'North Star',
            voice: 'Direct and warm',
            prohibitedWords: ['cheap'],
            platformRules: [{ platform: 'Instagram', rules: 'Use short paragraphs.' }]
        }));

        expect(context).toContain('Brand name: North Star');
        expect(context).toContain('Brand voice: Direct and warm');
        expect(context).toContain('Prohibited words or phrases: cheap');
        expect(context).toContain('- Instagram: Use short paragraphs.');
    });

    it('returns an empty context for an empty kit', () => {
        expect(buildBrandContextText()).toBe('');
    });
});
