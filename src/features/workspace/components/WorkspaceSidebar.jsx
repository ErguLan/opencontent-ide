/**
 * WorkspaceSidebar — navigation, projects and asset library.
 *
 * Owns nothing: every action and label arrives as props so this component stays
 * presentational.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';
import { AGENT_CONFIG, ROUTES } from '../../../config/constants';
import MediaPanel from './MediaPanel';

function WorkspaceSidebar({
    isOpen,
    onToggle,
    onNewProject,
    onNavigate,
    projects,
    currentProjectId,
    onSelectProject,
    onDeleteProject,
    usageSummary,
    media,
    onToggleTheme,
    t
}) {
    return (
        <aside className={`workspace-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
                <button type="button" className="sidebar-logo" onClick={() => onNavigate(ROUTES.LANDING)}>
                    <Icon src={ICONS.LOGO} size="sm" alt="" />
                    <span className="sidebar-title">{AGENT_CONFIG.NAME}</span>
                </button>

                <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={onToggle}
                    aria-label={isOpen ? t('workspace.actions.closeSidebar') : t('workspace.actions.openSidebar')}
                >
                    <Icon src={isOpen ? ICONS.CLOSE : ICONS.DOCK} size="xs" alt="" />
                </button>
            </div>

            <div className="sidebar-content">
                <Button
                    variant="primary"
                    fullWidth
                    icon={ICONS.ADDED}
                    onClick={onNewProject}
                    aria-label={t('workspace.newProject')}
                >
                    {t('workspace.newProject')}
                </Button>

                <MediaPanel
                    assets={media.mediaAssets}
                    activeAssetIds={media.activeAssetIds}
                    attachedMedia={media.attachedMedia}
                    isUploading={media.isUploadingMedia}
                    isOpen={media.mediaSidebarOpen}
                    onToggleOpen={media.setMediaSidebarOpen}
                    uploadRole={media.uploadAssetRole}
                    onUploadRoleChange={media.setUploadAssetRole}
                    uploadLimit={media.assetLimit}
                    onUpload={media.uploadFile}
                    onDelete={media.removeMedia}
                    onToggleActive={media.toggleAssetActive}
                    onAttach={media.attachExistingAsset}
                    onRoleChange={media.changeAssetRole}
                    onChangeAttachedRole={media.changeAttachedRole}
                    onToggleAttachedActive={media.toggleAttachedActive}
                    isAttachedPersisted={media.isPersistedAssetId(media.attachedMedia?.id)}
                    isPro={media.isPro}
                    t={t}
                />

                {usageSummary && (
                    <div className="project-limit-info">
                        {usageSummary.map((line) => <span key={line}>{line}</span>)}
                    </div>
                )}

                <div className="sidebar-section">
                    <h3 className="section-title">{t('workspace.projects')}</h3>
                    <div className="projects-list">
                        {projects.length === 0
                            ? <p className="empty-text">{t('workspace.untitled')}</p>
                            : projects.map((project) => (
                                <div
                                    key={project.id}
                                    className={`project-item ${currentProjectId === project.id ? 'active' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="project-open"
                                        onClick={() => onSelectProject(project)}
                                    >
                                        <Icon src={ICONS.FOLDER} size="sm" alt="" />
                                        <span className="project-name">{project.name || t('workspace.untitled')}</span>
                                        <span className="project-id-chip" title={project.id}>
                                            {String(project.id || '').slice(-6)}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="project-delete"
                                        onClick={() => onDeleteProject(project.id)}
                                        aria-label={t('workspace.actions.delete')}
                                    >
                                        <Icon src={ICONS.DELETE} size="xs" alt="" />
                                    </button>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            <div className="sidebar-footer">
                <button
                    type="button"
                    className="icon-button"
                    onClick={() => onNavigate(ROUTES.SETTINGS)}
                    aria-label={t('settings.title')}
                >
                    <Icon src={ICONS.SETTINGS} size="sm" animation="spin" alt="" />
                </button>
                <button
                    type="button"
                    className="icon-button"
                    onClick={() => onNavigate(ROUTES.LIBRARY)}
                    aria-label={t('library.title')}
                >
                    <Icon src={ICONS.FOLDER} size="sm" alt="" />
                </button>
                <button
                    type="button"
                    className="icon-button"
                    onClick={() => onNavigate(ROUTES.CLI)}
                    aria-label={t('cli.title')}
                >
                    <Icon src={ICONS.CONFIG} size="sm" alt="" />
                </button>
                <button
                    type="button"
                    className="icon-button"
                    onClick={onToggleTheme}
                    aria-label={t('settings.theme.title')}
                >
                    <Icon src={ICONS.FOQUITO} size="sm" animation="pop" alt="" />
                </button>
            </div>
        </aside>
    );
}

export default WorkspaceSidebar;