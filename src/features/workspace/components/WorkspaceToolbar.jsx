/**
 * WorkspaceToolbar — result actions, grouped by intent.
 */

import Loader from '../../../components/common/Loader';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Tooltip from '../../../components/common/Tooltip';

function ToolButton({ label, icon, onClick, disabled, animation, danger, accent, loading }) {
    const className = [
        'toolbar-button',
        danger ? 'toolbar-button-danger' : '',
        accent ? 'toolbar-button-accent' : ''
    ].filter(Boolean).join(' ');

    return (
        <Tooltip content={label} position="left">
            <button
                type="button"
                className={className}
                onClick={onClick}
                disabled={disabled}
                aria-label={label}
            >
                {loading
                    ? <Loader variant="dots" size="xs" />
                    : <Icon src={icon} size="sm" animation={animation} alt="" />}
            </button>
        </Tooltip>
    );
}

function WorkspaceToolbar({
    hasVersions,
    currentVersionHasImage,
    isGeneratingImage,
    hasProject,
    onOpenModelModal,
    onSave,
    onCopy,
    onGenerateImage,
    onOpenInIde,
    openInIdeLabel,
    onPublish,
    onExport,
    onCopyAsApi,
    onDeleteProject,
    t
}) {
    return (
        <aside className="workspace-toolbar" aria-label={t('workspace.toolbar.actions')}>
            <div className="toolbar-group">
                <ToolButton
                    label={t('workspace.model.change')}
                    icon={ICONS.CONFIG}
                    onClick={onOpenModelModal}
                    animation="spin"
                />
                <ToolButton
                    label={t('workspace.actions.save')}
                    icon={ICONS.ADDED}
                    onClick={onSave}
                    disabled={!hasVersions}
                    animation="pop"
                />
                <ToolButton
                    label={t('workspace.actions.copy')}
                    icon={ICONS.COPY}
                    onClick={onCopy}
                    disabled={!hasVersions}
                    animation="pop"
                />
                <ToolButton
                    label={t('workspace.actions.copyApi')}
                    icon={ICONS.DEPLOY}
                    onClick={onCopyAsApi}
                    disabled={!hasVersions}
                    animation="pop"
                />
                <ToolButton
                    label={t('workspace.actions.generateImage')}
                    icon={ICONS.FOQUITO}
                    onClick={onGenerateImage}
                    disabled={!hasVersions || isGeneratingImage || currentVersionHasImage}
                    loading={isGeneratingImage}
                    animation="pop"
                />
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-group">
                <ToolButton
                    label={openInIdeLabel}
                    icon={ICONS.ACTIVATE}
                    onClick={onOpenInIde}
                    disabled={!hasVersions || !onOpenInIde}
                    accent
                    animation="pop"
                />
                <ToolButton
                    label={t('workspace.actions.publish')}
                    icon={ICONS.DEPLOY}
                    onClick={onPublish}
                    disabled={!hasVersions}
                    accent
                    animation="pop"
                />
                <ToolButton
                    label={t('workspace.actions.export')}
                    icon={ICONS.SHARE}
                    onClick={onExport}
                    disabled={!hasVersions}
                    animation="pop"
                />
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-group">
                <ToolButton
                    label={t('workspace.actions.delete')}
                    icon={ICONS.DELETE}
                    onClick={onDeleteProject}
                    disabled={!hasProject}
                    danger
                    animation="shake"
                />
            </div>
        </aside>
    );
}

export default WorkspaceToolbar;