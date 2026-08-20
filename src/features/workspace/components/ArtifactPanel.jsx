import { useState } from 'react';
import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';
import './ArtifactPanel.css';

const APPROVAL_STATUSES = new Set(['pending', 'pending_save', 'awaiting_approval', 'approval_required']);
const STATUS_KEYS = {
    pending: 'pending',
    pending_save: 'pending',
    awaiting_approval: 'pending',
    approval_required: 'pending',
    working: 'working',
    generating: 'generating',
    completed: 'completed',
    complete: 'complete',
    done: 'done',
    error: 'error',
    approved: 'approved',
    discarded: 'discarded',
    waiting: 'waiting'
};

const STEP_TYPE_KEYS = ['text', 'image', 'analyze', 'tool', 'chat'];

function getArtifactId(artifact) {
    return artifact?.id ?? artifact?.assetId;
}

function getArtifactImage(artifact) {
    return artifact?.data || artifact?.thumbnailUrl || artifact?.previewUrl || artifact?.imageUrl || artifact?.url;
}

function getArtifactStatus(artifact) {
    return String(artifact?.status || 'completed').toLowerCase();
}

function getStatusLabel(status, translate) {
    const statusKey = STATUS_KEYS[status];
    return statusKey
        ? translate(`workspace.artifacts.statuses.${statusKey}`)
        : status;
}

function getStepLabel(step, translate) {
    return step?.text || step?.description || step?.prompt || translate('workspace.artifacts.untitledStep');
}

function getStepTypeLabel(type, translate) {
    if (!type) return null;
    const normalizedType = String(type).toLowerCase();
    return STEP_TYPE_KEYS.includes(normalizedType)
        ? translate(`workspace.artifacts.stepTypes.${normalizedType}`)
        : type;
}

function formatCreatedAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

