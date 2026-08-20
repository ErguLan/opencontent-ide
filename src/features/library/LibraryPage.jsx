import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/constants';
import { useLanguage } from '../../context/LanguageContext';
import { getAllMedia } from '../../services/mediaService';
import { listArtifacts } from '../../services/artifacts/artifactEngine';
import './LibraryPage.css';

function timestampOf(item) {
    return new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
}

function formatDate(value, language) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
}

export default function LibraryPage() {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const [media, setMedia] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedMedia, setSelectedMedia] = useState(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [mediaItems, artifactItems] = await Promise.all([getAllMedia(), listArtifacts()]);
            setMedia(mediaItems || []);
            setArtifacts(artifactItems || []);
        } catch (loadError) {
            console.error('Library load failed', loadError);
            setError(t('library.loadError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const items = useMemo(() => {
        const unified = [
            ...media.map((item) => ({ ...item, libraryKind: 'media', libraryType: item.type?.startsWith('image/') ? 'image' : 'media', sortAt: timestampOf(item) })),
            ...artifacts.map((item) => ({ ...item, libraryKind: 'artifact', libraryType: item.type || 'artifact', sortAt: timestampOf(item) }))
        ].sort((a, b) => b.sortAt - a.sortAt);

        const normalizedQuery = query.trim().toLowerCase();
        return unified.filter((item) => {
            if (filter !== 'all') {
                if (filter === 'media' && item.libraryKind !== 'media') return false;
                else if (filter === 'artifact' && item.libraryKind !== 'artifact') return false;
                else if (!['media', 'artifact'].includes(filter) && item.libraryType !== filter) return false;
            }
            if (!normalizedQuery) return true;
            return [item.name, item.id, item.prompt, item.model, item.role, item.libraryType]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedQuery));
        });
    }, [media, artifacts, query, filter]);

    const counts = useMemo(() => ({ media: media.length, artifacts: artifacts.length, total: media.length + artifacts.length }), [media, artifacts]);

    const openItem = (item) => {
        if (item.libraryKind === 'artifact') navigate(`${ROUTES.ARTIFACTS}/${item.id}`);
        else setSelectedMedia(item);
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
                </section>

                <section className="oc-library-toolbar">
                    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ux.search')} aria-label={t('ux.search')} />
                    <div className="oc-library-filters" role="group" aria-label={t('library.filters')}>
                        {['all', 'media', 'artifact', 'image', 'diagram', 'document', 'pdf'].map((value) => (
                            <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{t(`library.filter.${value}`)}</button>
                        ))}
                    </div>
                </section>

                {loading && <div className="oc-library-state">{t('library.loading')}</div>}
                {!loading && error && <div className="oc-library-state error"><p>{error}</p><button type="button" onClick={load}>{t('library.retry')}</button></div>}
                {!loading && !error && items.length === 0 && (
                    <div className="oc-library-state">
                        <h2>{query || filter !== 'all' ? t('library.noResults') : t('library.emptyTitle')}</h2>
                        <p>{query || filter !== 'all' ? t('library.noResultsDescription') : t('library.emptyDescription')}</p>
                        {!query && filter === 'all' && <div className="oc-library-empty-actions"><button type="button" onClick={() => navigate(ROUTES.WORKSPACE)}>{t('library.openWorkspace')}</button><button type="button" onClick={() => navigate(ROUTES.ARTIFACTS)}>{t('library.createArtifact')}</button></div>}
                    </div>
                )}

                {!loading && !error && items.length > 0 && (
                    <section className="oc-library-grid">
                        {items.map((item) => (
                            <button type="button" className="oc-library-card" key={`${item.libraryKind}-${item.id}`} onClick={() => openItem(item)}>
                                <div className={`oc-library-preview ${item.libraryKind} ${item.libraryType}`}>
                                    {item.libraryKind === 'media' && item.data?.startsWith('data:image') ? <img src={item.data} alt="" /> : (
                                        <div className="oc-library-type-mark"><span>{item.libraryType.toUpperCase()}</span></div>
                                    )}
                                </div>
                                <div className="oc-library-card-body">
                                    <div className="oc-library-card-title"><strong>{item.name || t('library.untitled')}</strong><span>{item.libraryKind === 'media' ? t('library.media') : t('library.artifact')}</span></div>
                                    <div className="oc-library-meta"><span>{item.libraryType}</span>{item.model && <span>{item.model}</span>}<span>{formatDate(item.updatedAt || item.createdAt, language)}</span></div>
                                </div>
                            </button>
                        ))}
                    </section>
                )}
            </main>

            {selectedMedia && (
                <div className="oc-library-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMedia(null); }}>
                    <div className="oc-library-modal" role="dialog" aria-modal="true" aria-label={selectedMedia.name || t('library.media')}>
                        <div className="oc-library-modal-header"><div><strong>{selectedMedia.name || t('library.untitled')}</strong><span>{selectedMedia.role || selectedMedia.kind || selectedMedia.type}</span></div><button type="button" onClick={() => setSelectedMedia(null)}>×</button></div>
                        {selectedMedia.data?.startsWith('data:image') && <img src={selectedMedia.data} alt={selectedMedia.name || ''} />}
                        <dl>
                            {selectedMedia.model && <><dt>{t('library.model')}</dt><dd>{selectedMedia.model}</dd></>}
                            {selectedMedia.prompt && <><dt>{t('library.prompt')}</dt><dd>{selectedMedia.prompt}</dd></>}
                            <dt>{t('library.created')}</dt><dd>{formatDate(selectedMedia.createdAt, language)}</dd>
                        </dl>
                        <div className="oc-library-modal-actions"><button type="button" onClick={() => navigate(ROUTES.GALLERY)}>{t('library.openGallery')}</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
