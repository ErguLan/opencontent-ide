/**
 * CopyAsApiModal — API snippets for the current prompt.
 */

import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import {
    copyToClipboard,
    generateCurlCommand,
    generateFetchSnippet,
    generateLocalServerSnippet,
    generatePythonSnippet
} from '../../../services/copyAsApi';

const TABS = Object.freeze([
    { id: 'curl', labelKey: 'workspace.copyAsApi.curl' },
    { id: 'fetch', labelKey: 'workspace.copyAsApi.javascript' },
    { id: 'python', labelKey: 'workspace.copyAsApi.python' },
    { id: 'local', labelKey: 'workspace.copyAsApi.localServer' }
]);

const COPIED_RESET_MS = 2000;

function CopyAsApiModal({ isOpen, onClose, prompt, model, t }) {
    const [activeTab, setActiveTab] = useState('curl');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const params = { prompt: prompt || '', model };
    const snippets = {
        curl: generateCurlCommand(params),
        fetch: generateFetchSnippet(params),
        python: generatePythonSnippet(params),
        local: generateLocalServerSnippet(params)
    };

    const handleCopy = async () => {
        await copyToClipboard(snippets[activeTab]);
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('workspace.copyAsApi.title')}>
            <div className="oc-copy-api-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`oc-copy-api-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                        onClick={() => { setActiveTab(tab.id); setCopied(false); }}
                        aria-pressed={activeTab === tab.id}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            <pre className="oc-copy-api-snippet">{snippets[activeTab]}</pre>

            <button type="button" className="oc-copy-api-action" onClick={handleCopy}>
                {copied ? t('workspace.copyAsApi.copied') : t('workspace.copyAsApi.copy')}
            </button>
        </Modal>
    );
}

export default CopyAsApiModal;