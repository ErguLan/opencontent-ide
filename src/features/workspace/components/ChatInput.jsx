/**
 * ChatInput — the single composer of the workspace.
 *
 * One component owns both the first prompt and every later iteration, so the
 * keyboard behaviour, the attachments, the task mode switch and the model
 * selector are identical everywhere:
 *   Enter        send (or stop the running request)
 *   Shift+Enter  new line
 */

import { useCallback, useRef } from 'react';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import './ChatInputUx.css';

const MAX_COMPOSER_HEIGHT = 160;

function ChatInput({
    value,
    onChange,
    onSubmit,
    onStop,
    isWorking,
    isIterating,
    showIterationStatus = true,
    disableModelGate = false,
    creativeTaskMode,
    onTaskModeChange,
    attachedMedia,
    onRemoveAttachment,
    activeAssets,
    onToggleActiveAsset,
    onPickAttachment,
    modelLabel,
    onShowModelModal,
    hasTextModel,
    isPro,
    onShowProModal,
    footer,
    t
}) {
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    const canSend = Boolean(value?.trim()) && !isWorking;

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        if (isWorking) {
            onStop?.();
            return;
        }
        if (!disableModelGate && !hasTextModel) {
            onShowModelModal?.();
            return;
        }
        if (!canSend) return;
        onSubmit();
    }, [canSend, disableModelGate, hasTextModel, isWorking, onShowModelModal, onStop, onSubmit]);

    const handleKeyDown = useCallback((event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
        event.preventDefault();
        handleSubmit(event);
    }, [handleSubmit]);

    const handleChange = useCallback((event) => {
        const element = event.target;
        onChange(element.value);
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    }, [onChange]);

    const handlePasteOrPick = useCallback((event) => {
        const file = event.target.files?.[0];
        if (file) onPickAttachment?.(file);
        event.target.value = '';
    }, [onPickAttachment]);

    return (
        <div className="workspace-chat-container">
            {isIterating && showIterationStatus && (
                <div className="iteration-status animate-fadeIn">
                    <Loader variant="dots" size="xs" />
                    <span>{t('workspace.iterating')}</span>
                </div>
            )}

            <div className="chat-utility-row">
                <div className="task-mode-row">
                    <button
                        type="button"
                        className={`task-mode-btn ${creativeTaskMode === 'edit_template' ? 'active' : ''}`}
                        onClick={() => onTaskModeChange?.('edit_template')}
                        aria-pressed={creativeTaskMode === 'edit_template'}
                    >
                        {t('workspace.editTemplate')}
                    </button>
                    <button
                        type="button"
                        className={`task-mode-btn ${creativeTaskMode === 'from_scratch' ? 'active' : ''}`}
                        onClick={() => onTaskModeChange?.('from_scratch')}
                        aria-pressed={creativeTaskMode === 'from_scratch'}
                    >
                        {t('workspace.fromScratch')}
                    </button>
                </div>

                <button
                    type="button"
                    className={`chat-model-btn ${hasTextModel ? '' : 'needs-selection'}`}
                    onClick={onShowModelModal}
                    title={t('workspace.model.change')}
                    aria-label={t('workspace.model.change')}
                >
                    <Icon src={ICONS.CONFIG} size="xs" alt="" />
                    <span>{modelLabel}</span>
                </button>

                {!isPro && (
                    <button
                        type="button"
                        className="chat-pro-cta-mini"
                        onClick={onShowProModal}
                        title={t('pro.cta')}
                    >
                        <span>{t('pro.mini')}</span>
                    </button>
                )}
            </div>

            {attachedMedia && (
                <div className="chat-attachment-preview animate-fadeInUp">
                    <img src={attachedMedia.data} alt={t('workspace.attachedImage')} />
                    <button
                        type="button"
                        className="remove-attach"
                        onClick={onRemoveAttachment}
                        aria-label={t('common.remove')}
                    >
                        <Icon src={ICONS.CLOSE} size="xs" alt="" />
                    </button>
                </div>
            )}

            {activeAssets.length > 0 && (
                <div className="active-assets-row">
                    {activeAssets.map((asset) => (
                        <button
                            key={asset.id}
                            type="button"
                            className="active-asset-chip"
                            onClick={() => onToggleActiveAsset(asset.id)}
                            title={t('workspace.media.using')}
                        >
                            <span>{asset.roleLabel}</span>
                            <span>{asset.name}</span>
                        </button>
                    ))}
                </div>
            )}

            <form className={`chat-input-wrapper ${isWorking && isIterating ? 'form-loading' : ''}`} onSubmit={handleSubmit}>
                <button
                    type="button"
                    className="chat-import-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title={t('workspace.media.attach')}
                    aria-label={t('workspace.media.attach')}
                >
                    <Icon src={ICONS.IMPORT} size="xs" alt="" />
                </button>
                <input
                    ref={fileInputRef}
                    className="oc-chat-file-input"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handlePasteOrPick}
                />

                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    rows={1}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('workspace.askChanges')}
                    disabled={isWorking}
                    aria-label={t('workspace.askChanges')}
                />

                <button
                    type="submit"
                    className={`chat-send-btn ${isWorking ? 'stop' : ''}`}
                    disabled={!isWorking && !canSend}
                    aria-label={isWorking ? t('common.stop') : t('common.send')}
                    title={isWorking ? t('common.stop') : t('common.send')}
                >
                    <Icon src={isWorking ? ICONS.STOP : ICONS.EXECUTE} size="sm" alt="" />
                </button>
            </form>

            <div className="chat-input-hint">{t('ux.composerHint')}</div>
            {footer}
        </div>
    );
}

export default ChatInput;