/**
 * GalleryPage — Browse generated and uploaded images.
 * Destructive deletion is delayed so users can undo mistakes.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import { ROUTES } from '../../config/constants';
import { getAllMedia, deleteMedia } from '../../services/mediaService';
import './Gallery.css';

export default function GalleryPage() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewAsset, setPreviewAsset] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const deleteTimerRef = useRef(null);
    const pendingDeleteRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllMedia();
            setAssets([...all].reverse());
        } catch {
            setAssets([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => () => {
        if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
        if (pendingDeleteRef.current?.asset?.id) deleteMedia(pendingDeleteRef.current.asset.id).catch(() => {});
    }, []);

    const commitPendingDelete = useCallback(async () => {
        const current = pendingDeleteRef.current;
        if (!current?.asset?.id) return;
        if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
        pendingDeleteRef.current = null;
        setPendingDelete(null);
        await deleteMedia(current.asset.id);
    }, []);

    const handleDelete = useCallback(async (asset) => {
        if (!asset?.id) return;
        if (pendingDeleteRef.current) await commitPendingDelete();
        const index = assets.findIndex((item) => item.id === asset.id);
        const pending = { asset, index: Math.max(0, index) };
        pendingDeleteRef.current = pending;
        setPendingDelete(pending);
        setAssets((previous) => previous.filter((item) => item.id !== asset.id));
        if (previewAsset?.id === asset.id) setPreviewAsset(null);
        deleteTimerRef.current = window.setTimeout(() => {
            const current = pendingDeleteRef.current;
            if (!current?.asset?.id) return;
            deleteMedia(current.asset.id).catch(() => {});
            pendingDeleteRef.current = null;
            deleteTimerRef.current = null;
            setPendingDelete(null);
        }, 7000);
    }, [assets, commitPendingDelete, previewAsset]);

    const undoDelete = useCallback(() => {
        const pending = pendingDeleteRef.current;
        if (!pending) return;
        if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
        pendingDeleteRef.current = null;
        setPendingDelete(null);
        setAssets((previous) => {
            const next = [...previous];
            next.splice(Math.min(pending.index, next.length), 0, pending.asset);
            return next;
        });
    }, []);

    const handleDownload = useCallback((asset) => {
        if (!asset?.data) return;
        const link = document.createElement('a');
        link.href = asset.data;
        link.download = asset.name || `image-${asset.id}.png`;
        link.click();
    }, []);

    const handleUseAsReference = useCallback((asset) => {
        navigate(ROUTES.WORKSPACE, { state: { attachAssetId: asset.id } });
    }, [navigate]);

    return (
        <div className="gallery-page">
            <header className="gallery-header">
                <button className="icon-button" onClick={() => navigate(ROUTES.LIBRARY)} aria-label={t('library.title')}>
                    <Icon src={ICONS.CLOSE} size="sm" alt="" />
                </button>
                <h1>{t('gallery.title')}</h1>
                <span className="gallery-count">{assets.length} {t('gallery.assets')}</span>
                <button type="button" className="gallery-library-link" onClick={() => navigate(ROUTES.LIBRARY)}>{t('library.title')}</button>
            </header>

            {loading && (
                <div className="gallery-empty">
                    <Icon src={ICONS.LOADING || ICONS.EMPTY} size="lg" alt="" />
                    <p>{t('common.loading')}</p>
                </div>
            )}

            {!loading && assets.length === 0 && (
                <div className="gallery-empty">
                    <Icon src={ICONS.EMPTY} size="xl" alt="" />
                    <p>{t('gallery.empty')}</p>
                    <div className="gallery-empty-actions">
                        <button type="button" onClick={() => navigate(ROUTES.WORKSPACE)}>{t('library.openWorkspace')}</button>
                        <button type="button" onClick={() => navigate(ROUTES.LIBRARY)}>{t('library.title')}</button>
                    </div>
                </div>
            )}

            {!loading && assets.length > 0 && (
                <div className="gallery-grid">
                    {assets.map((asset) => (
                        <div key={asset.id} className="gallery-item" onClick={() => setPreviewAsset(asset)}>
                            <img src={asset.data} alt={asset.name || 'Asset'} className="gallery-thumb" loading="lazy" />
                            <div className="gallery-item-overlay">
                                <span className="gallery-item-name">{asset.name}</span>
                                <div className="gallery-item-actions">
                                    <button type="button" className="gallery-action-btn" onClick={(event) => { event.stopPropagation(); handleDownload(asset); }} title={t('common.download')}>
                                        <Icon src={ICONS.DOWNLOAD} size="xs" alt="" />
                                    </button>
                                    <button type="button" className="gallery-action-btn gallery-action-danger" onClick={(event) => { event.stopPropagation(); handleDelete(asset); }} title={t('common.delete')}>
                                        <Icon src={ICONS.DELETE} size="xs" alt="" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {previewAsset && (
                <div className="gallery-preview-overlay" onClick={() => setPreviewAsset(null)}>
                    <div className="gallery-preview" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={previewAsset.name}>
                        <button className="gallery-preview-close" onClick={() => setPreviewAsset(null)} aria-label={t('common.close')}>
                            <Icon src={ICONS.CLOSE} size="sm" alt="" />
                        </button>
                        <img src={previewAsset.data} alt={previewAsset.name} className="gallery-preview-img" />
                        <div className="gallery-preview-info">
                            <span>{previewAsset.name}</span>
                            <span>{new Date(previewAsset.createdAt).toLocaleDateString()}</span>
                            <button type="button" className="gallery-preview-download" onClick={() => handleDownload(previewAsset)}>
                                <Icon src={ICONS.DOWNLOAD} size="xs" alt="" /> {t('common.download')}
                            </button>
                            <button type="button" className="gallery-preview-download" onClick={() => handleUseAsReference(previewAsset)}>{t('gallery.useAsReference')}</button>
                            <div className="gallery-preview-metadata">
                                <span>{previewAsset.kind || 'asset'}</span>
                                {previewAsset.model && <span>{previewAsset.model}</span>}
                                {previewAsset.version && <span>v{previewAsset.version}</span>}
                                {previewAsset.status && <span>{previewAsset.status}</span>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {pendingDelete && (
                <div className="gallery-undo-toast" role="status" aria-live="polite">
                    <span>{t('ux.deleted', { name: pendingDelete.asset.name || t('gallery.assets') })}</span>
                    <button type="button" onClick={undoDelete}>{t('ux.undo')}</button>
                </div>
            )}
        </div>
    );
}
