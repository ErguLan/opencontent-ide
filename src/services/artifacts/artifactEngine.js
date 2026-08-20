const DB_NAME = 'OpenContentArtifactsDB';
const DB_VERSION = 1;
const STORE_NAME = 'artifacts';

export const ARTIFACT_TYPES = Object.freeze({ TEXT: 'text', IMAGE: 'image', DIAGRAM: 'diagram', DOCUMENT: 'document', PDF: 'pdf' });
export const OPERATION_TYPES = Object.freeze({ SET_METADATA: 'set_metadata', SET_CONTENT: 'set_content', ADD_ELEMENT: 'add_element', UPDATE_ELEMENT: 'update_element', REMOVE_ELEMENT: 'remove_element', ADD_PAGE: 'add_page', UPDATE_PAGE: 'update_page', REMOVE_PAGE: 'remove_page', REORDER_PAGES: 'reorder_pages' });
const clone = (value) => (value == null ? value : structuredClone(value));

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createArtifact(input = {}) {
  const now = new Date().toISOString();
  const type = input.type || ARTIFACT_TYPES.DOCUMENT;
  if (!Object.values(ARTIFACT_TYPES).includes(type)) throw new Error(`Unsupported artifact type: ${type}`);
  return { id: input.id || `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, name: input.name || `Untitled ${type}`, projectId: input.projectId || null, source: input.source || 'local', content: clone(input.content ?? null), preview: input.preview || null, metadata: clone(input.metadata || {}), references: Array.isArray(input.references) ? [...input.references] : [], prompt: input.prompt || null, model: input.model || null, versions: Array.isArray(input.versions) ? clone(input.versions) : [], operations: Array.isArray(input.operations) ? clone(input.operations) : [], operationCursor: Number.isInteger(input.operationCursor) ? input.operationCursor : -1, createdAt: input.createdAt || now, updatedAt: input.updatedAt || now };
}

export function validateOperation(operation) {
  if (!operation || typeof operation !== 'object') throw new Error('Operation must be an object');
  if (!Object.values(OPERATION_TYPES).includes(operation.type)) throw new Error(`Unsupported operation: ${operation.type}`);
  return operation;
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
    default: return next;
  }
}

export function applyArtifactOperation(artifactInput, operationInput, { record = true } = {}) {
  const artifact = createArtifact(artifactInput);
  const operation = validateOperation({ id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...clone(operationInput) });
  let next = { ...artifact };
  if (operation.type === OPERATION_TYPES.SET_METADATA) next.metadata = { ...next.metadata, ...clone(operation.patch || {}) };
  else next.content = applyToContent(next.content, operation);
  if (record) { const retained = next.operations.slice(0, next.operationCursor + 1); next.operations = [...retained, operation]; next.operationCursor = next.operations.length - 1; }
  next.updatedAt = new Date().toISOString();
  return next;
}

function rebuildFromHistory(artifactInput, cursor) {
  const artifact = createArtifact(artifactInput);
  const base = artifact.metadata?.historyBase ?? artifact.metadata?.initialContent ?? artifact.content;
  let next = { ...artifact, content: clone(base), metadata: { ...artifact.metadata } };
  for (let index = 0; index <= cursor; index += 1) next = applyArtifactOperation(next, artifact.operations[index], { record: false });
  next.operationCursor = cursor; next.operations = artifact.operations; return next;
}

export function withHistoryBase(artifactInput) { const artifact = createArtifact(artifactInput); return artifact.metadata?.historyBase !== undefined ? artifact : { ...artifact, metadata: { ...artifact.metadata, historyBase: clone(artifact.content) } }; }
export function undoArtifact(artifactInput) { const artifact = withHistoryBase(artifactInput); return artifact.operationCursor < 0 ? artifact : rebuildFromHistory(artifact, artifact.operationCursor - 1); }
export function redoArtifact(artifactInput) { const artifact = withHistoryBase(artifactInput); return artifact.operationCursor >= artifact.operations.length - 1 ? artifact : rebuildFromHistory(artifact, artifact.operationCursor + 1); }
export function snapshotArtifact(artifactInput, label = '') { const artifact = createArtifact(artifactInput); const version = { id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, content: clone(artifact.content), metadata: clone(artifact.metadata), createdAt: new Date().toISOString() }; return { ...artifact, versions: [...artifact.versions, version], updatedAt: version.createdAt }; }

export async function saveArtifact(input) { const db = await openDB(); const artifact = createArtifact(input); return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(artifact); request.onsuccess = () => resolve(artifact); request.onerror = () => reject(request.error); }); }
export async function getArtifact(id) { const db = await openDB(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); }
export async function listArtifacts({ type, projectId } = {}) { const db = await openDB(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(); request.onsuccess = () => { let items = request.result || []; if (type) items = items.filter((item) => item.type === type); if (projectId) items = items.filter((item) => item.projectId === projectId); items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); resolve(items); }; request.onerror = () => reject(request.error); }); }
export async function deleteArtifact(id) { const db = await openDB(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id); request.onsuccess = () => resolve(true); request.onerror = () => reject(request.error); }); }
