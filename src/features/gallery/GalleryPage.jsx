/**
 * GalleryPage — Browse all generated and uploaded images.
 * OpenContent IDE
 */

import { useState, useEffect, useCallback } from 'react';
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

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllMedia();
            setAssets(all.reverse());
        } catch {
            setAssets([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = useCallback(async (id) => {
        await deleteMedia(id);
        setAssets((prev) => prev.filter((a) => a.id !== id));
        if (previewAsset?.id === id) setPreviewAsset(null);
    }, [previewAsset]);

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
                <button className="icon-button" onClick={() => navigate(ROUTES.WORKSPACE)} aria-label={t('common.back')}>
                    <Icon src={ICONS.CLOSE} size="sm" />
                </button>
                <h1>{t('gallery.title')}</h1>
                <span className="gallery-count">{assets.length} {t('gallery.assets')}</span>
            </header>

            {loading && (
                <div className="gallery-empty">
                    <Icon src={ICONS.LOADING || ICONS.EMPTY} size="lg" />
                    <p>{t('common.loading')}</p>
                </div>
            )}

            {!loading && assets.length === 0 && (
                <div className="gallery-empty">
                    <Icon src={ICONS.EMPTY} size="xl" />
                    <p>{t('gallery.empty')}</p>
                </div>
            )}

            {!loading && assets.length > 0 && (
                <div className="gallery-grid">
                    {assets.map((asset) => (
                        <div key={asset.id} className="gallery-item" onClick={() => setPreviewAsset(asset)}>
                            <img
                                src={asset.data}
                                alt={asset.name || 'Asset'}
                                className="gallery-thumb"
                                loading="lazy"
                            />
                            <div className="gallery-item-overlay">
                                <span className="gallery-item-name">{asset.name}</span>
                                <div className="gallery-item-actions">
                                    <button
                                        type="button"
                                        className="gallery-action-btn"
                                        onClick={(e) => { e.stopPropagation(); handleDownload(asset); }}
                                        title={t('common.download')}
                                    >
                                        <Icon src={ICONS.DOWNLOAD} size="xs" />
                                    </button>
                                    <button
                                        type="button"
                                        className="gallery-action-btn gallery-action-danger"
                                        onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                                        title={t('common.delete')}
                                    >
                                        <Icon src={ICONS.DELETE} size="xs" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {previewAsset && (
                <div className="gallery-preview-overlay" onClick={() => setPreviewAsset(null)}>
                    <div className="gallery-preview" onClick={(e) => e.stopPropagation()}>
                        <button className="gallery-preview-close" onClick={() => setPreviewAsset(null)}>
                            <Icon src={ICONS.CLOSE} size="sm" />
                        </button>
                        <img src={previewAsset.data} alt={previewAsset.name} className="gallery-preview-img" />
                        <div className="gallery-preview-info">
                            <span>{previewAsset.name}</span>
                            <span>{new Date(previewAsset.createdAt).toLocaleDateString()}</span>
                            <button
                                type="button"
                                className="gallery-preview-download"
                                onClick={() => handleDownload(previewAsset)}
                            >
                                <Icon src={ICONS.DOWNLOAD} size="xs" /> {t('common.download')}
                            </button>
                            <button
                                type="button"
                                className="gallery-preview-download"
                                onClick={() => handleUseAsReference(previewAsset)}
                            >
                                {t('gallery.useAsReference')}
                            </button>
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
        </div>
    );
}
