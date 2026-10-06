/**
 * Contract tests for the `open` link builder.
 *
 * The encoding tests are written to fail if the builder ever concatenates raw
 * paths instead of encoding them: they assert the exact encoded form AND that
 * decoding the produced link returns the original string byte for byte. A
 * concatenated `docs/guía + 100%.md` would truncate at the `&`, swallow the `%`
 * and lose the accent, so both assertions break at once.
 */

import { describe, expect, it } from 'vitest';

import {
    OPEN_IN_IDE_ERROR_CODES,
    OPEN_IN_IDE_MAX_URL_LENGTH,
    OPEN_IN_IDE_POSITION_MAX,
    buildOpenInIdeUrl,
    isOpenInIdeConfigured,
    parseOpenInIdeUrl
} from './openInIde';

const SCHEME = 'testeditor';
const ok = (result) => expect(result.error).toBeUndefined();
const code = (result) => result.error;
// Read the link the way a receiving application reads it.
const queryOf = (url) => new URL(url).searchParams;

describe('openInIde link builder', () => {
    describe('optional parameters', () => {
        it('builds the bare link when nothing is requested', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME });
            ok(result);
            expect(result.url).toBe(`${SCHEME}://open?v=1`);
        });

        it('keeps only what was provided', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, project: '/home/ana/docs' });
            ok(result);
            expect(result.url).toBe(`${SCHEME}://open?v=1&project=%2Fhome%2Fana%2Fdocs`);
            expect(result.params).toEqual({ version: '1', project: '/home/ana/docs' });
        });

        it('accepts every documented parameter together', () => {
            const result = buildOpenInIdeUrl({
                scheme: SCHEME,
                project: '/home/ana/docs',
                file: 'notes/a.md',
                line: 35,
                column: 4,
                panel: 'terminal'
            });
            ok(result);
            expect(result.params).toEqual({
                version: '1',
                project: '/home/ana/docs',
                file: 'notes/a.md',
                line: 35,
                column: 4,
                panel: 'terminal'
            });
        });

        it('drops an empty line or column instead of sending a blank value', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, file: 'notes/a.md', line: '', column: null });
            ok(result);
            expect(result.url).toBe(`${SCHEME}://open?v=1&file=notes%2Fa.md`);
            expect(result.params.line).toBeUndefined();
            expect(result.params.column).toBeUndefined();
        });

        it('accepts a column without a line', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, file: 'notes/a.md', column: 7 });
            ok(result);
            expect(result.params).toEqual({ version: '1', file: 'notes/a.md', column: 7 });
        });

        it('accepts an absolute file with no project', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, file: '/home/ana/docs/notes/a.md' });
            ok(result);
            expect(result.params.file).toBe('/home/ana/docs/notes/a.md');
        });

        it('accepts a Windows project path', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, project: 'C:\\Users\\Ana\\Proyecto' });
            ok(result);
            expect(result.params.project).toBe('C:\\Users\\Ana\\Proyecto');
        });
    });

    describe('encoding', () => {
        const tricky = 'docs/guía + 100%.md';

        it('percent-encodes spaces, accents, plus signs and percent signs', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, project: '/tmp/ana', file: tricky });
            ok(result);
            expect(result.url).toContain('file=docs%2Fgu%C3%ADa+%2B+100%25.md');
            expect(result.url).not.toContain('guía');
            expect(result.url).not.toContain(' 100%');
        });

        it('decodes back to the exact original value', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, project: '/tmp/ana', file: tricky });
            ok(result);
            expect(queryOf(result.url).get('file')).toBe(tricky);
            expect(parseOpenInIdeUrl(result.url).params.file).toBe(tricky);
        });

        it('keeps a hash, an ampersand and an equals sign inside one value', () => {
            const hostile = 'a#b&c=d.md';
            const result = buildOpenInIdeUrl({ scheme: SCHEME, file: hostile });
            ok(result);
            expect(result.url).toContain('file=a%23b%26c%3Dd.md');
            expect(queryOf(result.url).get('file')).toBe(hostile);
            expect(queryOf(result.url).get('file')).not.toBe('b');
        });

        it('does not let a value inject a new parameter', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, file: 'x.md?panel=terminal' });
            ok(result);
            expect(queryOf(result.url).get('panel')).toBeNull();
            expect(queryOf(result.url).get('file')).toBe('x.md?panel=terminal');
        });

        it('encodes a folder name with an ampersand', () => {
            const result = buildOpenInIdeUrl({ scheme: SCHEME, project: '/home/ana/R&D/docs' });
            ok(result);
            expect(queryOf(result.url).get('project')).toBe('/home/ana/R&D/docs');
        });
    });

    describe('rejected inputs', () => {
        it('rejects an unknown parameter', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, nope: '1' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.UNKNOWN_PARAMETER);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, params: { unknown: '1' } })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.UNKNOWN_PARAMETER);
        });

        it('rejects a duplicated parameter', () => {
            const result = buildOpenInIdeUrl({
                scheme: SCHEME,
                params: [['file', 'a.md'], ['file', 'b.md']]
            });
            expect(code(result)).toBe(OPEN_IN_IDE_ERROR_CODES.DUPLICATE_PARAMETER);
            expect(result.parameter).toBe('file');
        });

        it('rejects a duplicated parameter found in an incoming link', () => {
            expect(code(parseOpenInIdeUrl(`${SCHEME}://open?v=1&file=a.md&file=b.md`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.DUPLICATE_PARAMETER);
        });

        it('rejects an unknown parameter found in an incoming link', () => {
            expect(code(parseOpenInIdeUrl(`${SCHEME}://open?v=1&path=/tmp`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.UNKNOWN_PARAMETER);
        });

        it('rejects an action other than open', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, action: 'close' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.UNSUPPORTED_ACTION);
            expect(code(parseOpenInIdeUrl(`${SCHEME}://close?v=1`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.UNSUPPORTED_ACTION);
        });

        it('rejects a contract version other than 1', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, params: { v: '2' } })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_VERSION);
            expect(code(parseOpenInIdeUrl(`${SCHEME}://open?v=2`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_VERSION);
        });

        it('rejects invalid percent encoding', () => {
            expect(code(parseOpenInIdeUrl(`${SCHEME}://open?v=1&file=a%zz.md`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file: 'a\ufffd.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING);
        });

        it('rejects a control character inside a path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file: 'a\nb.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING);
        });

        it('rejects an https URL used as a path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file: 'https://example.com/a.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: 'https://example.com' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
        });

        it('rejects a file URL used as a path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file: 'file:///home/ana/a.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: 'file:///home/ana' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
        });

        it('rejects a UNC share', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '\\\\server\\share' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '//server/share' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
        });

        it('rejects the browser fake path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file: 'C:\\fakepath\\a.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '/tmp/fakepath' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_INVALID);
        });

        it('rejects a relative project path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: 'docs' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_NOT_ABSOLUTE);
        });

        it('rejects a relative file that escapes the project', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '/home/ana/docs', file: '../secret/a.md' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_OUTSIDE_PROJECT);
        });

        it('rejects an empty path', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '   ' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PATH_EMPTY);
        });
    });

    describe('position range', () => {
        const file = 'notes/a.md';

        it('accepts the documented bounds', () => {
            ok(buildOpenInIdeUrl({ scheme: SCHEME, file, line: 1, column: 1 }));
            ok(buildOpenInIdeUrl({ scheme: SCHEME, file, line: OPEN_IN_IDE_POSITION_MAX }));
        });

        it('rejects zero', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, line: 0 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_OUT_OF_RANGE);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, column: 0 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_OUT_OF_RANGE);
        });

        it('rejects a value above the maximum', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, line: OPEN_IN_IDE_POSITION_MAX + 1 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_OUT_OF_RANGE);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, column: OPEN_IN_IDE_POSITION_MAX + 1 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_OUT_OF_RANGE);
        });

        it('rejects a value that is not an integer', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, line: '3.5' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, line: 'abc' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, file, column: '1e3' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_INVALID);
        });

        it('rejects a position without a file', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, line: 3 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_REQUIRES_FILE);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, column: 3 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_REQUIRES_FILE);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, project: '/tmp/ana', line: 3 })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.POSITION_REQUIRES_FILE);
        });
    });

    describe('panel', () => {
        it('accepts the four documented panels', () => {
            for (const panel of ['editor', 'explorer', 'terminal', 'settings']) {
                ok(buildOpenInIdeUrl({ scheme: SCHEME, panel }));
            }
        });

        it('rejects any other panel', () => {
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, panel: 'preview' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PANEL_UNKNOWN);
            expect(code(buildOpenInIdeUrl({ scheme: SCHEME, panel: 'EDITOR' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PANEL_UNKNOWN);
            expect(code(parseOpenInIdeUrl(`${SCHEME}://open?v=1&panel=deploy`)))
                .toBe(OPEN_IN_IDE_ERROR_CODES.PANEL_UNKNOWN);
        });
    });

    describe('length limit', () => {
        it('accepts a link at the limit and rejects one past it', () => {
            const room = OPEN_IN_IDE_MAX_URL_LENGTH - `${SCHEME}://open?v=1&file=`.length;
            const atLimit = buildOpenInIdeUrl({ scheme: SCHEME, file: 'a'.repeat(room) });
            ok(atLimit);
            expect(atLimit.url).toHaveLength(OPEN_IN_IDE_MAX_URL_LENGTH);

            const tooLong = buildOpenInIdeUrl({ scheme: SCHEME, file: 'a'.repeat(room + 1) });
            expect(code(tooLong)).toBe(OPEN_IN_IDE_ERROR_CODES.URL_TOO_LONG);
        });

        it('rejects an oversized incoming link', () => {
            const huge = `${SCHEME}://open?v=1&file=${'a'.repeat(OPEN_IN_IDE_MAX_URL_LENGTH)}`;
            expect(code(parseOpenInIdeUrl(huge))).toBe(OPEN_IN_IDE_ERROR_CODES.URL_TOO_LONG);
        });
    });

    describe('scheme', () => {
        it('requires a scheme', () => {
            expect(code(buildOpenInIdeUrl({}))).toBe(OPEN_IN_IDE_ERROR_CODES.SCHEME_REQUIRED);
            expect(code(buildOpenInIdeUrl({ scheme: '   ' }))).toBe(OPEN_IN_IDE_ERROR_CODES.SCHEME_REQUIRED);
        });

        it('rejects a scheme that is not a URL scheme', () => {
            expect(code(buildOpenInIdeUrl({ scheme: 'not a scheme' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.SCHEME_INVALID);
            expect(code(buildOpenInIdeUrl({ scheme: '1editor' })))
                .toBe(OPEN_IN_IDE_ERROR_CODES.SCHEME_INVALID);
        });

        it('rejects a string that is not a link at all', () => {
            expect(code(parseOpenInIdeUrl('opencontent-export.json')))
                .toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_URL);
            expect(code(parseOpenInIdeUrl(''))).toBe(OPEN_IN_IDE_ERROR_CODES.INVALID_URL);
        });
    });

    describe('self verification', () => {
        it('returns a link its own parser accepts', () => {
            const built = buildOpenInIdeUrl({
                scheme: SCHEME,
                project: '/home/ana/R&D',
                file: 'docs/guía + 100%.md',
                line: 12,
                column: 3,
                panel: 'editor'
            });
            ok(built);
            const parsed = parseOpenInIdeUrl(built.url);
            expect(code(parsed)).toBeUndefined();
            expect(parsed.params).toEqual(built.params);
        });
    });
});

describe('isOpenInIdeConfigured', () => {
    it('is configured only when both the scheme and the visible name exist', () => {
        expect(isOpenInIdeConfigured({ scheme: 'a', appName: 'App' })).toBe(true);
        expect(isOpenInIdeConfigured({ scheme: 'a', appName: '' })).toBe(false);
        expect(isOpenInIdeConfigured({ scheme: '', appName: 'App' })).toBe(false);
        expect(isOpenInIdeConfigured(undefined)).toBe(false);
    });
});