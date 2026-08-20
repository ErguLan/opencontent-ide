/**
 * MediaPanel — Asset and template manager for the workspace sidebar
 *
 * Shows uploaded assets with previews, roles, and drag-and-drop upload.
 * Can be rendered inline or as a modal/panel.
 */

import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import './MediaPanel.css';

const ROLE_OPTIONS = ['reference', 'template', 'logo', 'overlay'];

function getRoleLabel(role, t) {
    const map = {
        reference: t('workspace.media.roleReference'),
        template: t('workspace.media.roleTemplate'),
        logo: t('workspace.media.roleLogo'),
        overlay: t('workspace.media.roleOverlay')
    };
    return map[role] || role;
}

function MediaPanel({
    assets,
    activeAssetIds,
    attachedMedia,
    isUploading,
    onUpload,
    onDelete,
    onToggleActive,
    onAttach,
    onRoleChange,
    uploadLimit
}) {
    const { t } = useLanguage();
    const [filter, setFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [dragOver, setDragOver] = useState(false);
    const [previewAsset, setPreviewAsset] = useState(null);
    const fileInputRef = useRef(null);

    const filteredAssets = assets.filter((asset) => {
        const matchesText = !filter || asset.name.toLowerCase().includes(filter.toLowerCase());
        const matchesRole = roleFilter === 'all' || asset.role === roleFilter;
        return matchesText && matchesRole;
    });

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onUpload(file);
    }, [onUpload]);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file);
    };

    const isSelected = (asset) => attachedMedia?.id === asset.id;

    return (
        <div
            className={`oc-media-panel ${dragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="oc-media-panel-header">
                <h3 className="oc-media-panel-title">{t('workspace.media.title')}</h3>
                <span className="oc-media-panel-count">{assets.length}/{uploadLimit}</span>
            </div>

            <div className="oc-media-panel-dropzone" onClick={() => fileInputRef.current?.click()}>
                <input
                    type="file"
                    ref={fileInputRef}
                    hidden
                    accept="image/*"
                    onChange={handleFileSelect}
                />
                {isUploading ? (
                    <Loader variant="dots" size="sm" />
                ) : (
                    <>
                        <Icon src={ICONS.IMPORT} size="md" />
                        <span>{t('workspace.media.dropOrClick')}</span>
                    </>
                )}
            </div>

            <div className="oc-media-panel-filters">
                <input
                    type="text"
                    className="oc-media-panel-search"
                    placeholder={t('workspace.media.search')}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <select
                    className="oc-media-panel-role-filter"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                >
                    <option value="all">{t('workspace.media.allRoles')}</option>
                    {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{getRoleLabel(role, t)}</option>
                    ))}
                </select>
            </div>

            <div className="oc-media-panel-grid">
                {filteredAssets.length === 0 && (
                    <div className="oc-media-panel-empty">
                        <Icon src={ICONS.EMPTY} size="lg" />
                        <span>{t('workspace.media.empty')}</span>
                    </div>
                )}
                {filteredAssets.map((asset) => (
                    <div
                        key={asset.id}
                        className={`oc-media-panel-item ${isSelected(asset) ? 'selected' : ''} ${activeAssetIds.includes(asset.id) ? 'active' : ''}`}
                        onClick={() => onAttach(asset)}
                    >
                        <img src={asset.data} alt={asset.name} />
                        <div className="oc-media-panel-item-overlay">
                            <span className="oc-media-panel-item-name">{asset.name}</span>
                            <select
                                className="oc-media-panel-item-role"
                                value={asset.role || 'reference'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onRoleChange(asset.id, e.target.value)}
                            >
                                {ROLE_OPTIONS.map((role) => (
                                    <option key={role} value={role}>{getRoleLabel(role, t)}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            className="oc-media-panel-item-preview"
                            onClick={(e) => { e.stopPropagation(); setPreviewAsset(asset); }}
                            aria-label={t('workspace.media.preview')}
                        >
                            <Icon src={ICONS.SEARCH} size="xs" />
                        </button>
                        <button
                            type="button"
                            className="oc-media-panel-item-delete"
                            onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
                            aria-label={t('common.delete')}
                        >
                            <Icon src={ICONS.DELETE} size="xs" />
                        </button>
                        <button
                            type="button"
                            className={`oc-media-panel-item-use ${activeAssetIds.includes(asset.id) ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onToggleActive(asset.id); }}
                        >
                            {activeAssetIds.includes(asset.id) ? t('workspace.media.using') : t('workspace.media.useInChat')}
                        </button>
                    </div>
                ))}
            </div>

            {previewAsset && (
                <div className="oc-media-preview-overlay" onClick={() => setPreviewAsset(null)}>
                    <div className="oc-media-preview-content" onClick={(e) => e.stopPropagation()}>
                        <button className="oc-media-preview-close" onClick={() => setPreviewAsset(null)}>
                            <Icon src={ICONS.CLOSE} size="sm" />
                        </button>
                        <img src={previewAsset.data} alt={previewAsset.name} />
                        <span className="oc-media-preview-name">{previewAsset.name}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MediaPanel;
