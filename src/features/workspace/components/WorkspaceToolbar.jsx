/**
 * WorkspaceToolbar — Right-side toolbar actions
 * OpenContent IDE
 */
import Icon, { ICONS } from '../../../components/icons/Icon';
import Tooltip from '../../../components/common/Tooltip';

function WorkspaceToolbar({ onNewPrompt, onIterate, onExport, onDownloadImage, onCopyText, onDeleteProject, versions, currentVersion, currentProjectId, isWorking, t }) {
    return (
        <aside className="workspace-toolbar">
            <div className="toolbar-group">
                <Tooltip text={t('workspace.toolbar.newPrompt')}><button className="toolbar-button" onClick={onNewPrompt} aria-label={t('workspace.toolbar.newPrompt')}><Icon src={ICONS.NEW_PROJECT} size="sm" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.iterate')}><button className="toolbar-button" onClick={onIterate} disabled={!currentVersion || isWorking} aria-label={t('workspace.toolbar.iterate')}><Icon src={ICONS.ITERATE} size="sm" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.export')}><button className="toolbar-button" onClick={onExport} disabled={versions.length === 0} aria-label={t('workspace.toolbar.export')}><Icon src={ICONS.EXPORT} size="sm" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.download')}><button className="toolbar-button" disabled={versions.length === 0} aria-label={t('workspace.toolbar.download')} onClick={() => currentVersion?.type === 'image' && onDownloadImage(currentVersion.result)}><Icon src={ICONS.DOWNLOAD} size="sm" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.copy')}><button className="toolbar-button toolbar-button-accent" disabled={!currentVersion?.result} onClick={() => onCopyText(currentVersion?.result)} aria-label={t('workspace.toolbar.copy')}><Icon src={ICONS.COPY} size="sm" /></button></Tooltip>
                <Tooltip text={t('artifactStudio.title')}><button className="toolbar-button" onClick={() => { window.location.href = '/artifacts'; }} aria-label={t('artifactStudio.title')}><span aria-hidden="true">A</span></button></Tooltip>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group"><Tooltip text={t('workspace.toolbar.delete')}><button className="toolbar-button toolbar-button-danger" disabled={!currentProjectId} onClick={() => onDeleteProject(currentProjectId)} aria-label={t('workspace.toolbar.delete')}><Icon src={ICONS.DELETE} size="sm" /></button></Tooltip></div>
        </aside>
    );
}
export default WorkspaceToolbar;
