/**
 * ChatInput — Chat form with attachments & task mode.
 */
import Icon, { ICONS } from '../../../components/icons/Icon';
import './ChatInputUx.css';

function ChatInput({
    chatInput, onChatInputChange, onSubmit,
    isWorking, isIterating, isGenerating,
    creativeTaskMode, onTaskModeChange,
    attachedMedia, onRemoveAttach,
    activeAssetIds, mediaAssets,
    chatFileInputRef, onAttachFile,
    selectedTextModel,
    onShowModelModal, isPro, onShowProModal,
    getTextModelLabel, getAssetRoleLabel,
    onAbort, t
}) {
    const submit = (event) => {
        event.preventDefault();
        onSubmit(event);
    };

    const handleComposerKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
            event.preventDefault();
            if (!isWorking || isGenerating) {
                if (isGenerating) onAbort?.();
                else onSubmit(event);
            }
        }
    };

    const resizeComposer = (event) => {
        const element = event.target;
        onChatInputChange(element.value);
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    };

    return (
        <div className="workspace-chat-container">
            {isIterating && <div className="iteration-status animate-fadeIn"><span>{t('workspace.iterating')}</span></div>}

            <div className="chat-utility-row">
                <div className="task-mode-row">
                    <button type="button" className={`task-mode-btn ${creativeTaskMode === 'edit_template' ? 'active' : ''}`} onClick={() => onTaskModeChange('edit_template')}>
                        {t('workspace.taskMode.editTemplate')}
                    </button>
                    <button type="button" className={`task-mode-btn ${creativeTaskMode === 'from_scratch' ? 'active' : ''}`} onClick={() => onTaskModeChange('from_scratch')}>
                        {t('workspace.taskMode.fromScratch')}
                    </button>
                </div>
                <button type="button" className="chat-model-btn" onClick={onShowModelModal} title={`Text: ${getTextModelLabel(selectedTextModel)}`}>
                    {getTextModelLabel(selectedTextModel)}
                </button>
                {!isPro && <button type="button" className="chat-pro-cta-mini" onClick={onShowProModal}>PRO</button>}
            </div>

            {attachedMedia && (
                <div className="chat-attachment-preview animate-fadeInUp">
                    <img src={attachedMedia.dataUrl || attachedMedia.data} alt={attachedMedia.name} />
                    <button className="remove-attach" onClick={onRemoveAttach} aria-label={t('common.remove')}><Icon src={ICONS.CLOSE} size="xs" /></button>
                </div>
            )}

            {activeAssetIds.length > 0 && (
                <div className="active-assets-row">
                    {activeAssetIds.map((assetId) => {
                        const asset = mediaAssets.find((item) => item.id === assetId);
                        if (!asset) return null;
                        return <span key={assetId} className="active-asset-chip" title={asset.name}>{getAssetRoleLabel(asset.role)}: {asset.name?.substring(0, 15)}</span>;
                    })}
                </div>
            )}

            <form className={`chat-input-wrapper ${isWorking && isIterating ? 'form-loading' : ''}`} onSubmit={submit}>
                <button type="button" className="chat-import-btn" onClick={() => chatFileInputRef.current?.click()} aria-label={t('workspace.media.attach')}>
                    <Icon src={ICONS.IMPORT} size="sm" />
                </button>
                <input ref={chatFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAttachFile} />
                <textarea
                    className="chat-input"
                    rows={1}
                    value={chatInput}
                    onChange={resizeComposer}
                    onKeyDown={handleComposerKeyDown}
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
            <div className="chat-input-hint">{t('ux.composerHint')}</div>
        </div>
    );
}

export default ChatInput;
