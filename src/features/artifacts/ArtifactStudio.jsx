import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { ROUTES } from '../../config/constants';
import { generateImage, getActiveImageModel, getActiveTextModel, sendToAI } from '../../services/ai';
import { ensureGeneratedImagesHaveArtifacts, regenerateImageArtifact } from '../../services/imageArtifacts';
import { IMAGE_ERROR_CODES, isImageArtifact, readImageArtifactAsset, readImageConfig } from '../../services/artifacts/imageArtifact';
import {
    ARTIFACT_TYPES,
    OPERATION_TYPES,
    applyArtifactOperation,
    deleteArtifact,
    getArtifact,
    listArtifacts,
    saveArtifact,
    snapshotArtifact,
    undoArtifact,
    redoArtifact
} from '../../services/artifacts/artifactEngine';
import { DELIVERY_STATES, describePendingReview, isTerminal, nextStates, resolveDeliveryState } from '../../services/delivery/deliveryState';
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
// Image artifacts are never created here: one cannot be made without an image
// model and a provider call, so they arrive from the workspace. They are listed
// and editable, which is why they belong to the filters and not to the create bar.
const FILTER_TYPES = [...TYPES, ARTIFACT_TYPES.IMAGE];

function downloadDataUrl(dataUrl, filename) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.click();
}

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

