import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { ROUTES } from '../../config/constants';
import { sendToAI, getActiveTextModel } from '../../services/ai';
import {
    ARTIFACT_TYPES,
    deleteArtifact,
    getArtifact,
    listArtifacts,
    saveArtifact,
    snapshotArtifact,
    undoArtifact,
    redoArtifact
} from '../../services/artifacts/artifactEngine';
import {
    addDiagramConnector,
    addDiagramNode,
    autoLayoutDiagram,
    createDiagramArtifact,
    diagramToSvg,
    parseDiagramDsl,
    removeDiagramNode,
    updateDiagramNode
} from '../../services/artifacts/diagramEngine';
import {
    addBlockToPage,
    addDocumentPage,
    addPdfAnnotation,
    createDocumentArtifact,
    createPdfArtifact,
    createTextBlock,
    documentFromText,
    downloadPdfBlob,
    removeDocumentPage,
    removePdfAnnotation,
    serializeDocumentToPdf,
    updateBlock
} from '../../services/artifacts/pdfEngine';
import { applyAiArtifactOperations, planArtifactOperations } from '../../services/artifacts/aiArtifactOps';
import './ArtifactStudio.css';

const TYPES = [ARTIFACT_TYPES.DIAGRAM, ARTIFACT_TYPES.DOCUMENT, ARTIFACT_TYPES.PDF];

