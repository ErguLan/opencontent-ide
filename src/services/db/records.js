/**
 * Pure record helpers shared by the access layer and the legacy migration.
 *
 * Everything here is side-effect free so it can be unit tested without
 * IndexedDB. Nothing here knows about the database; it only deals with the
 * records themselves.
 */

import { SCHEMA_VERSION } from './schema.js';

/** Parses a timestamp-ish value into milliseconds. Returns 0 when unusable. */
export const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isNaN(time) ? 0 : time;
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Freshness used to pick a winner between two records with the same id.
 * `updatedAt` wins over `createdAt`, matching the ordering already used by
 * the project list.
 */
export const recordTimestamp = (record) => {
    if (!record || typeof record !== 'object') return 0;
    return toMillis(record.updatedAt || record.createdAt);
};

/** Sorts by `updatedAt` (falling back to `createdAt`) descending. */
export const sortByUpdatedAtDesc = (items) => {
    return [...items].sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
};

/**
 * Stamps the record schema version. Existing values are preserved so a future
 * migration can tell what shape a record already had.
 */
export const normalizeRecord = (record, schemaVersion = SCHEMA_VERSION) => {
    if (!record || typeof record !== 'object') return null;
    if (!record.id) return null;

    const currentVersion = Number.isInteger(record.schemaVersion) ? record.schemaVersion : schemaVersion;
    return { ...record, schemaVersion: currentVersion };
};

export const normalizeRecords = (records, schemaVersion = SCHEMA_VERSION) => {
    return (Array.isArray(records) ? records : [])
        .map((record) => normalizeRecord(record, schemaVersion))
        .filter(Boolean);
};

/**
 * Safety net against duplicate ids. Writes always target an explicit key, so
 * duplicates should never reach the store; when they do (legacy payloads,
 * external imports) the newest record per id wins and the rest are reported.
 */
export const dedupeById = (records) => {
    const byId = new Map();
    const duplicates = [];

    (Array.isArray(records) ? records : []).forEach((record) => {
        if (!record || !record.id) return;

        const existing = byId.get(record.id);
        if (!existing) {
            byId.set(record.id, record);
            return;
        }

        duplicates.push({ id: record.id, kept: existing, discarded: record });
        if (recordTimestamp(record) >= recordTimestamp(existing)) {
            byId.set(record.id, record);
        }
    });

    return { records: Array.from(byId.values()), duplicates };
};

/**
 * Decides what happens when a record already exists in the target store.
 * Never overwrites silently: the newest timestamp wins and the conflict is
 * returned so the caller can log it.
 */
export const resolveCollision = (existing, incoming) => {
    const existingTime = recordTimestamp(existing);
    const incomingTime = recordTimestamp(incoming);

    if (incomingTime > existingTime) {
        return { winner: 'incoming', existing, incoming, existingTime, incomingTime };
    }

    return { winner: 'existing', existing, incoming, existingTime, incomingTime };
};

/**
 * Plans a merge between records already in the target store and records coming
 * from a legacy source. Pure: returns what should be written plus the list of
 * collisions found against the store.
 *
 * The incoming batch is deduplicated first, because a legacy source can hold
 * several records with the same id (`oc_local_projects` did). Only then is it
 * compared with the store, so a batch never writes the same id twice.
 */
export const planMerge = (existingRecords = [], incomingRecords = []) => {
    const existingById = new Map();
    (Array.isArray(existingRecords) ? existingRecords : []).forEach((record) => {
        if (record && record.id) existingById.set(record.id, record);
    });

    const incoming = [];
    const invalid = [];
    (Array.isArray(incomingRecords) ? incomingRecords : []).forEach((record) => {
        const normalized = normalizeRecord(record);
        if (normalized) incoming.push(normalized);
        else invalid.push(record ?? null);
    });

    const { records: uniqueIncoming, duplicates: sourceDuplicates } = dedupeById(incoming);

    const writes = [];
    const conflicts = [];

    uniqueIncoming.forEach((record) => {
        const existing = existingById.get(record.id);
        if (!existing) {
            existingById.set(record.id, record);
            writes.push(record);
            return;
        }

        const collision = resolveCollision(existing, record);
        conflicts.push({
            id: record.id,
            winner: collision.winner,
            existingTimestamp: collision.existingTime,
            incomingTimestamp: collision.incomingTime
        });

        if (collision.winner === 'incoming') {
            existingById.set(record.id, record);
            writes.push(record);
        }
    });

    return { writes, conflicts, invalid, sourceDuplicates };
};