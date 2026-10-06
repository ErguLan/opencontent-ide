/**
 * OpenInIdeModal - hands the exported document to an external desktop editor.
 *
 * Three honest facts drive the whole screen:
 *
 * 1. The browser cannot read where the user's files live. The folder field is
 *    therefore optional and empty by default, and the link is built without any
 *    path until the user types one. Nothing is ever guessed.
 * 2. Activating a link hands a request to the operating system. It does not
 *    mean the application opened anything, so the screen never says it did and
 *    never uses a timer or a `blur` event to pretend otherwise.
 * 3. Without a folder path the link carries no panel either, because a receiver
 *    asked to focus a panel with no project has nothing to show.
 */

import { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Icon, { ICONS } from '../../../components/icons/Icon';
import { buildOpenInIdeUrl } from '../../../services/integration/openInIde';
import { trackMetric } from '../../../services/metrics';
import './OpenInIdeModal.css';

const COPY_RESET_MS = 2000;

export default function OpenInIdeModal({ state, config, onClose, t }) {
    const [projectPath, setProjectPath] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!state?.open) return;
        setProjectPath('');
        setCopied(false);
    }, [state?.open]);

    if (!state?.open) return null;

    const appName = config.appName;
    const folder = projectPath.trim();
    const link = folder
        ? buildOpenInIdeUrl({ scheme: config.scheme, project: folder, file: state.filename, panel: 'editor' })
        : buildOpenInIdeUrl({ scheme: config.scheme });

    const handleCopy = async () => {
        if (!link.url) return;
        try {
            await navigator.clipboard.writeText(link.url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), COPY_RESET_MS);
        } catch {
            setCopied(false);
        }
    };

    const handleActivate = () => {
        // The user asked for the request to be sent. That is all this records.
        trackMetric('open_in_ide_link_activated', { hasPath: Boolean(folder) });
    };

    const renderOutcome = () => {
        if (state.status === 'exporting') {
            return <p className="oc-open-in-ide-status" role="status">{t('workspace.openInIde.exporting')}</p>;
        }
        if (state.status === 'blocked') {
            return (
                <div className="oc-open-in-ide-blocked" role="alert">
                    <strong>{t('workspace.openInIde.blockedTitle')}</strong>
                    <span>{t(`workspace.openInIde.${state.blockKey}`)}</span>
                    <span className="oc-open-in-ide-code">{state.code}</span>
                </div>
            );
        }
        if (state.status === 'failed') {
            return (
                <div className="oc-open-in-ide-blocked" role="alert">
                    <strong>{t('workspace.openInIde.exportFailedTitle')}</strong>
                    <span>{t('workspace.openInIde.exportFailed')}</span>
                    <span className="oc-open-in-ide-code">{state.code}</span>
                </div>
            );
        }
        return (
            <div className="oc-open-in-ide-exported">
                <Icon src={ICONS.CHECK} size="xs" alt="" />
                <span>{state.location}</span>
            </div>
        );
    };

    return (
        <Modal isOpen={Boolean(state.open)} onClose={onClose} title={t('workspace.openInIde.title', { app: appName })}>
            <div className="oc-open-in-ide">
                {renderOutcome()}

                {state.status === 'ready' && (
                    <>
                        <div className="oc-open-in-ide-field">
                            <label className="oc-open-in-ide-label" htmlFor="oc-open-in-ide-path">
                                {t('workspace.openInIde.pathLabel')}
                            </label>
                            <input
                                id="oc-open-in-ide-path"
                                className="oc-open-in-ide-input"
                                type="text"
                                value={projectPath}
                                onChange={(event) => setProjectPath(event.target.value)}
                                placeholder={t('workspace.openInIde.pathPlaceholder')}
                                aria-describedby="oc-open-in-ide-path-hint"
                            />
                            <p className="oc-open-in-ide-hint" id="oc-open-in-ide-path-hint">
                                {t('workspace.openInIde.pathHint', { app: appName, filename: state.filename })}
                            </p>
                        </div>

                        {/* Only a folder the user typed can be reported as unusable. */}
                        {folder && link.error ? (
                            <p className="oc-open-in-ide-error" role="alert">
                                {t('workspace.openInIde.pathInvalid', { code: link.error })}
                            </p>
                        ) : link.url ? (
                            <>
                                <p className="oc-open-in-ide-linklabel">{t('workspace.openInIde.linkLabel')}</p>
                                <code className="oc-open-in-ide-link">{link.url}</code>
                                <p className="oc-open-in-ide-hint">
                                    {folder
                                        ? t('workspace.openInIde.linkWithPath')
                                        : t('workspace.openInIde.linkWithoutPath', { app: appName })}
                                </p>
                                <a
                                    className="oc-open-in-ide-action"
                                    href={link.url}
                                    onClick={handleActivate}
                                >
                                    {t('workspace.openInIde.openLink', { app: appName })}
                                </a>
                                <button type="button" className="oc-open-in-ide-copy" onClick={handleCopy}>
                                    {copied ? t('workspace.openInIde.copied') : t('workspace.openInIde.copyLink')}
                                </button>
                            </>
                        ) : null}

                        <p className="oc-open-in-ide-note">{t('workspace.openInIde.linkHint', { app: appName })}</p>
                        <p className="oc-open-in-ide-note">{t('workspace.openInIde.help', { app: appName })}</p>
                        {config.helpUrl && (
                            <a className="oc-open-in-ide-help" href={config.helpUrl} target="_blank" rel="noopener noreferrer">
                                {t('workspace.openInIde.helpLink', { app: appName })}
                            </a>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}