function ArtifactPanel({
    artifacts = [],
    agentSteps = [],
    selectedArtifactId = null,
    onSelectArtifact,
    onUseAsReference,
    onApproveSave,
    onDiscardArtifact,
    onRenameArtifact,
    t
}) {
    const translate = typeof t === 'function' ? t : (key) => key;
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const selectedIds = Array.isArray(selectedArtifactId)
        ? selectedArtifactId
        : selectedArtifactId == null
            ? []
            : [selectedArtifactId];
    const artifactList = Array.isArray(artifacts) ? artifacts : [];
    const steps = Array.isArray(agentSteps) ? agentSteps : [];
    const artifactById = new Map(artifactList.map((artifact) => [String(getArtifactId(artifact)), artifact]));

    const handleSelect = (artifact) => {
        if (!onSelectArtifact) return;
        const artifactId = getArtifactId(artifact);
        if (Array.isArray(selectedArtifactId)) {
            const nextIds = selectedIds.includes(artifactId)
                ? selectedIds.filter((id) => id !== artifactId)
                : [...selectedIds, artifactId];
            onSelectArtifact(nextIds, artifact);
            return;
        }

        onSelectArtifact(selectedIds.includes(artifactId) ? null : artifactId, artifact);
    };

    const beginRename = (artifact) => {
        setRenamingId(getArtifactId(artifact));
        setRenameValue(artifact.name || '');
    };

    const cancelRename = () => {
        setRenamingId(null);
        setRenameValue('');
    };

    const submitRename = (event, artifact) => {
        event.preventDefault();
        const nextName = renameValue.trim();
        if (nextName && nextName !== artifact.name && onRenameArtifact) {
            onRenameArtifact(getArtifactId(artifact), nextName, artifact);
        }
        cancelRename();
    };

    const renderArtifactMetadata = (artifact) => {
        const parentId = artifact.parentAssetId || artifact.parentId;
        const parent = parentId ? artifactById.get(String(parentId)) : null;
        const createdAt = formatCreatedAt(artifact.createdAt || artifact.updatedAt);
        const prompt = artifact.prompt || artifact.imagePrompt;
        const metadata = [
            [translate('workspace.artifacts.version'), artifact.version != null ? artifact.version : null],
            [translate('workspace.artifacts.model'), artifact.model || artifact.imageModel],
            [translate('workspace.artifacts.status'), getStatusLabel(getArtifactStatus(artifact), translate)],
            [translate('workspace.artifacts.created'), createdAt]
        ];

        return (
            <details className="oc-artifact-panel-metadata">
                <summary>{translate('workspace.artifacts.metadata')}</summary>
                <dl>
                    {metadata.map(([label, value]) => (
                        <div className="oc-artifact-panel-metadata-row" key={label}>
                            <dt>{label}</dt>
                            <dd>{value ?? translate('workspace.artifacts.notAvailable')}</dd>
                        </div>
                    ))}
                    {parentId && (
                        <div className="oc-artifact-panel-metadata-row">
                            <dt>{translate('workspace.artifacts.parent')}</dt>
                            <dd>
                                {parent ? (
                                    <button
                                        type="button"
                                        className="oc-artifact-panel-parent"
                                        onClick={() => handleSelect(parent)}
                                    >
                                        {parent.name || getArtifactId(parent)}
                                    </button>
                                ) : (
                                    artifact.parentAssetName || parentId
                                )}
                            </dd>
                        </div>
                    )}
                </dl>
                <div className="oc-artifact-panel-prompt">
                    <span className="oc-artifact-panel-prompt-label">{translate('workspace.artifacts.prompt')}</span>
                    <p>{prompt || translate('workspace.artifacts.noPrompt')}</p>
                </div>
            </details>
        );
    };

    return (
        <section className="oc-artifact-panel" aria-labelledby="oc-artifact-panel-title">
            <div className="oc-artifact-panel-header">
                <div>
                    <h2 id="oc-artifact-panel-title" className="oc-artifact-panel-title">
                        {translate('workspace.artifacts.title')}
                    </h2>
                    <p className="oc-artifact-panel-subtitle">
                        {translate('workspace.artifacts.subtitle')}
                    </p>
                </div>
                <span className="oc-artifact-panel-count" aria-label={translate('workspace.artifacts.count', { count: artifactList.length })}>
                    {artifactList.length}
                </span>
            </div>

            {selectedIds.length > 1 && (
                <div className="oc-artifact-panel-selection" role="status" aria-live="polite">
                    <Icon src={ICONS.CHECK} size="xs" alt="" />
                    <span>{translate('workspace.artifacts.selectedCount', { count: selectedIds.length })}</span>
                </div>
            )}

            <div className="oc-artifact-panel-artifacts">
                {artifactList.length === 0 ? (
                    <div className="oc-artifact-panel-empty">
                        <Icon src={ICONS.EMPTY} size="lg" alt="" />
                        <strong>{translate('workspace.artifacts.empty')}</strong>
                        <span>{translate('workspace.artifacts.emptyDescription')}</span>
                    </div>
                ) : (
                    artifactList.map((artifact, index) => {
                        const artifactId = getArtifactId(artifact);
                        const image = getArtifactImage(artifact);
                        const status = getArtifactStatus(artifact);
                        const isSelected = selectedIds.includes(artifactId);
                        const isRenaming = renamingId === artifactId;
                        const requiresApproval = Boolean(artifact.requiresApproval || artifact.pendingSave || APPROVAL_STATUSES.has(status));
                        const name = artifact.name || translate('workspace.artifacts.untitled');
                        const key = artifactId ?? `artifact-${index}`;

                        return (
                            <article
                                className={`oc-artifact-panel-card ${isSelected ? 'is-selected' : ''} status-${status.replace(/[^a-z0-9_-]/gi, '-')}`}
                                key={key}
                            >
                                <button
                                    type="button"
                                    className="oc-artifact-panel-select"
                                    onClick={() => handleSelect(artifact)}
                                    disabled={!onSelectArtifact}
                                    aria-pressed={isSelected}
                                    aria-label={translate(isSelected
                                        ? 'workspace.artifacts.removeFromComparison'
                                        : 'workspace.artifacts.selectForComparison', { name })}
                                >
                                    <span className="oc-artifact-panel-thumbnail">
                                        {image ? (
                                            <img src={image} alt={translate('workspace.artifacts.thumbnailAlt', { name })} />
                                        ) : (
                                            <Icon src={ICONS.EMPTY} size="md" alt="" />
                                        )}
                                        <span className="oc-artifact-panel-selection-mark" aria-hidden="true">
                                            {isSelected ? <Icon src={ICONS.CHECK} size="xs" alt="" /> : null}
                                        </span>
                                    </span>
                                    <span className="oc-artifact-panel-card-heading">
                                        <strong title={name}>{name}</strong>
                                        <span>{getStatusLabel(status, translate)}</span>
                                    </span>
                                </button>

                                <div className="oc-artifact-panel-card-actions">
                                    {onUseAsReference && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            icon={ICONS.FOQUITO}
                                            onClick={() => onUseAsReference(artifact)}
                                            aria-label={translate('workspace.artifacts.useAsReferenceFor', { name })}
                                        >
                                            {translate('workspace.artifacts.useAsReference')}
                                        </Button>
                                    )}
                                    {requiresApproval && onApproveSave && (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            icon={ICONS.CHECK}
                                            onClick={() => onApproveSave(artifact)}
                                        >
                                            {translate('workspace.artifacts.approveSave')}
                                        </Button>
                                    )}
                                    {onRenameArtifact && (isRenaming ? (
                                        <form className="oc-artifact-panel-rename-form" onSubmit={(event) => submitRename(event, artifact)}>
                                            <label className="oc-artifact-panel-visually-hidden" htmlFor={`artifact-name-${key}`}>
                                                {translate('workspace.artifacts.rename')}
                                            </label>
                                            <input
                                                id={`artifact-name-${key}`}
                                                value={renameValue}
                                                onChange={(event) => setRenameValue(event.target.value)}
                                                placeholder={translate('workspace.artifacts.renamePlaceholder')}
                                                autoFocus
                                            />
                                            <Button type="submit" variant="primary" size="sm" icon={ICONS.CHECK} aria-label={translate('workspace.artifacts.saveName')} />
                                            <Button type="button" variant="ghost" size="sm" icon={ICONS.CLOSE} onClick={cancelRename} aria-label={translate('workspace.artifacts.cancelRename')} />
                                        </form>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={ICONS.EDIT_PEN}
                                            onClick={() => beginRename(artifact)}
                                            aria-label={translate('workspace.artifacts.renameFor', { name })}
                                        >
                                            {translate('common.edit')}
                                        </Button>
                                    ))}
                                    {onDiscardArtifact && (
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            icon={ICONS.DELETE}
                                            onClick={() => onDiscardArtifact(artifact, getArtifactId(artifact))}
                                            aria-label={translate('workspace.artifacts.discardFor', { name })}
                                        >
                                            {translate('workspace.artifacts.discard')}
                                        </Button>
                                    )}
                                </div>

                                {renderArtifactMetadata(artifact)}
                            </article>
                        );
                    })
                )}
            </div>

            <div className="oc-artifact-panel-timeline" aria-labelledby="oc-artifact-panel-timeline-title">
                <div className="oc-artifact-panel-section-heading">
                    <h3 id="oc-artifact-panel-timeline-title">{translate('workspace.artifacts.timeline')}</h3>
                    {steps.length > 0 && <span>{steps.length}</span>}
                </div>
                {steps.length === 0 ? (
                    <p className="oc-artifact-panel-timeline-empty">{translate('workspace.artifacts.timelineEmpty')}</p>
                ) : (
                    <ol className="oc-artifact-panel-step-list" aria-live="polite">
                        {steps.map((step, index) => {
                            const status = String(step?.status || 'waiting').toLowerCase();
                            const type = getStepTypeLabel(step?.type, translate);
                            return (
                                <li className={`oc-artifact-panel-step status-${status.replace(/[^a-z0-9_-]/gi, '-')}`} key={step?.id ?? `step-${index}`}>
                                    <span className="oc-artifact-panel-step-marker" aria-hidden="true">
                                        {status === 'completed' || status === 'complete' || status === 'done'
                                            ? <Icon src={ICONS.CHECK} size="xs" alt="" />
                                            : status === 'error'
                                                ? <Icon src={ICONS.INFO} size="xs" alt="" />
                                                : <span />}
                                    </span>
                                    <span className="oc-artifact-panel-step-content">
                                        <span className="oc-artifact-panel-step-label">{getStepLabel(step, translate)}</span>
                                        <span className="oc-artifact-panel-step-meta">
                                            {type && <span>{type}</span>}
                                            <span>{getStatusLabel(status, translate)}</span>
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </section>
    );
}

export default ArtifactPanel;