function downloadText(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function relativeTime(value, language) {
    if (!value) return '';
    const millis = new Date(value).getTime();
    if (!Number.isFinite(millis)) return '';
    const seconds = Math.round((millis - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    const absolute = Math.abs(seconds);
    if (absolute < 60) return formatter.format(seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    return formatter.format(Math.round(hours / 24), 'day');
}

function operationSummary(operation, t) {
    switch (operation?.action) {
        case 'add_node': return t('ux.changeAdd', { label: operation.node?.label || operation.label || 'node' });
        case 'update_node': return t('ux.changeUpdate', { label: operation.patch?.label || operation.id || 'node' });
        case 'connect_nodes': return t('ux.changeConnect', { from: operation.from || '?', to: operation.to || '?' });
        case 'layout_diagram': return t('ux.changeLayout');
        case 'add_annotation': return t('ux.changeAnnotation');
        case 'set_document_text': return t('ux.changeDocument');
        case 'add_page':
        case 'remove_page':
        case 'reorder_pages': return t('ux.changePage');
        case 'set_metadata': return t('ux.changeMetadata');
        default: return t('ux.changeGeneric', { action: operation?.action || 'change' });
    }
}

export default function ArtifactStudio() {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const { artifactId } = useParams();
    const fileInput = useRef(null);
    const [items, setItems] = useState([]);
    const [active, setActive] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedPageId, setSelectedPageId] = useState(null);
    const [dsl, setDsl] = useState('');
    const [prompt, setPrompt] = useState('');
    const [pending, setPending] = useState([]);
    const [status, setStatus] = useState('');
    const [saveState, setSaveState] = useState('saved');
    const [busy, setBusy] = useState(false);
    const [drag, setDrag] = useState(null);
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    const loadList = async () => {
        const list = await listArtifacts();
        setItems(list.sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt)));
        return list;
    };

    const openArtifact = async (id, { updateRoute = true } = {}) => {
        const artifact = id ? await getArtifact(id) : null;
        setActive(artifact || null);
        setSelectedNode(null);
        setSelectedPageId(artifact?.content?.pages?.[0]?.id || null);
        setPending([]);
        setStatus('');
        if (artifact && updateRoute) navigate(`${ROUTES.ARTIFACTS}/${artifact.id}`, { replace: true });
        return artifact;
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await loadList();
            if (cancelled) return;
            const requested = artifactId ? list.find((item) => item.id === artifactId) : null;
            if (requested) await openArtifact(requested.id, { updateRoute: false });
            else if (list[0]) {
                await openArtifact(list[0].id, { updateRoute: false });
                if (!artifactId) navigate(`${ROUTES.ARTIFACTS}/${list[0].id}`, { replace: true });
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [artifactId]);

    const persist = async (value, message = '') => {
        setSaveState('saving');
        try {
            const saved = await saveArtifact(value);
            setActive(saved);
            setSaveState('saved');
            await loadList();
            if (message) setStatus(message);
            if (saved.id !== artifactId) navigate(`${ROUTES.ARTIFACTS}/${saved.id}`, { replace: true });
            return saved;
        } catch (error) {
            setSaveState('failed');
            setStatus(error?.message || t('ux.saveFailed'));
            throw error;
        }
    };

    const filteredItems = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return items.filter((item) => {
            const matchesType = typeFilter === 'all' || item.type === typeFilter;
            const matchesQuery = !normalized || `${item.name} ${item.type} ${item.id}`.toLowerCase().includes(normalized);
            return matchesType && matchesQuery;
        });
    }, [items, query, typeFilter]);

    const page = useMemo(() => active?.content?.pages?.find((item) => item.id === selectedPageId) || active?.content?.pages?.[0] || null, [active, selectedPageId]);
    const node = useMemo(() => active?.content?.elements?.find((item) => item.id === selectedNode) || null, [active, selectedNode]);

    const createNew = async (type) => {
        const value = type === ARTIFACT_TYPES.DIAGRAM
            ? createDiagramArtifact({ name: t('artifactStudio.defaults.diagram') })
            : type === ARTIFACT_TYPES.PDF
                ? createPdfArtifact({ name: t('artifactStudio.defaults.pdf') })
                : createDocumentArtifact({ name: t('artifactStudio.defaults.document') });
        await persist(value, t('artifactStudio.status.created'));
    };

    const importPdf = async (file) => {
        if (!file || file.type !== 'application/pdf') return setStatus(t('artifactStudio.status.invalidPdf'));
        if (file.size > 100 * 1024 * 1024) return setStatus(t('artifactStudio.status.pdfTooLarge'));
        setSaveState('saving');
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        await persist(createPdfArtifact({ name: file.name, sourceDataUrl: dataUrl }), t('artifactStudio.status.imported'));
        if (fileInput.current) fileInput.current.value = '';
    };

    const exportActive = () => {
        if (!active) return;
        if (active.type === ARTIFACT_TYPES.DIAGRAM) return downloadText(diagramToSvg(active), `${active.name}.svg`, 'image/svg+xml');
        if (active.type === ARTIFACT_TYPES.DOCUMENT) return downloadPdfBlob(serializeDocumentToPdf(active), active.name);
        if (active.content?.originalDataUrl) {
            const anchor = document.createElement('a');
            anchor.href = active.content.originalDataUrl;
            anchor.download = active.name;
            anchor.click();
        }
    };

    const runAi = async () => {
        if (!active || !prompt.trim()) return;
        setBusy(true);
        setStatus(t('artifactStudio.status.aiWorking'));
        try {
            if (active.type === ARTIFACT_TYPES.DOCUMENT) {
                const model = getActiveTextModel();
                if (!model) throw new Error(t('artifactStudio.status.noModel'));
                const result = await sendToAI(prompt, model, { temperature: 0.4 });
                if (!result?.success) throw new Error(result?.error || t('artifactStudio.status.aiFailed'));
                const generated = documentFromText(result.content, { name: active.name, pageSize: active.content?.pageSize || 'a4' });
                await persist(snapshotArtifact({ ...active, content: generated.content }, prompt), t('artifactStudio.status.aiApplied'));
            } else {
                const operations = await planArtifactOperations({ artifact: active, prompt, selection: selectedNode || selectedPageId || null });
                setPending(operations);
                setStatus(t('artifactStudio.status.aiPreview', { count: operations.length }));
            }
        } catch (error) {
            setStatus(error?.message || t('artifactStudio.status.aiFailed'));
        } finally {
            setBusy(false);
        }
    };

    const applyAi = async () => {
        if (!pending.length) return;
        await persist(snapshotArtifact(applyAiArtifactOperations(active, pending), prompt), t('artifactStudio.status.aiApplied'));
        setPending([]);
        setPrompt('');
    };

    const handleDelete = async () => {
        if (!active || !window.confirm(t('ux.deleteConfirm'))) return;
        await deleteArtifact(active.id);
        const list = await loadList();
        const next = list.find((item) => item.id !== active.id) || null;
        setActive(next);
        navigate(next ? `${ROUTES.ARTIFACTS}/${next.id}` : ROUTES.ARTIFACTS, { replace: true });
    };

    const pointerDown = (event, item) => {
        setSelectedNode(item.id);
        setDrag({ id: item.id, px: event.clientX, py: event.clientY, x: item.x, y: item.y });
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const pointerMove = (event) => {
        if (!drag || active?.type !== ARTIFACT_TYPES.DIAGRAM) return;
        setSaveState('saving');
        setActive(updateDiagramNode(active, drag.id, {
            x: Math.round((drag.x + event.clientX - drag.px) / 10) * 10,
            y: Math.round((drag.y + event.clientY - drag.py) / 10) * 10
        }));
    };
    const pointerUp = async () => {
        if (drag && active) await persist(active);
        setDrag(null);
    };

    const saveLabel = saveState === 'saving' ? t('ux.saving') : saveState === 'failed' ? t('ux.saveFailed') : t('ux.saved');
    const activeContext = node?.label || (page ? t('artifactStudio.document.page', { number: (active?.content?.pages || []).findIndex((item) => item.id === page.id) + 1 }) : active?.name);

    return (
        <div className="oc-artifact-studio">
            <header className="oc-artifact-header">
                <div>
                    <button className="oc-artifact-link" onClick={() => navigate(ROUTES.WORKSPACE)}>{t('artifactStudio.back')}</button>
                    <h1>{t('artifactStudio.title')}</h1>
                    <p>{t('artifactStudio.subtitle')}</p>
                </div>
                <div className="oc-artifact-header-actions">
                    {TYPES.map((type) => <button key={type} onClick={() => createNew(type)}>{t(`artifactStudio.types.${type}`)}</button>)}
                    <button onClick={() => fileInput.current?.click()}>{t('artifactStudio.importPdf')}</button>
                    <input ref={fileInput} hidden type="file" accept="application/pdf" onChange={(event) => importPdf(event.target.files?.[0])} />
                </div>
            </header>

            <div className="oc-artifact-layout">
                <aside className="oc-artifact-sidebar">
                    <strong>{t('artifactStudio.library')}</strong>
                    <input className="oc-artifact-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" aria-label="Search artifacts" />
                    <div className="oc-artifact-filters">
                        <button className={typeFilter === 'all' ? 'is-active' : ''} onClick={() => setTypeFilter('all')}>All</button>
                        {TYPES.map((type) => <button key={type} className={typeFilter === type ? 'is-active' : ''} onClick={() => setTypeFilter(type)}>{t(`artifactStudio.types.${type}`)}</button>)}
                    </div>
                    {filteredItems.map((item) => (
                        <button key={item.id} className={`oc-artifact-item ${active?.id === item.id ? 'is-active' : ''}`} onClick={() => openArtifact(item.id)}>
                            <span>{item.name}</span>
                            <small>{t(`artifactStudio.types.${item.type}`)} · {relativeTime(item.updatedAt || item.createdAt, language)}</small>
                        </button>
                    ))}
                </aside>

                <main className="oc-artifact-main">
                    {!active ? (
                        <div className="oc-artifact-empty"><h2>{t('artifactStudio.emptyTitle')}</h2><p>{t('artifactStudio.emptyDescription')}</p></div>
                    ) : (
                        <>
                            <div className="oc-artifact-toolbar">
                                <input value={active.name} aria-label={t('artifactStudio.name')} onChange={(event) => { setSaveState('saving'); setActive({ ...active, name: event.target.value }); }} onBlur={() => persist(active)} />
                                <span className={`oc-save-state is-${saveState}`} role="status" aria-live="polite">{saveLabel}</span>
                                {active.type === ARTIFACT_TYPES.PDF && <span className="oc-trust-badge">{t('ux.pdfOriginalProtected')}</span>}
                                <button disabled={active.operationCursor < 0} onClick={() => persist(undoArtifact(active))}>{t('artifactStudio.undo')}</button>
                                <button disabled={active.operationCursor >= (active.operations?.length || 0) - 1} onClick={() => persist(redoArtifact(active))}>{t('artifactStudio.redo')}</button>
                                <button onClick={exportActive}>{active.type === ARTIFACT_TYPES.PDF ? t('ux.downloadOriginal') : t('artifactStudio.export')}</button>
                                <button className="oc-danger-action" onClick={handleDelete}>{t('artifactStudio.delete')}</button>
                            </div>

                            {active.type === ARTIFACT_TYPES.DIAGRAM && (
                                <div className="oc-diagram-editor">
                                    <div className="oc-diagram-tools">
                                        <button onClick={() => persist(addDiagramNode(active, { label: `${t('artifactStudio.diagram.node')} ${(active.content?.elements?.length || 0) + 1}` }))}>{t('artifactStudio.diagram.addNode')}</button>
                                        <button disabled={!selectedNode} onClick={() => {
                                            const target = active.content.elements.find((item) => item.id !== selectedNode);
                                            if (target) persist(addDiagramConnector(active, { from: selectedNode, to: target.id }));
                                        }}>{t('artifactStudio.diagram.connect')}</button>
                                        <button onClick={() => persist(autoLayoutDiagram(active))}>{t('artifactStudio.diagram.layout')}</button>
                                        <button disabled={!selectedNode} onClick={() => persist(removeDiagramNode(active, selectedNode))}>{t('artifactStudio.diagram.remove')}</button>
                                    </div>
                                    <svg className="oc-diagram-canvas" viewBox="0 0 1200 800" onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedNode(null); }}>
                                        <defs><marker id="oc-editor-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" /></marker></defs>
                                        {(active.content?.connectors || []).map((edge) => {
                                            const from = active.content.elements.find((item) => item.id === edge.from);
                                            const to = active.content.elements.find((item) => item.id === edge.to);
                                            return from && to ? <line key={edge.id} className="oc-diagram-edge" x1={from.x + from.width / 2} y1={from.y + from.height / 2} x2={to.x + to.width / 2} y2={to.y + to.height / 2} markerEnd="url(#oc-editor-arrow)" /> : null;
                                        })}
                                        {(active.content?.elements || []).map((item) => (
                                            <g key={item.id} className={`oc-diagram-node ${selectedNode === item.id ? 'is-selected' : ''}`} onPointerDown={(event) => pointerDown(event, item)}>
                                                <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="16" />
                                                <text x={item.x + item.width / 2} y={item.y + item.height / 2 + 5} textAnchor="middle">{item.label}</text>
                                            </g>
                                        ))}
                                    </svg>
                                    <div className="oc-diagram-dsl">
                                        <textarea value={dsl} onChange={(event) => setDsl(event.target.value)} placeholder={t('artifactStudio.diagram.dslPlaceholder')} />
                                        <button onClick={async () => {
                                            if (!dsl.trim()) return;
                                            const generated = parseDiagramDsl(dsl);
                                            generated.id = active.id;
                                            generated.name = active.name;
                                            await persist(snapshotArtifact(generated, 'DSL update'), t('artifactStudio.status.dslApplied'));
                                        }}>{t('artifactStudio.diagram.applyDsl')}</button>
                                    </div>
                                </div>
                            )}

                            {active.type === ARTIFACT_TYPES.DOCUMENT && (
                                <div className="oc-document-editor">
                                    <div className="oc-document-pages">
                                        {(active.content?.pages || []).map((item, index) => <button key={item.id} className={page?.id === item.id ? 'is-active' : ''} onClick={() => setSelectedPageId(item.id)}>{t('artifactStudio.document.page', { number: index + 1 })}</button>)}
                                        <button onClick={() => persist(addDocumentPage(active))}>{t('artifactStudio.document.addPage')}</button>
                                        <button disabled={!page || active.content.pages.length <= 1} onClick={() => persist(removeDocumentPage(active, page.id))}>{t('artifactStudio.document.removePage')}</button>
                                    </div>
                                    <div className="oc-document-page">
                                        {(page?.blocks || []).map((block) => block.type === 'text' ? (
                                            <textarea key={block.id} className="oc-document-block" value={block.text} onChange={(event) => { setSaveState('saving'); setActive(updateBlock(active, page.id, block.id, { text: event.target.value })); }} onBlur={() => persist(active)} />
                                        ) : null)}
                                        <button onClick={() => persist(addBlockToPage(active, page.id, createTextBlock({ text: t('artifactStudio.document.newText') }))}>{t('artifactStudio.document.addText')}</button>
                                    </div>
                                </div>
                            )}

                            {active.type === ARTIFACT_TYPES.PDF && (
                                <div className="oc-pdf-editor">
                                    <div className="oc-pdf-preview-wrap">
                                        {active.content?.originalDataUrl ? <iframe title={active.name} className="oc-pdf-preview" src={active.content.originalDataUrl} /> : <div className="oc-artifact-empty">{t('artifactStudio.pdf.noOriginal')}</div>}
                                    </div>
                                    <aside className="oc-pdf-inspector">
                                        <div className="oc-pdf-warning"><strong>{t('ux.pdfOriginalProtected')}</strong><span>{t('ux.pdfNotesNotEmbedded')}</span></div>
                                        <h3>{t('artifactStudio.pdf.annotations')}</h3>
                                        <button onClick={() => persist(addPdfAnnotation(active, { text: t('artifactStudio.pdf.newNote'), page: 1 }))}>{t('artifactStudio.pdf.addNote')}</button>
                                        {(active.content?.annotations || []).map((annotation) => (
                                            <div key={annotation.id} className="oc-pdf-annotation">
                                                <small>Page {annotation.page}</small>
                                                <textarea value={annotation.text} onChange={(event) => { setSaveState('saving'); setActive({ ...active, content: { ...active.content, annotations: active.content.annotations.map((item) => item.id === annotation.id ? { ...item, text: event.target.value } : item) } }); }} onBlur={() => persist(active)} />
                                                <button onClick={() => persist(removePdfAnnotation(active, annotation.id))}>{t('artifactStudio.remove')}</button>
                                            </div>
                                        ))}
                                        <p>{t('artifactStudio.pdf.nonDestructive')}</p>
                                    </aside>
                                </div>
                            )}
                        </>
                    )}
                </main>

                <aside className="oc-artifact-ai-panel">
                    <h2>{t('artifactStudio.ai.title')}</h2>
                    {activeContext && <div className="oc-selection-context">{t('ux.selectedContext', { context: activeContext })}</div>}
                    {node && <input value={node.label} onChange={(event) => { setSaveState('saving'); setActive(updateDiagramNode(active, node.id, { label: event.target.value })); }} onBlur={() => persist(active)} />}
                    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('artifactStudio.ai.placeholder')} />
                    <button disabled={busy || !prompt.trim() || !active} onClick={runAi}>{busy ? t('artifactStudio.ai.working') : t('artifactStudio.ai.plan')}</button>
                    {pending.length > 0 && (
                        <div className="oc-artifact-ai-preview">
                            <strong>{t('ux.aiProposes', { count: pending.length })}</strong>
                            <ol>{pending.map((operation, index) => <li key={`${operation.action}-${index}`}>{operationSummary(operation, t)}</li>)}</ol>
                            <details><summary>Technical details</summary><pre>{JSON.stringify(pending, null, 2)}</pre></details>
                            <div className="oc-ai-preview-actions">
                                <button onClick={applyAi}>{t('artifactStudio.ai.apply')}</button>
                                <button onClick={() => setPending([])}>{t('artifactStudio.ai.discard')}</button>
                            </div>
                        </div>
                    )}
                    {status && <p className="oc-artifact-status" role="status">{status}</p>}
                </aside>
            </div>
        </div>
    );
}
