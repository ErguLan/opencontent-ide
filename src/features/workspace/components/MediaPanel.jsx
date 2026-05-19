/**
 * MediaPanel — Sidebar media/templates section
 * OpenContent IDE
 */
import Icon, { ICONS } from '../../../components/icons/Icon';

function MediaPanel({
    mediaAssets, activeAssetIds, attachedMedia, mediaSidebarOpen,
    isUploadingMedia, uploadAssetRole, isPro,
    fileInputRef, onToggle, onUpload, onDelete,
    onAssetClick, onRoleChange, onSetUploadRole,
    onToggleActive, onSelectedRoleChange, onRemoveAttach,
    isPersistedAssetId, getAssetRoleLabel, t
}) {
    return (
        <div className="sidebar-section media-section">
            <div className="section-header" onClick={onToggle}>
                <h3 className="section-title">Templates &amp; Assets</h3>
                <Icon
                    src={mediaSidebarOpen ? ICONS.CLOSE : ICONS.CONFIG}
                    size="xs"
                    className="section-toggle"
                />
            </div>
            {mediaSidebarOpen && (
                <div className="media-grid-container">
                    <div className="media-actions-row">
                        <button
                            className="media-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingMedia}
                        >
                            {isUploadingMedia ? '...' : '+ Upload'}
                        </button>
                        <select
                            className="media-role-select"
                            value={uploadAssetRole}
                            onChange={e => onSetUploadRole(e.target.value)}
                        >
                            <option value="reference">Reference</option>
                            <option value="template">Template</option>
                            <option value="logo">Logo</option>
                            <option value="overlay">Overlay</option>
                        </select>
                        {!isPro && <span className="media-limit-badge">{mediaAssets.length}/3</span>}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={onUpload}
                    />

                    <div className="media-grid">
                        {mediaAssets.length === 0 && (
                            <p className="empty-text">No assets yet</p>
                        )}
                        {mediaAssets.map(asset => (
                            <div
                                key={asset.id}
                                className={`media-item ${attachedMedia?.id === asset.id ? 'selected' : ''} ${activeAssetIds.includes(asset.id) ? 'active' : ''}`}
                                onClick={() => onAssetClick(asset)}
                                title={asset.name}
                            >
                                <div className="media-item-top">
                                    <span className="media-role-badge">{getAssetRoleLabel(asset.role)}</span>
                                    {activeAssetIds.includes(asset.id) && <span className="media-active-dot" aria-hidden="true" />}
                                </div>
                                <button
                                    className="media-item-delete"
                                    onClick={e => { e.stopPropagation(); onDelete(asset.id); }}
                                    aria-label="Delete"
                                >
                                    <Icon src={ICONS.DELETE} size="xs" />
                                </button>
                                <img src={asset.dataUrl} alt={asset.name} loading="lazy" />
                            </div>
                        ))}
                    </div>

                    {attachedMedia && (
                        <div className="media-selected-panel">
                            <div className="media-selected-title">
                                <Icon src={ICONS.CHECK} size="xs" />
                                <span className="media-selected-name">{attachedMedia.name}</span>
                            </div>
                            <div className="media-selected-controls">
                                <select
                                    className="media-selected-role"
                                    value={attachedMedia.role || 'reference'}
                                    onChange={e => onSelectedRoleChange(e.target.value)}
                                >
                                    <option value="reference">Reference</option>
                                    <option value="template">Template</option>
                                    <option value="logo">Logo</option>
                                    <option value="overlay">Overlay</option>
                                </select>
                                <button
                                    className={`media-selected-use ${attachedMedia.id && isPersistedAssetId(attachedMedia.id) ? (activeAssetIds.includes(attachedMedia.id) ? 'active' : '') : ''}`}
                                    onClick={onToggleActive}
                                >
                                    {activeAssetIds.includes(attachedMedia.id) ? 'Active' : 'Activate'}
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
