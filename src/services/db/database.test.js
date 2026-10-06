import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeIndexedDb, seedLegacyDatabase } from '../../test/fakeIndexedDb';
import {
    ARTIFACTS_STORE,
    DB_NAME,
    DB_VERSION,
    MEDIA_STORE,
    PROJECTS_STORE,
    SCHEMA_VERSION,
    STORE_DEFINITIONS,
    STORE_NAMES,
    applySchema
} from './schema.js';
import { DatabaseUnavailableError, closeConnection, getConnection, tryGetConnection } from './connection.js';
import { UnknownStoreError, count, db, deleteRecord, get, getAll, getAllKeys, getAllByIndex, put, withTransaction } from './access.js';
import {
    dedupeById,
    normalizeRecord,
    normalizeRecords,
    planMerge,
    recordTimestamp,
    resolveCollision,
    sortByUpdatedAtDesc,
    toMillis
} from './records.js';
import {
    LEGACY_SOURCES,
    listDatabaseNames,
    migrateLegacyDatabase,
    readLegacyRecords,
    resetMigrationState,
    runLegacyMigration
} from './migration.js';
import { deleteLocalProject, getLocalProject, getLocalProjects, saveLocalProject } from '../projectsLocal.js';
import { deleteArtifact, getArtifact, listArtifacts, saveArtifact } from '../artifacts/artifactEngine.js';
import { countMedia, deleteMedia, fileToBase64, getAllMedia, getMedia, updateMediaMetadata } from '../mediaService.js';

const ARTIFACT_INDEXES = ['type', 'projectId', 'updatedAt'];

const originalIndexedDB = globalThis.indexedDB;

const useFake = (options) => {
    const fake = createFakeIndexedDb(options);
    globalThis.indexedDB = fake;
    return fake;
};

const seedProjects = (fake, records) => seedLegacyDatabase(fake, 'OpenContentProjectsDB', PROJECTS_STORE, records);
const seedMedia = (fake, records) => seedLegacyDatabase(fake, 'OpenContentMediaDB', MEDIA_STORE, records);
const seedArtifacts = (fake, records) => seedLegacyDatabase(fake, 'OpenContentArtifactsDB', ARTIFACTS_STORE, records, ARTIFACT_INDEXES);

beforeEach(async () => {
    await closeConnection();
    resetMigrationState();
});

afterEach(async () => {
    await closeConnection();
    resetMigrationState();
    if (originalIndexedDB === undefined) {
        delete globalThis.indexedDB;
    } else {
        globalThis.indexedDB = originalIndexedDB;
    }
    vi.restoreAllMocks();
});

describe('db schema', () => {
    it('describes a single database holding the three domain stores', () => {
        expect(DB_NAME).toBe('OpenContentDB');
        expect(DB_VERSION).toBe(1);
        expect(SCHEMA_VERSION).toBe(1);
        expect(STORE_NAMES).toEqual([PROJECTS_STORE, MEDIA_STORE, ARTIFACTS_STORE]);
        expect(STORE_DEFINITIONS[PROJECTS_STORE].keyPath).toBe('id');
        expect(STORE_DEFINITIONS[MEDIA_STORE].keyPath).toBe('id');
        expect(STORE_DEFINITIONS[ARTIFACTS_STORE].keyPath).toBe('id');
    });

    it('keeps the artifact indexes that already existed', () => {
        const indexes = STORE_DEFINITIONS[ARTIFACTS_STORE].indexes;
        expect(indexes.map((index) => index.name)).toEqual(ARTIFACT_INDEXES);
        expect(indexes.map((index) => index.keyPath)).toEqual(ARTIFACT_INDEXES);
        indexes.forEach((index) => expect(index.options.unique).toBe(false));
    });

    it('creates every store and index on a fresh connection', () => {
        const created = [];
        const stubDb = {
            transaction: {
                objectStore: () => ({
                    indexNames: { contains: () => false },
                    createIndex: (indexName) => created.push({ store: 'existing', indexName })
                })
            },
            objectStoreNames: { contains: () => false },
            createObjectStore: (storeName, options) => {
                created.push({ store: storeName, keyPath: options.keyPath });
                return {
                    indexNames: { contains: () => false },
                    createIndex: (indexName) => created.push({ store: storeName, indexName })
                };
            }
        };

        applySchema(stubDb);

        const storeNames = created.filter((entry) => entry.keyPath).map((entry) => entry.store);
        expect(storeNames).toEqual([PROJECTS_STORE, MEDIA_STORE, ARTIFACTS_STORE]);
        created.filter((entry) => entry.keyPath).forEach((entry) => expect(entry.keyPath).toBe('id'));
        expect(created.filter((entry) => entry.indexName).map((entry) => entry.indexName)).toEqual(ARTIFACT_INDEXES);
    });

    it('reuses existing stores and indexes instead of recreating them', () => {
        const created = [];
        const existingStore = {
            indexNames: { contains: (name) => name === 'type' },
            createIndex: (indexName) => created.push(indexName)
        };
        const stubDb = {
            transaction: { objectStore: () => existingStore },
            objectStoreNames: { contains: () => true },
            createObjectStore: () => { throw new Error('should not create a store'); }
        };

        applySchema(stubDb);

        expect(created).toEqual(['projectId', 'updatedAt']);
    });
});

