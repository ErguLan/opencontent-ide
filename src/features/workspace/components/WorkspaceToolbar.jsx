/**
 * WorkspaceToolbar — Right-side toolbar actions.
 */
import { useNavigate } from 'react-router-dom';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Tooltip from '../../../components/common/Tooltip';
import { ROUTES } from '../../../config/constants';

function WorkspaceToolbar({ onNewPrompt, onIterate, onExport, onDownloadImage, onCopyText, onDeleteProject, versions, currentVersion, currentProjectId, isWorking, t }) {
    const navigate = useNavigate();
    return (
        <aside className="workspace-toolbar" aria-label={t('workspace.toolbar.actions') || 'Workspace actions'}>
            <div className="toolbar-group">
                <Tooltip text={t('workspace.toolbar.newPrompt')}><button className="toolbar-button" onClick={onNewPrompt} aria-label={t('workspace.toolbar.newPrompt')}><Icon src={ICONS.NEW_PROJECT} size="sm" alt="" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.iterate')}><button className="toolbar-button" onClick={onIterate} disabled={!currentVersion || isWorking} aria-label={t('workspace.toolbar.iterate')}><Icon src={ICONS.ITERATE} size="sm" alt="" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.export')}><button className="toolbar-button" onClick={onExport} disabled={versions.length === 0} aria-label={t('workspace.toolbar.export')}><Icon src={ICONS.EXPORT} size="sm" alt="" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.download')}><button className="toolbar-button" disabled={currentVersion?.type !== 'image'} aria-label={t('workspace.toolbar.download')} onClick={() => currentVersion?.type === 'image' && onDownloadImage(currentVersion.result)}><Icon src={ICONS.DOWNLOAD} size="sm" alt="" /></button></Tooltip>
                <Tooltip text={t('workspace.toolbar.copy')}><button className="toolbar-button toolbar-button-accent" disabled={!currentVersion?.result} onClick={() => onCopyText(currentVersion?.result)} aria-label={t('workspace.toolbar.copy')}><Icon src={ICONS.COPY} size="sm" alt="" /></button></Tooltip>
                <Tooltip text={t('artifactStudio.title')}><button className="toolbar-button" onClick={() => navigate(ROUTES.ARTIFACTS)} aria-label={t('artifactStudio.title')}><Icon src={ICONS.FOLDER} size="sm" alt="" /></button></Tooltip>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group">
                <Tooltip text={t('workspace.toolbar.delete')}><button className="toolbar-button toolbar-button-danger" disabled={!currentProjectId} onClick={() => onDeleteProject(currentProjectId)} aria-label={t('workspace.toolbar.delete')}><Icon src={ICONS.DELETE} size="sm" alt="" /></button></Tooltip>
            </div>
        </aside>
    );
}
export default WorkspaceToolbar;
