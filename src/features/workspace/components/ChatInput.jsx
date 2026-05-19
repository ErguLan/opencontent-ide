/**
 * ChatInput — Chat form with attachments & task mode
 * OpenContent IDE
 */
import Icon, { ICONS } from '../../../components/icons/Icon';

function ChatInput({
    chatInput, onChatInputChange, onSubmit,
    isWorking, isIterating, isGenerating,
    creativeTaskMode, onTaskModeChange,
    attachedMedia, onRemoveAttach,
    activeAssetIds, mediaAssets,
    chatFileInputRef, onAttachFile,
    selectedTextModel, selectedImageModel,
    onShowModelModal, isPro, onShowProModal,
    getTextModelLabel, getAssetRoleLabel,
    onAbort, t
}) {
    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(e);
    };

    return (
        <div className="workspace-chat-container">
            {isIterating && (
                <div className="iteration-status animate-fadeIn">
                    <span>{t('workspace.iterating')}</span>
                </div>
            )}

            {/* Task mode & model selector */}
            <div className="chat-utility-row">
                <div className="task-mode-row">
                    <button
                        type="button"
                        className={`task-mode-btn ${creativeTaskMode === 'edit_template' ? 'active' : ''}`}
                        onClick={() => onTaskModeChange('edit_template')}
                    >
                        {t('workspace.taskMode.editTemplate')}
                    </button>
                    <button
                        type="button"
                        className={`task-mode-btn ${creativeTaskMode === 'from_scratch' ? 'active' : ''}`}
                        onClick={() => onTaskModeChange('from_scratch')}
                    >
                        {t('workspace.taskMode.fromScratch')}
                    </button>
                </div>
                <button
                    type="button"
                    className="chat-model-btn"
                    onClick={onShowModelModal}
                    title={`Text: ${getTextModelLabel(selectedTextModel)}`}
                >
                    {getTextModelLabel(selectedTextModel)}
                </button>
                {!isPro && (
                    <button
                        type="button"
                        className="chat-pro-cta-mini"
                        onClick={onShowProModal}
                    >
                        PRO
                    </button>
                )}
            </div>

            {/* Attached media preview */}
            {attachedMedia && (
                <div className="chat-attachment-preview animate-fadeInUp">
                    <img src={attachedMedia.dataUrl} alt={attachedMedia.name} />
                    <button className="remove-attach" onClick={onRemoveAttach}>✕</button>
                </div>
            )}

            {/* Active assets chips */}
            {activeAssetIds.length > 0 && (
                <div className="active-assets-row">
                    {activeAssetIds.map(assetId => {
                        const asset = mediaAssets.find(a => a.id === assetId);
                        if (!asset) return null;
                        return (
                            <span
                                key={assetId}
                                className="active-asset-chip"
                                title={asset.name}
                            >
                                {getAssetRoleLabel(asset.role)}: {asset.name?.substring(0, 15)}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Input form */}
            <form className={`chat-input-wrapper ${isWorking && isIterating ? 'form-loading' : ''}`} onSubmit={handleSubmit}>
                <button
                    type="button"
                    className="chat-import-btn"
                    onClick={() => chatFileInputRef.current?.click()}
                    aria-label="Attach image"
                >
                    <Icon src={ICONS.IMPORT} size="sm" />
                </button>
                <input
                    ref={chatFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={onAttachFile}
                />
                <input
                    className="chat-input"
                    type="text"
                    value={chatInput}
                    onChange={e => onChatInputChange(e.target.value)}
                    placeholder={t('workspace.chatPlaceholder')}
                    disabled={isWorking && !isGenerating}
                    autoFocus
                />
                <button
                    type={isGenerating ? 'button' : 'submit'}
                    className={`chat-send-btn ${isGenerating ? 'stop' : ''}`}
                    onClick={isGenerating ? onAbort : undefined}
                    disabled={!isGenerating && isWorking}
                    aria-label={isGenerating ? t('workspace.stop') : t('workspace.send')}
                >
                    <Icon src={isGenerating ? ICONS.STOP : ICONS.EXECUTE} size="sm" />
                </button>
            </form>
        </div>
    );
}

export default ChatInput;
