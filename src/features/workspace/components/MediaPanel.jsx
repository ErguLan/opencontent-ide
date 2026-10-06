/**
 * MediaPanel — asset library for the workspace sidebar.
 *
 * Upload (click or drag & drop), role assignment, active-asset toggling and
 * attaching an asset to the next request. All copy goes through i18n.
 */

import { useCallback, useRef, useState } from 'react';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import { ASSET_ROLES } from '../hooks/useWorkspaceMedia';
import './MediaPanel.css';

function MediaPanel({
    assets,
    activeAssetIds,
    attachedMedia,
    isUploading,
    isOpen,
    onToggleOpen,
    uploadRole,
    onUploadRoleChange,
    uploadLimit,
    onUpload,
    onDelete,
    onToggleActive,
    onAttach,
    onRoleChange,
    onChangeAttachedRole,
    onToggleAttachedActive,
    isAttachedPersisted,
    t
}) {
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const getRoleLabel = useCallback(
        (role) => t(`workspace.media.role${role.charAt(0).toUpperCase()}${role.slice(1)}`),
        [t]
    );

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onUpload(file);
    }, [onUpload]);

    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) onUpload(file);
        event.target.value = '';
    };

    return (
        <div className="sidebar-section media-section">
            <button
                type="button"
                className="section-header"
                onClick={onToggleOpen}
                aria-expanded={isOpen}
            >
                <h3 className="section-title">{t('workspace.media.title')}</h3>
                <Icon
                    src={ICONS.DOCK}
                    size="xs"
                    alt=""
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
            </button>

            {isOpen && (
                <div className="media-grid-container">
                    <div className="media-actions-row">
                        <button
                            type="button"
                            className="media-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading
                                ? <Loader variant="dots" size="xs" />
                                : <Icon src={ICONS.IMPORT} size="xs" alt="" />}
                            <span>{isUploading ? t('common.loading') : t('workspace.media.upload')}</span>
                        </button>
                        <select
                            className="media-role-select"
                            value={uploadRole}
                            onChange={(event) => onUploadRoleChange(event.target.value)}
                            aria-label={t('workspace.media.roleTemplate')}
                        >
                            {ASSET_ROLES.map((role) => (
                                <option key={role} value={role}>{getRoleLabel(role)}</option>
                            ))}
                        </select>
                        <span className="media-limit-badge">{assets.length}/{uploadLimit}</span>
                        <input
                            type="file"
                            ref={fileInputRef}
                            hidden
                            accept="image/*"
                            onChange={handleFileSelect}
                        />
                    </div>

                    <div
                        className={`media-grid ${dragOver ? 'oc-media-drop-active' : ''}`}
                        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        {assets.length === 0 ? (
                            <p className="empty-text">{t('workspace.media.empty')}</p>
                        ) : (
                            assets.map((asset) => (
                                <div
                                    key={asset.id}
                                    className={[
                                        'media-item',
                                        attachedMedia?.id === asset.id ? 'selected' : '',
                                        activeAssetIds.includes(asset.id) ? 'active' : ''
                                    ].filter(Boolean).join(' ')}
                                >
                                    <button
                                        type="button"
                                        className="media-item-open"
                                        onClick={() => onAttach(asset)}
                                    >
                                        <img src={asset.data} alt={asset.name} />
                                        <span className="media-role-badge">{getRoleLabel(asset.role)}</span>
                                        {activeAssetIds.includes(asset.id) && (
                                            <span className="media-active-dot" aria-hidden="true" />
                                        )}
                                    </button>
                                    <select
                                        className="media-item-role"
                                        value={asset.role || 'reference'}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => onRoleChange(asset.id, event.target.value)}
                                        aria-label={t('workspace.media.roleTemplate')}
                                    >
                                        {ASSET_ROLES.map((role) => (
                                            <option key={role} value={role}>{getRoleLabel(role)}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className={`media-item-use ${activeAssetIds.includes(asset.id) ? 'active' : ''}`}
                                        onClick={() => onToggleActive(asset.id)}
                                        aria-pressed={activeAssetIds.includes(asset.id)}
                                    >
                                        {activeAssetIds.includes(asset.id)
                                            ? t('workspace.media.using')
                                            : t('workspace.media.useInChat')}
                                    </button>
                                    <button
                                        type="button"
                                        className="media-item-delete"
                                        onClick={() => onDelete(asset.id)}
                                        aria-label={t('common.delete')}
                                    >
                                        <Icon src={ICONS.DELETE} size="xs" alt="" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {attachedMedia && (
                        <div className="media-selected-panel">
                            <div className="media-selected-title">
                                <span>{t('workspace.media.preview')}</span>
                                <span className="media-selected-name">{attachedMedia.name}</span>
                            </div>
                            <div className="media-selected-controls">
                                <select
                                    className="media-selected-role"
                                    value={attachedMedia.role || 'reference'}
                                    onChange={(event) => onChangeAttachedRole(event.target.value)}
                                    aria-label={t('workspace.media.roleTemplate')}
                                >
                                    {ASSET_ROLES.map((role) => (
                                        <option key={role} value={role}>{getRoleLabel(role)}</option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    className={`media-selected-use ${isAttachedPersisted && activeAssetIds.includes(attachedMedia.id) ? 'active' : ''}`}
                                    onClick={onToggleAttachedActive}
                                    disabled={!isAttachedPersisted}
                                    aria-label={t('workspace.media.useInChat')}
                                >
                                    {isAttachedPersisted && activeAssetIds.includes(attachedMedia.id)
                                        ? t('workspace.media.using')
                                        : t('workspace.media.useInChat')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default MediaPanel;