function formatStamp(value, language) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
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
    const [deliveryError, setDeliveryError] = useState('');
    const [imageAsset, setImageAsset] = useState(null);
    const [imageError, setImageError] = useState('');
    const [promptDraft, setPromptDraft] = useState('');
    const [parametersDraft, setParametersDraft] = useState('{}');
    const [parametersError, setParametersError] = useState('');
    const [generating, setGenerating] = useState(false);

    const loadList = async () => {
        // Generated images stored before image artifacts existed get one here.
        // The report carries the snapshot it read, so it replaces the query.
        const backfill = await ensureGeneratedImagesHaveArtifacts();
        const list = backfill.status === 'loaded' ? backfill.artifacts : await listArtifacts();
        setItems([...list].sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt)));
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

    // An image artifact holds no bytes: it points at a media asset. The bytes are
    // read from the asset that is already stored, never copied into the artifact.
    const imageMediaAssetId = isImageArtifact(active) ? readImageConfig(active).mediaAssetId : null;

    useEffect(() => {
        if (!isImageArtifact(active)) {
            setImageAsset(null);
            setImageError('');
            return undefined;
        }
        const config = readImageConfig(active);
        setPromptDraft(config.prompt);
        setParametersDraft(JSON.stringify(config.parameters, null, 2));
        setParametersError('');
        let cancelled = false;
        readImageArtifactAsset(active)
            .then((asset) => {
                if (cancelled) return;
                setImageAsset(asset);
                setImageError('');
            })
            .catch((error) => {
                if (cancelled) return;
                setImageAsset(null);
                setImageError(error?.code || IMAGE_ERROR_CODES.ASSET_NOT_FOUND);
            });
        return () => { cancelled = true; };
        // Re-read only when the artifact or the asset it references changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active?.id, imageMediaAssetId]);

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

    const deliveryState = resolveDeliveryState(active?.delivery?.state);
    const deliveryLabel = t(`delivery.states.${deliveryState}`);
    const deliveryHistory = active?.delivery?.history || [];
    const deliveryNext = nextStates(deliveryState);
    const deliveryTerminal = isTerminal(deliveryState);
    const deliveryPending = describePendingReview(active);

    // A delivery change is an ordinary artifact operation: it goes through the
    // operation log, is undoable, and is captured as a version like any edit.
    const moveDelivery = async (state) => {
        if (!active) return;
        setDeliveryError('');
        const stateLabel = t(`delivery.states.${state}`);
        try {
            const moved = applyArtifactOperation(active, { type: OPERATION_TYPES.SET_DELIVERY_STATE, state });
            await persist(snapshotArtifact(moved, t('delivery.versionLabel', { state: stateLabel })), t('delivery.moved', { state: stateLabel }));
        } catch (error) {
            setDeliveryError(`${t('delivery.transitionFailed')} (${error?.code || 'DELIVERY_UNKNOWN_ERROR'})`);
        }
    };

    const createNew = async (type) => {
        const value = type === ARTIFACT_TYPES.DIAGRAM
            ? createDiagramArtifact({ name: t('artifactStudio.defaults.diagram') })
            : type === ARTIFACT_TYPES.PDF
                ? createPdfArtifact({ name: t('artifactStudio.defaults.pdf') })
                : createDocumentArtifact({ name: t('artifactStudio.defaults.document') });
        await persist(value, t('artifactStudio.status.created'));
    };

    const imageErrorMessage = (error) => {
        switch (error?.code) {
            case IMAGE_ERROR_CODES.ASSET_NOT_FOUND: return t('imageArtifact.assetMissing');
            case IMAGE_ERROR_CODES.PROMPT_REQUIRED: return t('imageArtifact.promptRequired');
            case IMAGE_ERROR_CODES.PARAMETERS_INVALID: return t('imageArtifact.parametersInvalid');
            case IMAGE_ERROR_CODES.GENERATOR_REQUIRED: return t('imageArtifact.noModel');
            case IMAGE_ERROR_CODES.GENERATION_FAILED: return `${t('imageArtifact.generationFailed')} (${error.message})`;
            default: return error?.message || t('ux.saveFailed');
        }
    };

    // Regeneration is an ordinary artifact operation: the new bytes are stored,
    // the previous ones stay reachable through undo, and the result is snapshotted
    // so the previous state is also a labeled version.
    const regenerateImage = async () => {
        if (!active || !isImageArtifact(active)) return;
        setParametersError('');
        let parameters;
        try {
            parameters = parametersDraft.trim() ? JSON.parse(parametersDraft) : {};
        } catch {
            setParametersError(t('imageArtifact.parametersInvalid'));
            return;
        }
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            setParametersError(t('imageArtifact.parametersInvalid'));
            return;
        }
        const model = getActiveImageModel();
        if (!model) {
            setStatus(t('imageArtifact.noModel'));
            return;
        }

        setGenerating(true);
        setStatus(t('imageArtifact.status.generating'));
        try {
            const result = await regenerateImageArtifact(active, {
                prompt: promptDraft,
                parameters,
                model,
                version: (active.versions?.length || 0) + 1,
                generate: ({ prompt, parameters: nextParameters, model: nextModel, signal }) => generateImage(prompt, nextModel, { ...nextParameters, signal })
            });
            await persist(
                snapshotArtifact(result.artifact, t('imageArtifact.versionLabel', { prompt: result.artifact.content.prompt })),
                t('imageArtifact.status.applied')
            );
        } catch (error) {
            setStatus(imageErrorMessage(error));
        } finally {
            setGenerating(false);
        }
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
        if (isImageArtifact(active)) {
            if (imageAsset?.data) downloadDataUrl(imageAsset.data, imageAsset.name || active.name);
            return;
        }
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
                        {FILTER_TYPES.map((type) => <button key={type} className={typeFilter === type ? 'is-active' : ''} onClick={() => setTypeFilter(type)}>{t(`artifactStudio.types.${type}`)}</button>)}
                    </div>
                    {filteredItems.map((item) => {
                        const itemState = resolveDeliveryState(item.delivery?.state);
                        return (
                            <button key={item.id} className={`oc-artifact-item ${active?.id === item.id ? 'is-active' : ''}`} onClick={() => openArtifact(item.id)}>
                                <span>{item.name}</span>
                                <span className={`oc-delivery-badge is-${itemState} is-compact`}>{t(`delivery.states.${itemState}`)}</span>
                                <small>{t(`artifactStudio.types.${item.type}`)} · {relativeTime(item.updatedAt || item.createdAt, language)}</small>
                            </button>
                        );
                    })}
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
                                <button disabled={isImageArtifact(active) && !imageAsset} onClick={exportActive}>{active.type === ARTIFACT_TYPES.PDF ? t('ux.downloadOriginal') : t('artifactStudio.export')}</button>
                                <button className="oc-danger-action" onClick={handleDelete}>{t('artifactStudio.delete')}</button>
                            </div>

                            <section className="oc-delivery-panel" aria-labelledby="oc-delivery-heading">
                                <div className="oc-delivery-head">
                                    <h2 className="oc-delivery-heading" id="oc-delivery-heading">{t('delivery.sectionLabel')}</h2>
                                    <span className={`oc-delivery-badge is-${deliveryState}`} aria-hidden="true">{deliveryLabel}</span>
                                    <p className="oc-delivery-sr-only" role="status" aria-live="polite">{t('delivery.stateAnnouncement', { state: deliveryLabel })}</p>
                                </div>

                                {deliveryTerminal ? (
                                    <div className="oc-delivery-terminal">
                                        <strong>{t('delivery.terminalTitle')}</strong>
                                        <span>{t('delivery.terminalDescription')}</span>
                                    </div>
                                ) : (
                                    <div className="oc-delivery-actions" role="group" aria-label={t('delivery.sectionLabel')}>
                                        {deliveryNext.map((state) => (
                                            <button
                                                key={state}
                                                type="button"
                                                aria-label={t('delivery.advanceTo', { state: t(`delivery.states.${state}`) })}
                                                onClick={() => moveDelivery(state)}
                                            >
                                                {t('delivery.advanceTo', { state: t(`delivery.states.${state}`) })}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {deliveryPending && (
                                    <p className="oc-delivery-pending">
                                        <strong>{t('delivery.pendingReview')}</strong>
                                        <span>{t('delivery.pendingReviewHint')}</span>
                                    </p>
                                )}
                                {!deliveryPending && deliveryState !== DELIVERY_STATES.DRAFT && (
                                    <p className="oc-delivery-clean">{t('delivery.cleanReviewHint')}</p>
                                )}
                                {deliveryError && <p className="oc-delivery-error" role="alert">{deliveryError}</p>}

                                <details className="oc-delivery-history">
                                    <summary>{t('delivery.history')}</summary>
                                    {deliveryHistory.length === 0 ? (
                                        <p className="oc-delivery-history-empty">{t('delivery.historyEmpty')}</p>
                                    ) : (
                                        <ol className="oc-delivery-history-list">
                                            {deliveryHistory.map((entry, index) => (
                                                <li
                                                    key={`${entry.state}-${entry.at || index}`}
                                                    className={index === deliveryHistory.length - 1 ? 'is-current' : ''}
                                                    aria-label={t('delivery.historyEntry', { state: t(`delivery.states.${entry.state}`), at: formatStamp(entry.at, language) })}
                                                >
                                                    <span className="oc-delivery-history-state">{t(`delivery.states.${entry.state}`)}</span>
                                                    {entry.at && <time dateTime={entry.at}>{formatStamp(entry.at, language)}</time>}
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </details>
                            </section>

                            {isImageArtifact(active) && (
                                <div className="oc-image-editor">
                                    <div className="oc-image-canvas">
                                        {imageAsset?.data ? <img className="oc-image-preview" src={imageAsset.data} alt={active.name} /> : (
                                            imageError ? (
                                                <div className="oc-artifact-empty">
                                                    <h2>{t('imageArtifact.assetMissingTitle')}</h2>
                                                    <p>{t('imageArtifact.assetMissingDescription', { code: imageError })}</p>
                                                    <p>{t('imageArtifact.assetId', { id: imageMediaAssetId || '-' })}</p>
                                                </div>
                                            ) : (
                                                <div className="oc-artifact-empty"><p>{t('imageArtifact.loading')}</p></div>
                                            )
                                        )}
                                    </div>
                                    <div className="oc-image-inspector">
                                        <div className="oc-image-note">{t('imageArtifact.referenceNote')}</div>
                                        <label className="oc-image-field">
                                            <span>{t('imageArtifact.promptLabel')}</span>
                                            <textarea value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} placeholder={t('imageArtifact.promptPlaceholder')} />
                                        </label>
                                        <small className="oc-image-hint">{t('imageArtifact.promptHint')}</small>
                                        <label className="oc-image-field">
                                            <span>{t('imageArtifact.parametersLabel')}</span>
                                            <textarea className="oc-image-parameters" value={parametersDraft} onChange={(event) => { setParametersDraft(event.target.value); setParametersError(''); }} spellCheck="false" />
                                        </label>
                                        <small className="oc-image-hint">{t('imageArtifact.parametersHint')}</small>
                                        {parametersError && <p className="oc-image-error" role="alert">{parametersError}</p>}
                                        <button className="oc-image-regenerate" disabled={generating || Boolean(parametersError)} onClick={regenerateImage}>
                                            {generating ? t('imageArtifact.regenerating') : t('imageArtifact.regenerate')}
                                        </button>
                                        <dl className="oc-image-meta">
                                            <dt>{t('imageArtifact.assetLabel')}</dt><dd>{imageMediaAssetId || '-'}</dd>
                                            <dt>{t('imageArtifact.modelLabel')}</dt><dd>{readImageConfig(active).model || '-'}</dd>
                                            <dt>{t('imageArtifact.operationsLabel')}</dt><dd>{active.operations?.length || 0}</dd>
                                        </dl>
                                        <details className="oc-image-versions">
                                            <summary>{t('imageArtifact.versionsLabel')}</summary>
                                            {(active.versions || []).length === 0 ? (
                                                <p className="oc-image-hint">{t('imageArtifact.versionsEmpty')}</p>
                                            ) : (
                                                <ol className="oc-image-versions-list">
                                                    {active.versions.map((version, index) => (
                                                        <li key={version.id || index}>
                                                            <span>{version.label || t('imageArtifact.versionUnnamed')}</span>
                                                            <time dateTime={version.createdAt}>{formatStamp(version.createdAt, language)}</time>
                                                        </li>
                                                    ))}
                                                </ol>
                                            )}
                                        </details>
                                    </div>
                                </div>
                            )}

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
                                        <button onClick={() => persist(addBlockToPage(active, page.id, createTextBlock({ text: t('artifactStudio.document.newText') })))}>{t('artifactStudio.document.addText')}</button>
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
