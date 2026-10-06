import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/constants';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/common/Modal';
import { updateMediaMetadata } from '../../services/mediaService';
import { ensureGeneratedImagesHaveArtifacts } from '../../services/imageArtifacts';
import { DELIVERY_STATES, isTerminal, nextStates, resolveDeliveryState } from '../../services/delivery/deliveryState';
import { buildLibraryEntries } from './libraryItems';
import './LibraryPage.css';

const STATE_FILTERS = ['all', DELIVERY_STATES.DRAFT, DELIVERY_STATES.IN_REVIEW, DELIVERY_STATES.APPROVED, DELIVERY_STATES.PUBLISHED, 'pending-review'];

function formatDate(value, language) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
}

export default function LibraryPage() {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [stateFilter, setStateFilter] = useState('all');
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [mediaError, setMediaError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Generated images stored before image artifacts existed get one
            // here, and the report carries the snapshot it read, so nothing is
            // queried twice.
            const backfill = await ensureGeneratedImagesHaveArtifacts();
            if (backfill.status !== 'loaded') throw new Error(backfill.errors?.[0]?.message || 'MEDIA_LIBRARY_UNAVAILABLE');
            setEntries(buildLibraryEntries({ media: backfill.media, artifacts: backfill.artifacts }));
        } catch (loadError) {
            console.error('Library load failed', loadError);
            setError(t('library.loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return entries.filter((item) => {
            if (filter !== 'all') {
                if (filter === 'media' && item.libraryKind !== 'media') return false;
                else if (filter === 'artifact' && item.libraryKind !== 'artifact') return false;
                else if (!['media', 'artifact'].includes(filter) && item.libraryType !== filter) return false;
            }
            if (stateFilter === 'pending-review') {
                if (!item.needsReview) return false;
            } else if (stateFilter !== 'all' && item.deliveryState !== stateFilter) return false;
            if (!normalizedQuery) return true;
            return [item.name, item.id, item.prompt, item.model, item.role, item.libraryType]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedQuery));
        });
    }, [entries, query, filter, stateFilter]);

    const counts = useMemo(() => ({
        media: entries.filter((item) => item.libraryKind === 'media').length,
        artifacts: entries.filter((item) => item.libraryKind === 'artifact').length,
        total: entries.length,
        needsReview: entries.filter((item) => item.needsReview).length
    }), [entries]);

    const openItem = (item) => {
        if (item.libraryKind === 'artifact') navigate(`${ROUTES.ARTIFACTS}/${item.id}`);
        else { setMediaError(''); setSelectedMedia(item); }
    };

    const selectedMediaState = resolveDeliveryState(selectedMedia?.status);

    const moveMediaDelivery = async (state) => {
        if (!selectedMedia) return;
        setMediaError('');
        try {
            const updated = await updateMediaMetadata(selectedMedia.id, { status: state });
            if (!updated) return;
            setEntries((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            setSelectedMedia((current) => (current ? { ...current, ...updated } : current));
        } catch (updateError) {
            setMediaError(`${t('delivery.transitionFailed')} (${updateError?.code || 'DELIVERY_UNKNOWN_ERROR'})`);
        }
    };

    return (
        <div className="oc-library-page">
            <header className="oc-library-header">
                <button type="button" className="oc-library-back" onClick={() => navigate(-1)}>← {t('common.back')}</button>
                <div>
                    <h1>{t('library.title')}</h1>
                    <p>{t('library.subtitle')}</p>
                </div>
                <div className="oc-library-header-actions">
                    <button type="button" onClick={() => navigate(ROUTES.GALLERY)}>{t('gallery.title')}</button>
                    <button type="button" onClick={() => navigate(ROUTES.ARTIFACTS)}>{t('artifactStudio.title')}</button>
                </div>
            </header>

            <main className="oc-library-main">
                <section className="oc-library-stats" aria-label={t('library.summary')}>
                    <div><strong>{counts.total}</strong><span>{t('library.total')}</span></div>
                    <div><strong>{counts.media}</strong><span>{t('library.media')}</span></div>
                    <div><strong>{counts.artifacts}</strong><span>{t('library.artifacts')}</span></div>
                    <div className={counts.needsReview > 0 ? 'is-attention' : ''}><strong>{counts.needsReview}</strong><span>{t('delivery.library.needsReviewCount')}</span></div>
                </section>

                <section className="oc-library-toolbar">
                    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ux.search')} aria-label={t('ux.search')} />
                    <div className="oc-library-filters" role="group" aria-label={t('library.filters')}>
                        {['all', 'media', 'artifact', 'image', 'diagram', 'document', 'pdf'].map((value) => (
                            <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} aria-pressed={filter === value}>{t(`library.filter.${value}`)}</button>
                        ))}
                    </div>
                    <div className="oc-library-filters oc-library-state-filters" role="group" aria-label={t('delivery.library.filterLabel')}>
                        {STATE_FILTERS.map((value) => (
                            <button
                                type="button"
                                key={value}
                                className={`${stateFilter === value ? 'active' : ''} ${value === 'pending-review' ? 'oc-library-filter-review' : ''}`}
                                onClick={() => setStateFilter(value)}
                                aria-pressed={stateFilter === value}
                            >
                                {value === 'all' ? t('delivery.library.allStates') : value === 'pending-review' ? t('delivery.library.pendingReviewFilter') : t(`delivery.states.${value}`)}
                            </button>
                        ))}
                    </div>
                </section>

                {loading && <div className="oc-library-state" role="status" aria-live="polite">{t('library.loading')}</div>}
                {!loading && error && <div className="oc-library-state error" role="alert"><p>{error}</p><button type="button" onClick={load}>{t('library.retry')}</button></div>}
                {!loading && !error && items.length === 0 && (
                    <div className="oc-library-state">
                        {stateFilter === 'pending-review' ? (
                            <>
                                <h2>{t('delivery.library.pendingEmptyTitle')}</h2>
                                <p>{t('delivery.library.pendingEmptyDescription')}</p>
                            </>
                        ) : stateFilter !== 'all' ? (
                            <>
                                <h2>{t('delivery.library.stateEmptyTitle', { state: t(`delivery.states.${stateFilter}`) })}</h2>
                                <p>{t('delivery.library.stateEmptyDescription', { help: t(`delivery.states.${stateFilter}Help`) })}</p>
                                {query && <p>{t('library.noResultsDescription')}</p>}
                            </>
                        ) : (
                            <>
                                <h2>{query || filter !== 'all' ? t('library.noResults') : t('library.emptyTitle')}</h2>
                                <p>{query || filter !== 'all' ? t('library.noResultsDescription') : t('library.emptyDescription')}</p>
                            </>
                        )}
                        {!query && filter === 'all' && stateFilter === 'all' && <div className="oc-library-empty-actions"><button type="button" onClick={() => navigate(ROUTES.WORKSPACE)}>{t('library.openWorkspace')}</button><button type="button" onClick={() => navigate(ROUTES.ARTIFACTS)}>{t('library.createArtifact')}</button></div>}
                    </div>
                )}

                {!loading && !error && items.length > 0 && (
                    <section className="oc-library-grid" aria-label={t('library.title')}>
                        {items.map((item) => (
                            <button type="button" className="oc-library-card" key={`${item.libraryKind}-${item.id}`} onClick={() => openItem(item)}>
                                <div className={`oc-library-preview ${item.libraryKind} ${item.libraryType}`}>
                                    {item.data?.startsWith('data:image') ? <img src={item.data} alt="" /> : (
                                        <div className="oc-library-type-mark"><span>{item.libraryType.toUpperCase()}</span></div>
                                    )}
                                </div>
                                <div className="oc-library-card-body">
                                    <div className="oc-library-card-title"><strong>{item.name || t('library.untitled')}</strong><span>{item.libraryKind === 'media' ? t('library.media') : t('library.artifact')}</span></div>
                                    <div className="oc-library-card-state">
                                        <span className={`oc-delivery-badge is-${item.deliveryState}`}>{t(`delivery.states.${item.deliveryState}`)}</span>
                                        {item.needsReview && <span className="oc-library-card-review">{t('delivery.pendingReview')}</span>}
                                    </div>
                                    <div className="oc-library-meta"><span>{item.libraryType}</span>{item.model && <span>{item.model}</span>}<span>{formatDate(item.updatedAt || item.createdAt, language)}</span></div>
                                </div>
                            </button>
                        ))}
                    </section>
                )}
            </main>

            <Modal
                isOpen={Boolean(selectedMedia)}
                onClose={() => setSelectedMedia(null)}
                title={selectedMedia?.name || t('library.media')}
                size="lg"
                className="oc-library-modal-shell"
            >
                {selectedMedia && (
                    <div className="oc-library-modal">
                        <span className="oc-library-modal-kind">{selectedMedia.role || selectedMedia.kind || selectedMedia.type}</span>
                        {selectedMedia.data?.startsWith('data:image') && <img src={selectedMedia.data} alt={selectedMedia.name || ''} />}
                        <dl>
                            {selectedMedia.model && <><dt>{t('library.model')}</dt><dd>{selectedMedia.model}</dd></>}
                            {selectedMedia.prompt && <><dt>{t('library.prompt')}</dt><dd>{selectedMedia.prompt}</dd></>}
                            <dt>{t('library.created')}</dt><dd>{formatDate(selectedMedia.createdAt, language)}</dd>
                        </dl>
                        <section className="oc-library-media-delivery" aria-label={t('delivery.library.mediaStateTitle')}>
                            <div className="oc-library-media-delivery-head">
                                <strong>{t('delivery.library.mediaStateTitle')}</strong>
                                <span className={`oc-delivery-badge is-${selectedMediaState}`}>{t(`delivery.states.${selectedMediaState}`)}</span>
                            </div>
                            {isTerminal(selectedMediaState) ? (
                                <p>{t('delivery.library.mediaTerminal')}</p>
                            ) : (
                                <div className="oc-library-media-delivery-actions" role="group" aria-label={t('delivery.library.mediaStateTitle')}>
                                    {nextStates(selectedMediaState).map((state) => (
                                        <button
                                            type="button"
                                            key={state}
                                            aria-label={t('delivery.library.mediaAdvanceTo', { state: t(`delivery.states.${state}`) })}
                                            onClick={() => moveMediaDelivery(state)}
                                        >
                                            {t('delivery.library.mediaAdvanceTo', { state: t(`delivery.states.${state}`) })}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {mediaError && <p className="oc-library-media-delivery-error" role="alert">{mediaError}</p>}
                        </section>
                        <div className="oc-library-modal-actions"><button type="button" onClick={() => navigate(ROUTES.GALLERY)}>{t('library.openGallery')}</button></div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