describe('db record helpers', () => {
    it('parses timestamps defensively', () => {
        expect(toMillis(undefined)).toBe(0);
        expect(toMillis('')).toBe(0);
        expect(toMillis('not-a-date')).toBe(0);
        expect(toMillis('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
        expect(toMillis(1700000000000)).toBe(1700000000000);
        expect(recordTimestamp({ createdAt: '2026-01-01T00:00:00.000Z' })).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
        expect(recordTimestamp({})).toBe(0);
        expect(recordTimestamp(null)).toBe(0);
    });

    it('sorts by updatedAt descending and falls back to createdAt', () => {
        const items = [
            { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'b', createdAt: '2026-03-01T00:00:00.000Z' },
            { id: 'c', updatedAt: '2026-02-01T00:00:00.000Z' }
        ];
        expect(sortByUpdatedAtDesc(items).map((item) => item.id)).toEqual(['b', 'c', 'a']);
    });

    it('stamps the schema version without overwriting an existing one', () => {
        expect(normalizeRecord({ id: 'x' })).toEqual({ id: 'x', schemaVersion: 1 });
        expect(normalizeRecord({ id: 'x', schemaVersion: 7 })).toEqual({ id: 'x', schemaVersion: 7 });
        expect(normalizeRecord({ name: 'no id' })).toBeNull();
        expect(normalizeRecord(null)).toBeNull();
        expect(normalizeRecords([{ id: 'a' }, { nope: true }, null])).toEqual([{ id: 'a', schemaVersion: 1 }]);
    });

    it('deduplicates by id keeping the newest record and reporting the loser', () => {
        const older = { id: 'p1', updatedAt: '2026-01-01T00:00:00.000Z', name: 'older' };
        const newer = { id: 'p1', updatedAt: '2026-05-01T00:00:00.000Z', name: 'newer' };
        const other = { id: 'p2', updatedAt: '2026-02-01T00:00:00.000Z' };

        const { records, duplicates } = dedupeById([older, newer, other]);

        expect(records).toHaveLength(2);
        expect(records.find((item) => item.id === 'p1').name).toBe('newer');
        expect(duplicates).toHaveLength(1);
        expect(duplicates[0].id).toBe('p1');
    });

    it('keeps the record on a tie so the result is stable', () => {
        const first = { id: 'p1', name: 'first', updatedAt: '2026-01-01T00:00:00.000Z' };
        const second = { id: 'p1', name: 'second', updatedAt: '2026-01-01T00:00:00.000Z' };

        const { records } = dedupeById([first, second]);

        expect(records).toHaveLength(1);
        expect(records[0].name).toBe('second');
        expect(resolveCollision(first, second).winner).toBe('existing');
    });

    it('resolves collisions by timestamp, newest wins', () => {
        const existing = { id: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' };
        expect(resolveCollision(existing, { id: 'p1', updatedAt: '2025-01-01T00:00:00.000Z' }).winner).toBe('existing');
        expect(resolveCollision(existing, { id: 'p1', updatedAt: '2027-01-01T00:00:00.000Z' }).winner).toBe('incoming');
    });
});

describe('db merge planning', () => {
    const legacyProject = { id: 'p1', name: 'legacy', updatedAt: '2026-01-01T00:00:00.000Z' };

    it('writes every record when the target is empty', () => {
        const plan = planMerge([], [legacyProject]);
        expect(plan.writes).toEqual([{ ...legacyProject, schemaVersion: 1 }]);
        expect(plan.conflicts).toHaveLength(0);
        expect(plan.invalid).toHaveLength(0);
    });

    it('is idempotent: replanning after a merge produces no writes', () => {
        const first = planMerge([], [legacyProject]);
        const second = planMerge(first.writes, [legacyProject]);

        expect(first.writes).toHaveLength(1);
        expect(second.writes).toHaveLength(0);
        expect(second.conflicts).toEqual([{
            id: 'p1',
            winner: 'existing',
            existingTimestamp: Date.parse('2026-01-01T00:00:00.000Z'),
            incomingTimestamp: Date.parse('2026-01-01T00:00:00.000Z')
        }]);
    });

    it('never overwrites a newer existing record', () => {
        const existing = { id: 'p1', name: 'current', updatedAt: '2026-06-01T00:00:00.000Z', schemaVersion: 1 };
        const plan = planMerge([existing], [legacyProject]);

        expect(plan.writes).toHaveLength(0);
        expect(plan.conflicts[0].winner).toBe('existing');
    });

    it('overwrites an older existing record and reports the conflict', () => {
        const existing = { id: 'p1', name: 'stale', updatedAt: '2025-01-01T00:00:00.000Z', schemaVersion: 1 };
        const plan = planMerge([existing], [legacyProject]);

        expect(plan.writes).toEqual([{ ...legacyProject, schemaVersion: 1 }]);
        expect(plan.conflicts[0].winner).toBe('incoming');
    });

    it('reports records without a usable id instead of dropping them silently', () => {
        const plan = planMerge([], [{ name: 'broken' }, null]);
        expect(plan.writes).toHaveLength(0);
        expect(plan.invalid).toHaveLength(2);
    });

    it('collapses duplicated ids inside a single source before writing', () => {
        const plan = planMerge([], [
            { id: 'p1', name: 'older', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'p1', name: 'newer', updatedAt: '2026-02-01T00:00:00.000Z' }
        ]);

        expect(plan.writes).toHaveLength(1);
        expect(plan.writes[0].name).toBe('newer');
        expect(plan.sourceDuplicates).toHaveLength(1);
        expect(plan.conflicts).toHaveLength(0);
    });

    it('preserves the order of the incoming records', () => {
        const plan = planMerge([], [{ id: 'b' }, { id: 'a' }]);
        expect(plan.writes.map((record) => record.id)).toEqual(['b', 'a']);
    });
});

describe('db degradation without IndexedDB', () => {
    it('rejects with a clear, actionable error', async () => {
        delete globalThis.indexedDB;

        await expect(getConnection()).rejects.toBeInstanceOf(DatabaseUnavailableError);
        await expect(getConnection()).rejects.toThrow(/private\/incognito mode, blocked site data/i);
        expect(await tryGetConnection()).toBeNull();
    });

    it('reports the migration as unavailable instead of throwing', async () => {
        delete globalThis.indexedDB;

        const report = await runLegacyMigration();

        expect(report.status).toBe('unavailable');
        expect(report.database).toBe(DB_NAME);
        expect(report.sources).toEqual([]);
    });

    it('rejects unknown store names before touching IndexedDB', async () => {
        useFake();
        await expect(get('does-not-exist', 'x')).rejects.toBeInstanceOf(UnknownStoreError);
        await expect(getAll('does-not-exist')).rejects.toThrow(/Unknown object store/);
    });
});

describe('db connection', () => {
    it('caches one connection and reuses it across calls', async () => {
        const fake = useFake();
        const first = await getConnection();
        const second = await getConnection();

        expect(second).toBe(first);
        const databases = await fake.databases();
        expect(databases.filter((entry) => entry.name === DB_NAME)).toHaveLength(1);
    });

    it('closes itself on versionchange and reopens on the next call', async () => {
        useFake();
        const first = await getConnection();
        const onclose = vi.fn();
        first.onclose = onclose;

        first.onversionchange();

        const second = await getConnection();
        expect(second).not.toBe(first);
        expect(onclose).toHaveBeenCalled();
    });
});

describe('db access layer', () => {
    it('creates every store on the unified database', async () => {
        const fake = useFake();
        await getConnection();

        expect(fake.databaseNames()).toEqual([DB_NAME]);
        const dbApi = await getConnection();
        expect([...['projects', 'user-assets', 'artifacts']]).toEqual(STORE_NAMES);
        expect(dbApi.objectStoreNames.contains(PROJECTS_STORE)).toBe(true);
        expect(dbApi.objectStoreNames.contains(MEDIA_STORE)).toBe(true);
        expect(dbApi.objectStoreNames.contains(ARTIFACTS_STORE)).toBe(true);
    });

    it('round-trips records, stamping the schema version', async () => {
        useFake();

        const saved = await put(PROJECTS_STORE, { id: 'p1', name: 'first', updatedAt: '2026-01-01T00:00:00.000Z' });

        expect(saved.schemaVersion).toBe(1);
        expect(await get(PROJECTS_STORE, 'p1')).toMatchObject({ id: 'p1', schemaVersion: 1 });
        expect(await count(PROJECTS_STORE)).toBe(1);
    });

    it('reads keys without loading every record', async () => {
        useFake();
        await put(PROJECTS_STORE, { id: 'p1' });
        await put(PROJECTS_STORE, { id: 'p2' });

        expect((await getAllKeys(PROJECTS_STORE)).sort()).toEqual(['p1', 'p2']);
        expect(await getAllKeys(MEDIA_STORE)).toEqual([]);
    });

    it('reads by index, deletes and counts', async () => {
        useFake();
        await put(ARTIFACTS_STORE, { id: 'a1', type: 'diagram', projectId: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' });
        await put(ARTIFACTS_STORE, { id: 'a2', type: 'document', projectId: 'p1', updatedAt: '2026-01-02T00:00:00.000Z' });
        await put(ARTIFACTS_STORE, { id: 'a3', type: 'diagram', projectId: 'p2', updatedAt: '2026-01-03T00:00:00.000Z' });

        expect((await getAllByIndex(ARTIFACTS_STORE, 'type', 'diagram')).map((item) => item.id)).toEqual(['a1', 'a3']);
        expect((await getAllByIndex(ARTIFACTS_STORE, 'projectId', 'p1')).map((item) => item.id)).toEqual(['a1', 'a2']);
        expect((await getAllByIndex(ARTIFACTS_STORE, 'updatedAt', '2026-01-03T00:00:00.000Z')).map((item) => item.id)).toEqual(['a3']);

        await put(MEDIA_STORE, { id: 'm1' });
        expect(await count(MEDIA_STORE)).toBe(1);
        expect(await deleteRecord(MEDIA_STORE, 'm1')).toBe(true);
        expect(await count(MEDIA_STORE)).toBe(0);
    });

    it('reads and writes across domains inside a single transaction', async () => {
        useFake();
        await put(PROJECTS_STORE, { id: 'p1', name: 'project' });
        await put(ARTIFACTS_STORE, { id: 'a1', type: 'diagram', projectId: 'p1' });

        const projectName = await withTransaction([PROJECTS_STORE, ARTIFACTS_STORE], 'readwrite', async (stores) => {
            const project = await new Promise((resolve, reject) => {
                const request = stores[PROJECTS_STORE].get('p1');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            await new Promise((resolve, reject) => {
                const request = stores[ARTIFACTS_STORE].delete('a1');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            return project.name;
        });

        expect(projectName).toBe('project');
        expect(await getAll(ARTIFACTS_STORE)).toEqual([]);
        expect(await count(PROJECTS_STORE)).toBe(1);
    });

    it('aborts and rolls back when the transaction body throws', async () => {
        useFake();
        await put(PROJECTS_STORE, { id: 'p1', name: 'project' });

        await expect(withTransaction(PROJECTS_STORE, 'readwrite', async (stores) => {
            await new Promise((resolve, reject) => {
                const request = stores[PROJECTS_STORE].delete('p1');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            throw new Error('boom');
        })).rejects.toThrow('boom');

        expect(await count(PROJECTS_STORE)).toBe(1);
    });

    it('exposes the same helpers on the default export', () => {
        expect(typeof db.put).toBe('function');
        expect(typeof db.getAllByIndex).toBe('function');
        expect(typeof db.withTransaction).toBe('function');
        expect(db.delete).toBe(deleteRecord);
    });
});

describe('db legacy migration', () => {
    it('describes the three legacy databases and their target stores', () => {
        expect(LEGACY_SOURCES.map((source) => source.name)).toEqual([
            'OpenContentProjectsDB',
            'OpenContentMediaDB',
            'OpenContentArtifactsDB'
        ]);
        expect(LEGACY_SOURCES.map((source) => source.target)).toEqual([PROJECTS_STORE, MEDIA_STORE, ARTIFACTS_STORE]);
    });

    it('lists database names when the browser supports it', async () => {
        const fake = useFake();
        await seedProjects(fake, [{ id: 'p1' }]);

        const names = await listDatabaseNames();
        expect(names.has('OpenContentProjectsDB')).toBe(true);
    });

    it('reads legacy records without leaving empty databases behind', async () => {
        const fake = useFake();

        expect(await readLegacyRecords('OpenContentMediaDB', MEDIA_STORE, null)).toEqual({ found: false });
        expect(fake.databaseNames()).toEqual([]);

        await seedMedia(fake, [{ id: 'm1' }]);
        const found = await readLegacyRecords('OpenContentMediaDB', MEDIA_STORE, null);
        expect(found.found).toBe(true);
        expect(found.records).toHaveLength(1);
    });

    it('copies every record and only then deletes the legacy database', async () => {
        const fake = useFake();
        await seedProjects(fake, [
            { id: 'p1', name: 'one', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'p2', name: 'two', updatedAt: '2026-01-02T00:00:00.000Z' }
        ]);

        const report = await migrateLegacyDatabase(LEGACY_SOURCES[0], await listDatabaseNames());

        expect(report).toMatchObject({ status: 'migrated', migrated: 2, legacyDeleted: true });
        expect(fake.databaseNames()).toEqual([DB_NAME]);
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE).map((record) => record.id).sort()).toEqual(['p1', 'p2']);
    });

    it('migrates media and artifacts including their indexes', async () => {
        const fake = useFake();
        await seedMedia(fake, [{ id: 'm1', name: 'asset' }]);
        await seedArtifacts(fake, [{ id: 'a1', type: 'diagram', projectId: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' }]);

        const report = await runLegacyMigration();

        expect(report.migrated).toBe(2);
        expect(fake.recordsOf(DB_NAME, MEDIA_STORE)).toHaveLength(1);
        expect((await getAllByIndex(ARTIFACTS_STORE, 'type', 'diagram')).map((item) => item.id)).toEqual(['a1']);
    });

    it('is idempotent: a second run copies nothing and creates no duplicates', async () => {
        const fake = useFake();
        await seedMedia(fake, [{ id: 'm1', name: 'asset' }]);

        const first = await runLegacyMigration();
        const second = await runLegacyMigration({ force: true });

        expect(first.migrated).toBe(1);
        expect(second.migrated).toBe(0);
        expect(second.sources.every((source) => source.migrated === 0)).toBe(true);
        expect(fake.recordsOf(DB_NAME, MEDIA_STORE)).toHaveLength(1);
    });

    it('migrates the newest copy when a legacy database was written twice for one id', async () => {
        const fake = useFake();
        await seedProjects(fake, [
            { id: 'p1', name: 'older', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'p1', name: 'newer', updatedAt: '2026-02-01T00:00:00.000Z' }
        ]);

        const report = await migrateLegacyDatabase(LEGACY_SOURCES[0], await listDatabaseNames());

        // The legacy store has keyPath `id`, so only the last write survives
        // there and the migration cannot reintroduce the duplicate.
        expect(report.migrated).toBe(1);
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)[0].name).toBe('newer');
    });

    it('shares a single run between concurrent callers', async () => {
        const fake = useFake();
        await seedMedia(fake, [{ id: 'm1' }]);

        const [a, b] = await Promise.all([runLegacyMigration(), runLegacyMigration()]);

        expect(a).toBe(b);
        expect(fake.recordsOf(DB_NAME, MEDIA_STORE)).toHaveLength(1);
    });

    it('keeps the newest record on an id collision and reports the conflict', async () => {
        const fake = useFake();
        await seedArtifacts(fake, [
            { id: 'a1', type: 'diagram', name: 'legacy', updatedAt: '2026-01-01T00:00:00.000Z' }
        ]);
        await put(ARTIFACTS_STORE, { id: 'a1', type: 'diagram', name: 'current', updatedAt: '2026-08-01T00:00:00.000Z' });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const report = await migrateLegacyDatabase(LEGACY_SOURCES[2], await listDatabaseNames());

        expect(report.conflicts).toEqual([{
            id: 'a1',
            winner: 'existing',
            existingTimestamp: Date.parse('2026-08-01T00:00:00.000Z'),
            incomingTimestamp: Date.parse('2026-01-01T00:00:00.000Z')
        }]);
        expect(report.migrated).toBe(0);
        expect(fake.recordsOf(DB_NAME, ARTIFACTS_STORE)[0].name).toBe('current');
    });

    it('imports a legacy record that is newer than the stored one', async () => {
        const fake = useFake();
        await seedProjects(fake, [{ id: 'p1', name: 'legacy', updatedAt: '2026-09-01T00:00:00.000Z' }]);
        await put(PROJECTS_STORE, { id: 'p1', name: 'stale', updatedAt: '2026-01-01T00:00:00.000Z' });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const report = await migrateLegacyDatabase(LEGACY_SOURCES[0], await listDatabaseNames());

        expect(report.migrated).toBe(1);
        expect(report.conflicts[0].winner).toBe('incoming');
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)[0].name).toBe('legacy');
    });

    it('keeps the legacy database intact when the copy fails, then succeeds on retry', async () => {
        const broken = useFake({ failPuts: [{ database: DB_NAME, store: PROJECTS_STORE }] });
        await seedProjects(broken, [{ id: 'p1', name: 'one', updatedAt: '2026-01-01T00:00:00.000Z' }]);
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const failed = await migrateLegacyDatabase(LEGACY_SOURCES[0], null);

        expect(failed.status).toBe('failed');
        expect(failed.legacyDeleted).toBe(false);
        expect(broken.databaseNames()).toContain('OpenContentProjectsDB');
        expect(broken.recordsOf('OpenContentProjectsDB', PROJECTS_STORE)).toHaveLength(1);
        expect(broken.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(0);

        const healthy = useFake();
        await seedProjects(healthy, [{ id: 'p1', name: 'one', updatedAt: '2026-01-01T00:00:00.000Z' }]);
        await closeConnection();

        const recovered = await migrateLegacyDatabase(LEGACY_SOURCES[0], null);

        expect(recovered).toMatchObject({ status: 'migrated', migrated: 1, legacyDeleted: true });
        expect(healthy.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);
        expect(healthy.databaseNames()).toEqual([DB_NAME]);
    });

    it('retries on the next call after a run that threw', async () => {
        const fake = useFake();
        await seedProjects(fake, [{ id: 'p1', name: 'one', updatedAt: '2026-01-01T00:00:00.000Z' }]);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = new Error('transient failure');
        const spy = vi.spyOn(fake, 'deleteDatabase').mockImplementationOnce(() => {
            throw error;
        });

        await expect(runLegacyMigration()).rejects.toThrow('transient failure');
        expect(spy).toHaveBeenCalled();
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);

        await expect(runLegacyMigration()).resolves.toMatchObject({ status: 'completed' });
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);
    });

    it('preserves the legacy oc_local_projects import', async () => {        const fake = useFake();
        localStorage.setItem('oc_local_projects', JSON.stringify([
            { id: 'p1', name: 'from localStorage', updatedAt: '2026-01-01T00:00:00.000Z' },
            { id: 'p1', name: 'newer duplicate', updatedAt: '2026-02-01T00:00:00.000Z' }
        ]));

        const report = await runLegacyMigration();

        expect(report.localStorage.status).toBe('migrated');
        expect(report.localStorage.migrated).toBe(1);
        expect(localStorage.getItem('oc_local_projects')).toBeNull();
        const stored = fake.recordsOf(DB_NAME, PROJECTS_STORE);
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('newer duplicate');
    });

    it('skips the localStorage import when the projects store already has data', async () => {
        useFake();
        await put(PROJECTS_STORE, { id: 'existing' });
        localStorage.setItem('oc_local_projects', JSON.stringify([{ id: 'legacy' }]));

        const report = await runLegacyMigration();

        expect(report.localStorage.status).toBe('skipped');
        expect(localStorage.getItem('oc_local_projects')).not.toBeNull();
    });

    it('migrates a legacy database on the first service call, without an explicit run', async () => {
        const fake = useFake();
        await seedProjects(fake, [{ id: 'legacy-1', name: 'legacy project', updatedAt: '2026-01-01T00:00:00.000Z' }]);

        const projects = await getLocalProjects();

        expect(projects.map((project) => project.id)).toEqual(['legacy-1']);
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)[0].schemaVersion).toBe(1);
        expect(fake.databaseNames()).toEqual([DB_NAME]);
    });
});

/**
 * The services must keep behaving exactly as before the unification, because
 * the rest of the app depends on those signatures and return values.
 */
describe('service contracts after unification', () => {
    it('projectsLocal: creates, merges, updates and deletes', async () => {
        useFake();

        const created = await saveLocalProject({ name: 'First', prompt: 'hello', type: 'content' });
        expect(created.id).toMatch(/^local_\d+_[a-z0-9]+$/);
        expect(created.createdAt).toBeTruthy();
        expect(created.updatedAt).toBeTruthy();

        const updated = await saveLocalProject({ id: created.id, result: 'generated' });
        expect(updated.id).toBe(created.id);
        expect(updated.result).toBe('generated');
        expect(updated.name).toBe('First');
        expect(updated.createdAt).toBe(created.createdAt);

        expect(await getLocalProjects()).toHaveLength(1);
        expect(await getLocalProject(created.id)).toMatchObject({ id: created.id, result: 'generated' });
        expect(await getLocalProject('missing')).toBeNull();
        expect(await getLocalProject()).toBeNull();

        expect(await deleteLocalProject(created.id)).toBe(true);
        expect(await getLocalProjects()).toEqual([]);
        expect(await deleteLocalProject()).toBe(false);
        expect(await saveLocalProject(null)).toBeNull();
    });

    it('projectsLocal: writes never create two records with the same id', async () => {
        const fake = useFake();

        await saveLocalProject({ id: 'p1', name: 'One' });
        await saveLocalProject({ id: 'p1', result: 'Two' });
        await saveLocalProject({ id: 'p1', result: 'Three' });

        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);
        expect((await getLocalProjects()).map((project) => project.result)).toEqual(['Three']);
    });

    it('projectsLocal: sorts by updatedAt descending', async () => {
        useFake();
        await put(PROJECTS_STORE, { id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
        await put(PROJECTS_STORE, { id: 'new', updatedAt: '2026-05-01T00:00:00.000Z' });

        expect((await getLocalProjects()).map((project) => project.id)).toEqual(['new', 'old']);
    });

    it('projectsLocal: migrates legacy databases before answering a read', async () => {
        const fake = useFake();
        await seedProjects(fake, [{ id: 'legacy', name: 'from old db', updatedAt: '2026-02-01T00:00:00.000Z' }]);

        expect((await getLocalProjects()).map((project) => project.name)).toEqual(['from old db']);
        expect(fake.recordsOf(DB_NAME, PROJECTS_STORE)).toHaveLength(1);
    });

    it('artifactEngine: saves, reads, lists and deletes artifacts', async () => {
        useFake();

        const saved = await saveArtifact({ type: 'diagram', projectId: 'p1', content: { elements: [] } });
        expect(saved.id).toMatch(/^artifact_\d+_[a-z0-9]+$/);
        expect(saved.schemaVersion).toBeUndefined();

        expect(await getArtifact(saved.id)).toMatchObject({ id: saved.id, type: 'diagram' });
        expect(await getArtifact('missing')).toBeNull();

        await saveArtifact({ type: 'document', projectId: 'p2' });
        expect((await listArtifacts()).map((artifact) => artifact.type).sort()).toEqual(['diagram', 'document']);
        expect((await listArtifacts({ type: 'diagram' })).map((artifact) => artifact.id)).toEqual([saved.id]);
        expect((await listArtifacts({ projectId: 'p2' })).map((artifact) => artifact.type)).toEqual(['document']);

        expect(await deleteArtifact(saved.id)).toBe(true);
        expect(await listArtifacts()).toHaveLength(1);
    });

    it('mediaService: counts, reads, updates metadata and deletes', async () => {
        useFake();
        await put(MEDIA_STORE, { id: 'm1', name: 'logo', role: 'logo', tags: ['brand'] });

        expect(await countMedia()).toBe(1);
        expect(await getMedia('m1')).toMatchObject({ id: 'm1', name: 'logo' });
        expect(await getMedia('missing')).toBeNull();
        expect(await getMedia()).toBeNull();

        const updated = await updateMediaMetadata('m1', { name: 'renamed' });
        expect(updated).toMatchObject({ id: 'm1', name: 'renamed', role: 'logo' });
        expect(updated.updatedAt).toBeTruthy();

        expect(await updateMediaMetadata('missing', { name: 'nope' })).toBeNull();
        expect(await deleteMedia('m1')).toBe(true);
        expect(await countMedia()).toBe(0);
    });

    it('mediaService: fileToBase64 still converts a Blob', async () => {
        const encoded = await fileToBase64(new Blob(['hello'], { type: 'text/plain' }));
        expect(encoded).toContain('data:text/plain');
    });

    it('every service fails with a clear error when IndexedDB is unavailable', async () => {
        delete globalThis.indexedDB;

        await expect(getLocalProjects()).rejects.toThrow(/IndexedDB is not available/i);
        await expect(getLocalProject('p1')).rejects.toThrow(/IndexedDB is not available/i);
        await expect(saveLocalProject({ id: 'p1' })).rejects.toThrow(/IndexedDB is not available/i);
        await expect(deleteLocalProject('p1')).rejects.toThrow(/IndexedDB is not available/i);
        await expect(listArtifacts()).rejects.toThrow(/IndexedDB is not available/i);
        await expect(getArtifact('a1')).rejects.toThrow(/IndexedDB is not available/i);
        await expect(saveArtifact({ type: 'text' })).rejects.toThrow(/IndexedDB is not available/i);
        await expect(deleteArtifact('a1')).rejects.toThrow(/IndexedDB is not available/i);
        await expect(getAllMedia()).rejects.toThrow(/IndexedDB is not available/i);
        await expect(countMedia()).rejects.toThrow(/IndexedDB is not available/i);
        await expect(deleteMedia('m1')).rejects.toThrow(/IndexedDB is not available/i);
    });
});
