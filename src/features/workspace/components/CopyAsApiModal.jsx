/**
 * CopyAsApiModal — Shows API snippets for the current prompt
 * OpenContent IDE
 */
import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Modal from '../../../components/common/Modal';
import {
    generateCurlCommand,
    generateFetchSnippet,
    generatePythonSnippet,
    generateLocalServerSnippet,
    copyToClipboard
} from '../../../services/copyAsApi';

function CopyAsApiModal({ isOpen, onClose, prompt, model }) {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState('curl');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const params = { prompt: prompt || '', model };

    const tabs = [
        { id: 'curl', label: t('workspace.copyAsApi.curl') },
        { id: 'fetch', label: t('workspace.copyAsApi.javascript') },
        { id: 'python', label: t('workspace.copyAsApi.python') },
        { id: 'local', label: t('workspace.copyAsApi.localServer') }
    ];

    const snippets = {
        curl: generateCurlCommand(params),
        fetch: generateFetchSnippet(params),
        python: generatePythonSnippet(params),
        local: generateLocalServerSnippet(params)
    };

    const handleCopy = async () => {
        await copyToClipboard(snippets[activeTab]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal open={isOpen} onClose={onClose} title={t('workspace.copyAsApi.title')}>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => { setActiveTab(tab.id); setCopied(false); }}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeTab === tab.id ? 'var(--color-primary, #7c3aed)' : 'var(--bg-secondary, #2a2a2a)',
                            color: activeTab === tab.id ? '#fff' : 'var(--text-secondary, #aaa)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: activeTab === tab.id ? 600 : 400
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <pre style={{
                background: 'var(--bg-tertiary, #1a1a1a)',
                padding: '12px',
                borderRadius: '8px',
                overflowX: 'auto',
                fontSize: '12px',
                lineHeight: '1.5',
                maxHeight: '300px',
                color: 'var(--text-primary, #eee)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
            }}>
                {snippets[activeTab]}
            </pre>

            <button
                type="button"
                onClick={handleCopy}
                style={{
                    marginTop: '12px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: copied ? '#22c55e' : 'var(--color-primary, #7c3aed)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    width: '100%'
                }}
            >
                {copied ? t('workspace.copyAsApi.copied') : t('workspace.copyAsApi.copy')}
            </button>
        </Modal>
    );
}

export default CopyAsApiModal;
