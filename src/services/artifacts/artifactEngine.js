import { ARTIFACTS_STORE } from '../db/schema.js';
import { ensureDatabaseReady } from '../db/migration.js';
import { deleteRecord, get, getAll, put } from '../db/access.js';
import { DELIVERY_OPERATION_TYPE, baseDelivery, isDeliveryState, normalizeDelivery, withDeliveryState } from '../delivery/deliveryState.js';

const STORE_NAME = ARTIFACTS_STORE;

export const ARTIFACT_TYPES = Object.freeze({ TEXT: 'text', IMAGE: 'image', DIAGRAM: 'diagram', DOCUMENT: 'document', PDF: 'pdf' });
export const OPERATION_TYPES = Object.freeze({ SET_METADATA: 'set_metadata', SET_CONTENT: 'set_content', ADD_ELEMENT: 'add_element', UPDATE_ELEMENT: 'update_element', REMOVE_ELEMENT: 'remove_element', ADD_PAGE: 'add_page', UPDATE_PAGE: 'update_page', REMOVE_PAGE: 'remove_page', REORDER_PAGES: 'reorder_pages', SET_DELIVERY_STATE: DELIVERY_OPERATION_TYPE, SET_IMAGE_CONFIG: 'set_image_config' });

// Operations that only make sense on one artifact type. Running them on
// anything else is a programming error, not a silent no-op.
const OPERATION_TYPES_BY_ARTIFACT_TYPE = Object.freeze({
    [OPERATION_TYPES.SET_IMAGE_CONFIG]: Object.freeze([ARTIFACT_TYPES.IMAGE])
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => (value == null ? value : structuredClone(value));

async function openDB() {
  await ensureDatabaseReady();
}

// Artifacts stored before the delivery model existed have no `delivery` record.
// They are read as drafts instead of failing to load, so no rewrite is needed.
function withPersistedDelivery(record) {
  return record ? { ...record, delivery: normalizeDelivery(record.delivery, { at: record.createdAt }) } : null;
}

export function createArtifact(input = {}) {
  const now = new Date().toISOString();
  const type = input.type || ARTIFACT_TYPES.DOCUMENT;
  if (!Object.values(ARTIFACT_TYPES).includes(type)) throw new Error(`Unsupported artifact type: ${type}`);
  const createdAt = input.createdAt || now;
  return { id: input.id || `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, name: input.name || `Untitled ${type}`, projectId: input.projectId || null, source: input.source || 'local', content: clone(input.content ?? null), preview: input.preview || null, metadata: clone(input.metadata || {}), references: Array.isArray(input.references) ? [...input.references] : [], prompt: input.prompt || null, model: input.model || null, delivery: normalizeDelivery(input.delivery, { at: createdAt }), versions: Array.isArray(input.versions) ? clone(input.versions) : [], operations: Array.isArray(input.operations) ? clone(input.operations) : [], operationCursor: Number.isInteger(input.operationCursor) ? input.operationCursor : -1, createdAt, updatedAt: input.updatedAt || now };
}

/**
 * Validates a `set_image_config` operation.
 *
 * An image artifact never stores the bytes: it stores the id of the media asset
 * that holds them. A configuration change therefore has to name the asset that
 * produced the new image. Without it the artifact would describe an image it
 * does not hold, and the history would be a record of a change that never
 * happened.
 */
function validateImageConfigOperation(operation) {
    if (typeof operation.mediaAssetId !== 'string' || !operation.mediaAssetId) throw new Error('set_image_config requires a mediaAssetId');
    if (typeof operation.prompt !== 'string' || !operation.prompt.trim()) throw new Error('set_image_config requires a non-empty prompt');
    if (operation.parameters !== undefined && !isPlainObject(operation.parameters)) throw new Error('set_image_config expects parameters to be an object');
    if (operation.model !== undefined && operation.model !== null && typeof operation.model !== 'string') throw new Error('set_image_config expects model to be a string');
    return operation;
}

export function validateOperation(operation) {
    if (!operation || typeof operation !== 'object') throw new Error('Operation must be an object');
    if (!Object.values(OPERATION_TYPES).includes(operation.type)) throw new Error(`Unsupported operation: ${operation.type}`);
    if (operation.type === OPERATION_TYPES.SET_DELIVERY_STATE && !isDeliveryState(operation.state)) throw new Error(`Unsupported delivery state: ${operation.state}`);
    if (operation.type === OPERATION_TYPES.SET_IMAGE_CONFIG) validateImageConfigOperation(operation);
    return operation;
}

function assertOperationAllowedForType(artifactType, operationType) {
    const allowedTypes = OPERATION_TYPES_BY_ARTIFACT_TYPE[operationType];
    if (allowedTypes && !allowedTypes.includes(artifactType)) throw new Error(`Operation ${operationType} is not allowed on a ${artifactType} artifact`);
}

function applyToContent(content, operation) {
  const next = clone(content) ?? {};
  switch (operation.type) {
    case OPERATION_TYPES.SET_CONTENT: return clone(operation.value);
    case OPERATION_TYPES.ADD_ELEMENT: return { ...next, elements: [...(next.elements || []), clone(operation.element)] };
    case OPERATION_TYPES.UPDATE_ELEMENT: return { ...next, elements: (next.elements || []).map((item) => item.id === operation.id ? { ...item, ...clone(operation.patch || {}) } : item) };
    case OPERATION_TYPES.REMOVE_ELEMENT: return { ...next, elements: (next.elements || []).filter((item) => item.id !== operation.id) };
    case OPERATION_TYPES.ADD_PAGE: { const pages = [...(next.pages || [])]; const index = Number.isInteger(operation.index) ? Math.max(0, Math.min(operation.index, pages.length)) : pages.length; pages.splice(index, 0, clone(operation.page)); return { ...next, pages }; }
    case OPERATION_TYPES.UPDATE_PAGE: return { ...next, pages: (next.pages || []).map((page) => page.id === operation.id ? { ...page, ...clone(operation.patch || {}) } : page) };
    case OPERATION_TYPES.REMOVE_PAGE: return { ...next, pages: (next.pages || []).filter((page) => page.id !== operation.id) };
    case OPERATION_TYPES.REORDER_PAGES: { const byId = new Map((next.pages || []).map((page) => [page.id, page])); const pages = (operation.order || []).map((id) => byId.get(id)).filter(Boolean); for (const page of next.pages || []) if (!operation.order?.includes(page.id)) pages.push(page); return { ...next, pages }; }
    case OPERATION_TYPES.SET_IMAGE_CONFIG: return { ...next, mediaAssetId: operation.mediaAssetId, prompt: operation.prompt, parameters: clone(operation.parameters || {}), model: operation.model || null };
    default: return next;
  }
}

export function applyArtifactOperation(artifactInput, operationInput, { record = true } = {}) {
    const artifact = createArtifact(artifactInput);
    const operation = validateOperation({ id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...clone(operationInput) });
    assertOperationAllowedForType(artifact.type, operation.type);
    let next = { ...artifact };
  if (operation.type === OPERATION_TYPES.SET_METADATA) next.metadata = { ...next.metadata, ...clone(operation.patch || {}) };
  else if (operation.type === OPERATION_TYPES.SET_DELIVERY_STATE) next.delivery = withDeliveryState(next.delivery, operation.state, { at: operation.createdAt, note: operation.note });
  else next.content = applyToContent(next.content, operation);
  if (record) { const retained = next.operations.slice(0, next.operationCursor + 1); next.operations = [...retained, operation]; next.operationCursor = next.operations.length - 1; }
  next.updatedAt = new Date().toISOString();
  return next;
}

function rebuildFromHistory(artifactInput, cursor) {
  const artifact = createArtifact(artifactInput);
  const base = artifact.metadata?.historyBase ?? artifact.metadata?.initialContent ?? artifact.content;
  let next = { ...artifact, content: clone(base), metadata: { ...artifact.metadata }, delivery: baseDelivery(artifact.delivery, { at: artifact.createdAt }) };
  for (let index = 0; index <= cursor; index += 1) next = applyArtifactOperation(next, artifact.operations[index], { record: false });
  next.operationCursor = cursor; next.operations = artifact.operations; return next;
}

export function withHistoryBase(artifactInput) { const artifact = createArtifact(artifactInput); return artifact.metadata?.historyBase !== undefined ? artifact : { ...artifact, metadata: { ...artifact.metadata, historyBase: clone(artifact.content) } }; }
export function undoArtifact(artifactInput) { const artifact = withHistoryBase(artifactInput); return artifact.operationCursor < 0 ? artifact : rebuildFromHistory(artifact, artifact.operationCursor - 1); }
export function redoArtifact(artifactInput) { const artifact = withHistoryBase(artifactInput); return artifact.operationCursor >= artifact.operations.length - 1 ? artifact : rebuildFromHistory(artifact, artifact.operationCursor + 1); }
export function snapshotArtifact(artifactInput, label = '') { const artifact = createArtifact(artifactInput); const version = { id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, content: clone(artifact.content), metadata: clone(artifact.metadata), delivery: clone(artifact.delivery), createdAt: new Date().toISOString() }; return { ...artifact, versions: [...artifact.versions, version], updatedAt: version.createdAt }; }

export async function saveArtifact(input) { await openDB(); const artifact = createArtifact(input); await put(STORE_NAME, artifact); return artifact; }
export async function getArtifact(id) { await openDB(); return withPersistedDelivery((await get(STORE_NAME, id)) || null); }
export async function listArtifacts({ type, projectId } = {}) { await openDB(); let items = await getAll(STORE_NAME); if (type) items = items.filter((item) => item.type === type); if (projectId) items = items.filter((item) => item.projectId === projectId); items = items.map(withPersistedDelivery); items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); return items; }
export async function deleteArtifact(id) { await openDB(); return deleteRecord(STORE_NAME, id); }
