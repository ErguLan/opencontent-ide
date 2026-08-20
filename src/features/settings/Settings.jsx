/**
 * Settings Page
 * OpenContent IDE
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import { PLANS, STORAGE_KEYS, REPO_URL } from '../../config/constants';
import {
    AI_CONFIG,
    SKILLS,
    getActiveSkill,
    saveApiKey,
    getApiKey,
    isAIConfigured
} from '../../services/ai';
import {
    getStoredModels,
    addModel,
    removeModel,
    PROVIDERS,
    MODEL_TYPES
} from '../../services/models';
import { chooseLocalDirectory, getLocalSaveSettings, saveLocalSaveSettings } from '../../services/filePersistence';
import { getAllMedia } from '../../services/mediaService';
import { getBrandKit, saveBrandKit } from '../../services/brandKit';

const PROVIDER_LABELS = {
    [PROVIDERS.OPENROUTER]: 'OpenRouter',
    [PROVIDERS.OPENAI]: 'OpenAI',
    [PROVIDERS.GOOGLE]: 'Google (Gemini)',
    [PROVIDERS.ANTHROPIC]: 'Anthropic (Claude)',
    [PROVIDERS.OLLAMA]: 'Ollama (local)',
    [PROVIDERS.CUSTOM]: 'Custom OpenAI-compatible'
};

function Settings() {
    const DEFAULT_TIMEOUT_MS = 45000;
    const MIN_TIMEOUT_MS = 10000;
    const MAX_TIMEOUT_MS = 120000;
    const navigate = useNavigate();
    const { t, language, languages, changeLanguage } = useLanguage();
    const { isDark, toggleTheme } = useTheme();
    const { isAuthenticated, profile, logout } = useAuth();

    const [showLastPrompt, setShowLastPrompt] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SHOW_LAST_PROMPT) === 'true'
    );
    const [imageProcessingMode, setImageProcessingMode] = useState(
        () => localStorage.getItem(STORAGE_KEYS.IMAGE_PROCESSING_MODE) || 'smart'
    );
    const [aiTimeoutMs, setAiTimeoutMs] = useState(() => {
        const stored = Number(localStorage.getItem(STORAGE_KEYS.AI_TIMEOUT_MS));
        if (!Number.isFinite(stored)) return DEFAULT_TIMEOUT_MS;
        return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, stored));
    });

    const [ollamaUrl, setOllamaUrl] = useState(
        () => localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || AI_CONFIG.OLLAMA_BASE_URL || 'http://localhost:11434'
    );
    const [ollamaStatus, setOllamaStatus] = useState(null);
    const [ollamaModels, setOllamaModels] = useState([]);

    const [keys, setKeys] = useState({
        openrouter: getApiKey('openrouter'),
        openai: getApiKey('openai'),
        gemini: getApiKey('gemini'),
        anthropic: getApiKey('anthropic'),
        custom: getApiKey('custom')
    });
    const [showKeys, setShowKeys] = useState(false);
    const [keySaved, setKeySaved] = useState(null);

    const [activeSkill, setActiveSkill] = useState(() => getActiveSkill().id);
    const [models, setModels] = useState(() => getStoredModels());

    const [newModel, setNewModel] = useState({
        id: '',
        nickname: '',
        provider: '',
        type: MODEL_TYPES.TEXT,
        baseUrl: '',
        capabilities: { text: true, imageGeneration: false, vision: false, toolCalling: false, imageEditing: false }
    });
    const [modelError, setModelError] = useState('');
    const [cliAccess, setCliAccess] = useState(() => localStorage.getItem(STORAGE_KEYS.CLI_ACCESS) || 'public');
    const [toolCallingEnabled, setToolCallingEnabled] = useState(
        () => localStorage.getItem(STORAGE_KEYS.TOOL_CALLING_ENABLED) !== 'false'
    );
    const [localSaveSettings, setLocalSaveSettings] = useState(() => getLocalSaveSettings());
    const [directoryName, setDirectoryName] = useState('');
    const [brandKit, setBrandKit] = useState(() => getBrandKit());
    const [brandAssets, setBrandAssets] = useState([]);

    useEffect(() => {
        let cancelled = false;
        getAllMedia()
            .then((assets) => {
                if (!cancelled) setBrandAssets(assets.filter((asset) => asset?.data));
            })
            .catch(() => {
                if (!cancelled) setBrandAssets([]);
            });
        return () => { cancelled = true; };
    }, []);

    const handleSaveKey = (provider, value) => {
        saveApiKey(provider, value);
        setKeys((prev) => ({ ...prev, [provider]: value }));
        setKeySaved(provider);
        setTimeout(() => setKeySaved(null), 2000);
    };

    const handleTestOllama = async () => {
        setOllamaStatus('testing');
        setOllamaModels([]);
        try {
            const res = await fetch(`${ollamaUrl}/api/tags`, { method: 'GET' });
            if (!res.ok) throw new Error('Connection failed');
            const data = await res.json();
            setOllamaModels((data.models || []).map((m) => m.name || m.model));
            setOllamaStatus('ok');
        } catch {
            setOllamaStatus('error');
        }
    };

    const handleOllamaUrlChange = (url) => {
        setOllamaUrl(url);
        localStorage.setItem(STORAGE_KEYS.OLLAMA_URL, url);
        setOllamaStatus(null);
    };

    const handleToggleLastPrompt = () => {
        const nextValue = !showLastPrompt;
        setShowLastPrompt(nextValue);
        localStorage.setItem(STORAGE_KEYS.SHOW_LAST_PROMPT, String(nextValue));
    };

    const handleCliAccessChange = (value) => {
        setCliAccess(value);
        localStorage.setItem(STORAGE_KEYS.CLI_ACCESS, value);
    };

    const handleToolCallingChange = () => {
        const next = !toolCallingEnabled;
        setToolCallingEnabled(next);
        localStorage.setItem(STORAGE_KEYS.TOOL_CALLING_ENABLED, String(next));
    };

    const updateLocalSaveSettings = (updates) => {
        setLocalSaveSettings((current) => saveLocalSaveSettings({ ...current, ...updates }));
    };

    const handleChooseLocalDirectory = async () => {
        try {
            setDirectoryName(await chooseLocalDirectory());
            updateLocalSaveSettings({ allowLocalWrites: true, mode: 'configured-directory' });
        } catch (error) {
            if (error?.name !== 'AbortError') console.warn('Local directory selection failed', error);
        }
    };

    const handleChangeImageProcessingMode = (mode) => {
        setImageProcessingMode(mode);
        localStorage.setItem(STORAGE_KEYS.IMAGE_PROCESSING_MODE, mode);
    };

    const handleTimeoutChange = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            setAiTimeoutMs(DEFAULT_TIMEOUT_MS);
            localStorage.setItem(STORAGE_KEYS.AI_TIMEOUT_MS, String(DEFAULT_TIMEOUT_MS));
            return;
        }
        const clamped = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(numeric)));
        setAiTimeoutMs(clamped);
        localStorage.setItem(STORAGE_KEYS.AI_TIMEOUT_MS, String(clamped));
    };

    const handleSkillChange = (skillId) => {
        setActiveSkill(skillId);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SKILL, skillId);
    };

    const updateBrandKit = (updates) => {
        setBrandKit((current) => saveBrandKit({ ...current, ...updates }));
    };

    const updateBrandKitField = (field, value) => updateBrandKit({ [field]: value });

    const updateBrandKitList = (field, value) => updateBrandKit({
        [field]: value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    });

    const toggleBrandAsset = (field, assetId) => {
        const currentIds = brandKit[field] || [];
        updateBrandKit({
            [field]: currentIds.includes(assetId)
                ? currentIds.filter((id) => id !== assetId)
                : [...currentIds, assetId]
        });
    };

    const addBrandColor = () => updateBrandKit({ colors: [...brandKit.colors, { name: '', value: '' }] });

    const updateBrandColor = (index, updates) => updateBrandKit({
        colors: brandKit.colors.map((color, colorIndex) => colorIndex === index ? { ...color, ...updates } : color)
    });

    const removeBrandColor = (index) => updateBrandKit({
        colors: brandKit.colors.filter((_, colorIndex) => colorIndex !== index)
    });

    const addPlatformRule = () => updateBrandKit({ platformRules: [...brandKit.platformRules, { platform: '', rules: '' }] });

    const updatePlatformRule = (index, updates) => updateBrandKit({
        platformRules: brandKit.platformRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...updates } : rule)
    });

    const removePlatformRule = (index) => updateBrandKit({
        platformRules: brandKit.platformRules.filter((_, ruleIndex) => ruleIndex !== index)
    });

    const refreshModels = useCallback(() => {
        setModels(getStoredModels());
    }, []);

    const handleAddModel = () => {
        setModelError('');
        try {
            addModel(newModel);
            refreshModels();
            setNewModel({
                id: '',
                nickname: '',
                provider: '',
                type: MODEL_TYPES.TEXT,
                baseUrl: '',
                capabilities: { text: true, imageGeneration: false, vision: false, toolCalling: false, imageEditing: false }
            });
        } catch (err) {
            setModelError(err.message);
        }
    };

    const handleRemoveModel = (id) => {
        removeModel(id);
        refreshModels();
    };

    const toggleCapability = (cap) => {
        setNewModel((prev) => ({
            ...prev,
            capabilities: { ...prev.capabilities, [cap]: !prev.capabilities[cap] }
        }));
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <button className="back-button" onClick={() => navigate(-1)} aria-label={t('common.back')}>
                    <Icon src={ICONS.CLOSE} size="sm" />
                </button>
                <h1 className="settings-title">{t('settings.title')}</h1>
                <div className="header-spacer" />
            </header>

            <main className="settings-content">
                <div className="settings-container">
                     {isAuthenticated && profile && (
                        <section className="settings-section">
                            <h2 className="section-title">{t('settings.account.title')}</h2>
                            <div className="account-card">
                                <div className="account-avatar">
                                    {profile.avatarUrl ? (
                                        <img src={profile.avatarUrl} alt={profile.displayName} />
                                    ) : (
                                        <span>{profile.displayName?.charAt(0) || '?'}</span>
                                    )}
                                </div>
                                <div className="account-info">
                                    <span className="account-name">{profile.displayName}</span>
                                    <span className="account-email">{profile.email}</span>
                                </div>
                                <div className="account-plan">
                                    <span className={`plan-badge ${profile.plan === PLANS.PRO ? 'pro' : ''}`}>
                                        {profile.plan === PLANS.PRO ? t('settings.account.pro') : t('settings.account.free')}
                                    </span>
                                </div>
                            </div>
                            <Button variant="secondary" onClick={logout}>
                                {t('settings.account.logout')}
                            </Button>
                         </section>
                     )}

                    <section className="settings-section brand-kit-section">
                        <div>
                            <h2 className="section-title">{t('settings.brandKit.title')}</h2>
                            <p className="section-description">{t('settings.brandKit.description')}</p>
                        </div>

                        <div className="brand-kit-form">
                            <label className="brand-kit-field">
                                <span className="setting-label">{t('settings.brandKit.name')}</span>
                                <input
                                    type="text"
                                    className="brand-kit-input"
                                    value={brandKit.name}
                                    onChange={(event) => updateBrandKitField('name', event.target.value)}
                                    placeholder={t('settings.brandKit.namePlaceholder')}
                                />
                            </label>
                            <label className="brand-kit-field">
                                <span className="setting-label">{t('settings.brandKit.descriptionLabel')}</span>
                                <textarea
                                    className="brand-kit-textarea"
                                    value={brandKit.description}
                                    onChange={(event) => updateBrandKitField('description', event.target.value)}
                                    placeholder={t('settings.brandKit.descriptionPlaceholder')}
                                    rows={3}
                                />
                            </label>
                            <div className="brand-kit-grid">
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.voice')}</span>
                                    <textarea
                                        className="brand-kit-textarea"
                                        value={brandKit.voice}
                                        onChange={(event) => updateBrandKitField('voice', event.target.value)}
                                        placeholder={t('settings.brandKit.voicePlaceholder')}
                                        rows={3}
                                    />
                                </label>
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.audience')}</span>
                                    <textarea
                                        className="brand-kit-textarea"
                                        value={brandKit.audience}
                                        onChange={(event) => updateBrandKitField('audience', event.target.value)}
                                        placeholder={t('settings.brandKit.audiencePlaceholder')}
                                        rows={3}
                                    />
                                </label>
                            </div>

                            <div className="brand-kit-subsection">
                                <div className="brand-kit-subsection-header">
                                    <div>
                                        <h3 className="brand-kit-subtitle">{t('settings.brandKit.colors')}</h3>
                                        <span className="setting-description">{t('settings.brandKit.colorsDescription')}</span>
                                    </div>
                                    <button type="button" className="mode-option" onClick={addBrandColor}>{t('common.add')}</button>
                                </div>
                                {brandKit.colors.map((color, index) => (
                                    <div className="brand-kit-inline-row" key={`brand-color-${index}`}>
                                        <label className="brand-kit-visually-contained">
                                            <span className="sr-only">{t('settings.brandKit.colorName')}</span>
                                            <input
                                                type="text"
                                                className="brand-kit-input"
                                                value={color.name}
                                                onChange={(event) => updateBrandColor(index, { name: event.target.value })}
                                                placeholder={t('settings.brandKit.colorName')}
                                            />
                                        </label>
                                        <label className="brand-kit-visually-contained">
                                            <span className="sr-only">{t('settings.brandKit.colorValue')}</span>
                                            <input
                                                type="text"
                                                className="brand-kit-input"
                                                value={color.value}
                                                onChange={(event) => updateBrandColor(index, { value: event.target.value })}
                                                placeholder={t('settings.brandKit.colorValuePlaceholder')}
                                            />
                                        </label>
                                        <button type="button" className="brand-kit-remove" onClick={() => removeBrandColor(index)} aria-label={t('common.remove')}>
                                            <Icon src={ICONS.DELETE} size="xs" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="brand-kit-grid">
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.headingFont')}</span>
                                    <input
                                        type="text"
                                        className="brand-kit-input"
                                        value={brandKit.typography.heading}
                                        onChange={(event) => updateBrandKit({ typography: { ...brandKit.typography, heading: event.target.value } })}
                                        placeholder={t('settings.brandKit.fontPlaceholder')}
                                    />
                                </label>
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.bodyFont')}</span>
                                    <input
                                        type="text"
                                        className="brand-kit-input"
                                        value={brandKit.typography.body}
                                        onChange={(event) => updateBrandKit({ typography: { ...brandKit.typography, body: event.target.value } })}
                                        placeholder={t('settings.brandKit.fontPlaceholder')}
                                    />
                                </label>
                            </div>

                            <div className="brand-kit-grid">
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.requiredWords')}</span>
                                    <textarea
                                        className="brand-kit-textarea"
                                        value={brandKit.requiredWords.join(', ')}
                                        onChange={(event) => updateBrandKitList('requiredWords', event.target.value)}
                                        placeholder={t('settings.brandKit.wordsPlaceholder')}
                                        rows={3}
                                    />
                                </label>
                                <label className="brand-kit-field">
                                    <span className="setting-label">{t('settings.brandKit.prohibitedWords')}</span>
                                    <textarea
                                        className="brand-kit-textarea"
                                        value={brandKit.prohibitedWords.join(', ')}
                                        onChange={(event) => updateBrandKitList('prohibitedWords', event.target.value)}
                                        placeholder={t('settings.brandKit.wordsPlaceholder')}
                                        rows={3}
                                    />
                                </label>
                            </div>

                            <div className="brand-kit-subsection">
                                <h3 className="brand-kit-subtitle">{t('settings.brandKit.assets')}</h3>
                                <span className="setting-description">{t('settings.brandKit.assetsDescription')}</span>
                                {brandAssets.length === 0 ? (
                                    <span className="setting-description">{t('settings.brandKit.noAssets')}</span>
                                ) : (
                                    <div className="brand-kit-assets">
                                        {brandAssets.map((asset) => (
                                            <div className="brand-kit-asset" key={asset.id}>
                                                <img src={asset.data} alt="" className="brand-kit-asset-preview" />
                                                <span className="brand-kit-asset-name" title={asset.name}>{asset.name}</span>
                                                <label className="brand-kit-asset-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={brandKit.logoAssetIds.includes(asset.id)}
                                                        onChange={() => toggleBrandAsset('logoAssetIds', asset.id)}
                                                    />
                                                    <span>{t('settings.brandKit.logo')}</span>
                                                </label>
                                                <label className="brand-kit-asset-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={brandKit.referenceAssetIds.includes(asset.id)}
                                                        onChange={() => toggleBrandAsset('referenceAssetIds', asset.id)}
                                                    />
                                                    <span>{t('settings.brandKit.reference')}</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="brand-kit-subsection">
                                <div className="brand-kit-subsection-header">
                                    <div>
                                        <h3 className="brand-kit-subtitle">{t('settings.brandKit.platformRules')}</h3>
                                        <span className="setting-description">{t('settings.brandKit.platformRulesDescription')}</span>
                                    </div>
                                    <button type="button" className="mode-option" onClick={addPlatformRule}>{t('common.add')}</button>
                                </div>
                                {brandKit.platformRules.map((rule, index) => (
                                    <div className="brand-kit-inline-row brand-kit-platform-row" key={`platform-rule-${index}`}>
                                        <label className="brand-kit-visually-contained">
                                            <span className="sr-only">{t('settings.brandKit.platform')}</span>
                                            <input
                                                type="text"
                                                className="brand-kit-input"
                                                value={rule.platform}
                                                onChange={(event) => updatePlatformRule(index, { platform: event.target.value })}
                                                placeholder={t('settings.brandKit.platformPlaceholder')}
                                            />
                                        </label>
                                        <label className="brand-kit-visually-contained brand-kit-rule-input">
                                            <span className="sr-only">{t('settings.brandKit.rule')}</span>
                                            <input
                                                type="text"
                                                className="brand-kit-input"
                                                value={rule.rules}
                                                onChange={(event) => updatePlatformRule(index, { rules: event.target.value })}
                                                placeholder={t('settings.brandKit.rulePlaceholder')}
                                            />
                                        </label>
                                        <button type="button" className="brand-kit-remove" onClick={() => removePlatformRule(index)} aria-label={t('common.remove')}>
                                            <Icon src={ICONS.DELETE} size="xs" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                     <section className="settings-section">
                        <h2 className="section-title">{t('settings.apiKeys.title')}</h2>
                        <span className="setting-description" style={{ marginBottom: '12px', display: 'block' }}>
                            {t('settings.apiKeys.description')}
                        </span>

                        {[
                            { key: 'openrouter', label: 'OpenRouter', link: 'https://openrouter.ai/keys' },
                            { key: 'openai', label: 'OpenAI', link: 'https://platform.openai.com/api-keys' },
                            { key: 'gemini', label: 'Google Gemini', link: 'https://aistudio.google.com/apikey' },
                            { key: 'anthropic', label: 'Anthropic Claude', link: 'https://console.anthropic.com/settings/keys' },
                            { key: 'custom', label: 'Custom provider', link: '' }
                        ].map((provider) => (
                            <div key={provider.key} className="setting-row setting-row-stacked" style={{ marginTop: '8px' }}>
                                <div className="setting-info">
                                    <span className="setting-label">{provider.label} API Key</span>
                                    <span className="setting-description">
                                        {provider.link ? (
                                            <>
                                                {t('settings.apiKeys.getKeyAt')}{' '}
                                                <a href={provider.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                                                    {provider.link.replace(/^https:\/\//, '')}
                                                </a>
                                            </>
                                        ) : t('settings.apiKeys.customDescription')}
                                    </span>
                                </div>
                                <div className="timeout-row">
                                    <input
                                        type={showKeys ? 'text' : 'password'}
                                        className="timeout-input"
                                        style={{ flex: 1 }}
                                        value={keys[provider.key]}
                                        onChange={(e) => handleSaveKey(provider.key, e.target.value)}
                                        placeholder={`${provider.label} key...`}
                                        autoComplete="off"
                                    />
                                    {keySaved === provider.key && (
                                        <span className="mode-option active" style={{ cursor: 'default', fontSize: '12px' }}>
                                            {t('common.saved')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}

                        <div className="timeout-row" style={{ marginTop: '10px' }}>
                            <button type="button" className="mode-option" onClick={() => setShowKeys(!showKeys)}>
                                {showKeys ? t('settings.apiKeys.hide') : t('settings.apiKeys.show')}
                            </button>
                            <span className="setting-description" style={{ marginLeft: '8px' }}>
                                {isAIConfigured() ? t('settings.apiKeys.configured') : t('settings.apiKeys.notConfigured')}
                            </span>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.models.title')}</h2>
                        <span className="setting-description" style={{ marginBottom: '12px', display: 'block' }}>
                            {t('settings.models.description')}
                        </span>

                        <div className="models-list">
                            {models.map((model) => (
                                <div key={model.id} className="model-card">
                                    <div className="model-card-main">
                                        <span className="model-card-nickname">{model.nickname}</span>
                                        <span className="model-card-id">{model.id}</span>
                                        <span className="model-card-provider">{PROVIDER_LABELS[model.provider] || model.provider}</span>
                                    </div>
                                    <div className="model-card-tags">
                                        {model.capabilities?.text && <span className="model-tag">{t('settings.models.text')}</span>}
                                        {model.capabilities?.vision && <span className="model-tag">{t('settings.models.vision')}</span>}
                                        {model.capabilities?.imageGeneration && <span className="model-tag">{t('settings.models.image')}</span>}
                                        {model.capabilities?.toolCalling && <span className="model-tag">{t('settings.models.tools')}</span>}
                                    </div>
                                    {!model.isBuiltIn && (
                                        <button
                                            type="button"
                                            className="model-card-remove"
                                            onClick={() => handleRemoveModel(model.id)}
                                            aria-label={t('common.delete')}
                                        >
                                            <Icon src={ICONS.DELETE} size="xs" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="add-model-form">
                            <h4 className="section-subtitle">{t('settings.models.addModel')}</h4>
                            {modelError && <p className="setting-error">{modelError}</p>}
                            <div className="add-model-row">
                                <input
                                    type="text"
                                    className="timeout-input"
                                    placeholder={t('settings.models.modelIdPlaceholder')}
                                    value={newModel.id}
                                    onChange={(e) => setNewModel((prev) => ({ ...prev, id: e.target.value }))}
                                />
                                <input
                                    type="text"
                                    className="timeout-input"
                                    placeholder={t('settings.models.nicknamePlaceholder')}
                                    value={newModel.nickname}
                                    onChange={(e) => setNewModel((prev) => ({ ...prev, nickname: e.target.value }))}
                                />
                            </div>
                            <div className="add-model-row">
                                <select
                                    className="timeout-input"
                                    value={newModel.provider}
                                    onChange={(e) => setNewModel((prev) => ({ ...prev, provider: e.target.value }))}
                                >
                                    <option value="">{t('settings.models.selectProvider')}</option>
                                    {Object.values(PROVIDERS).map((p) => (
                                        <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                                    ))}
                                </select>
                                <select
                                    className="timeout-input"
                                    value={newModel.type}
                                    onChange={(e) => setNewModel((prev) => ({ ...prev, type: e.target.value }))}
                                >
                                    {Object.values(MODEL_TYPES).map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            {newModel.provider === PROVIDERS.CUSTOM && (
                                <input
                                    type="url"
                                    className="timeout-input"
                                    placeholder="https://your-provider.example/v1"
                                    value={newModel.baseUrl}
                                    onChange={(e) => setNewModel((prev) => ({ ...prev, baseUrl: e.target.value }))}
                                />
                            )}
                            <div className="model-capabilities">
                                {[
                                    { key: 'text', label: t('settings.models.text') },
                                    { key: 'vision', label: t('settings.models.vision') },
                                    { key: 'imageGeneration', label: t('settings.models.image') },
                                    { key: 'toolCalling', label: t('settings.models.tools') },
                                    { key: 'imageEditing', label: t('settings.models.editing') }
                                ].map((cap) => (
                                    <button
                                        key={cap.key}
                                        type="button"
                                        className={`mode-option ${newModel.capabilities[cap.key] ? 'active' : ''}`}
                                        onClick={() => toggleCapability(cap.key)}
                                    >
                                        {cap.label}
                                    </button>
                                ))}
                            </div>
                            <Button variant="primary" onClick={handleAddModel} disabled={!newModel.id.trim() || !newModel.provider || (newModel.provider === PROVIDERS.CUSTOM && !newModel.baseUrl.trim())}>
                                {t('settings.models.addButton')}
                            </Button>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.theme.title')}</h2>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{isDark ? t('settings.theme.dark') : t('settings.theme.light')}</span>
                            </div>
                            <button className={`theme-toggle ${isDark ? 'dark' : 'light'}`} onClick={toggleTheme} aria-label={t('settings.theme.title')}>
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.FOQUITO} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.language.title')}</h2>
                        <div className="language-options">
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    className={`language-option ${language === lang.code ? 'active' : ''}`}
                                    onClick={() => changeLanguage(lang.code)}
                                >
                                    <span className="language-flag">{lang.flag}</span>
                                    <span className="language-name">{lang.name}</span>
                                    {language === lang.code && <Icon src={ICONS.CHECK} size="sm" className="check-icon" />}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.cli.title')}</h2>
                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.cli.access')}</span>
                                <span className="setting-description">{t('settings.cli.accessDescription')}</span>
                            </div>
                            <div className="language-options">
                                {['public', 'local_only', 'disabled'].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`language-option ${cliAccess === value ? 'active' : ''}`}
                                        onClick={() => handleCliAccessChange(value)}
                                    >
                                        {t(`settings.cli.${value}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.workspace.title')}</h2>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.workspace.showLastPrompt')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${showLastPrompt ? 'dark' : 'light'}`}
                                onClick={handleToggleLastPrompt}
                                aria-label={t('settings.workspace.showLastPrompt')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.CONFIG} size="xs" className="toggle-icon" />
                            </button>
                        </div>

                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.workspace.imageProcessing')}</span>
                                <span className="setting-description">{t('settings.workspace.imageProcessingDesc')}</span>
                            </div>
                            <div className="mode-options">
                                {['analysis_send', 'send_only', 'smart'].map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        className={`mode-option ${imageProcessingMode === mode ? 'active' : ''}`}
                                        onClick={() => handleChangeImageProcessingMode(mode)}
                                    >
                                        {t(`settings.workspace.imageProcessingModes.${mode}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.workspace.timeout')}</span>
                                <span className="setting-description">{t('settings.workspace.timeoutDesc')}</span>
                            </div>
                            <div className="timeout-row">
                                <input
                                    type="number"
                                    className="timeout-input"
                                    min={MIN_TIMEOUT_MS}
                                    max={MAX_TIMEOUT_MS}
                                    step={1000}
                                    value={aiTimeoutMs}
                                    onChange={(e) => handleTimeoutChange(e.target.value)}
                                    aria-label={t('settings.workspace.timeout')}
                                />
                                <span className="timeout-unit">ms</span>
                                <span className="timeout-preview">{Math.round(aiTimeoutMs / 1000)}s</span>
                            </div>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.ollama.title')}</h2>
                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.ollama.url')}</span>
                                <span className="setting-description">{t('settings.ollama.description')}</span>
                            </div>
                            <div className="timeout-row">
                                <input
                                    type="text"
                                    className="timeout-input"
                                    style={{ flex: 1, minWidth: '200px' }}
                                    value={ollamaUrl}
                                    onChange={(e) => handleOllamaUrlChange(e.target.value)}
                                    placeholder="http://localhost:11434"
                                />
                                <button
                                    type="button"
                                    className={`mode-option ${ollamaStatus === 'ok' ? 'active' : ''}`}
                                    onClick={handleTestOllama}
                                    disabled={ollamaStatus === 'testing'}
                                >
                                    {ollamaStatus === 'testing'
                                        ? t('settings.ollama.testing')
                                        : ollamaStatus === 'ok'
                                            ? t('settings.ollama.connected')
                                            : ollamaStatus === 'error'
                                                ? t('settings.ollama.retry')
                                                : t('settings.ollama.test')}
                                </button>
                            </div>
                            {ollamaStatus === 'ok' && ollamaModels.length > 0 && (
                                <div className="mode-options" style={{ marginTop: '8px' }}>
                                    {ollamaModels.map((m) => (
                                        <span key={m} className="mode-option active" style={{ cursor: 'default', fontSize: '12px' }}>{m}</span>
                                    ))}
                                </div>
                            )}
                            {ollamaStatus === 'error' && (
                                <span className="setting-description" style={{ color: 'var(--color-error, #f44)' }}>
                                    {t('settings.ollama.error')}
                                </span>
                            )}
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.tools.title')}</h2>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.tools.enabled')}</span>
                                <span className="setting-description">{t('settings.tools.description')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${toolCallingEnabled ? 'dark' : 'light'}`}
                                onClick={handleToolCallingChange}
                                aria-label={t('settings.tools.enabled')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.CONFIG} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <span className="setting-description">{t('settings.tools.fallback')}</span>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.localSave.title')}</h2>
                        <span className="setting-description" style={{ marginBottom: '12px', display: 'block' }}>
                            {t('settings.localSave.description')}
                        </span>
                        <div className="setting-row setting-row-stacked">
                            <span className="setting-label">{t('settings.localSave.mode')}</span>
                            <div className="mode-options">
                                {['project', 'browser-download', 'configured-directory', 'local-server'].map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        className={`mode-option ${localSaveSettings.mode === mode ? 'active' : ''}`}
                                        onClick={() => updateLocalSaveSettings({ mode })}
                                    >
                                        {t(`settings.localSave.modes.${mode}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="setting-row setting-row-stacked">
                            <span className="setting-label">{t('settings.localSave.filename')}</span>
                            <input
                                type="text"
                                className="timeout-input"
                                value={localSaveSettings.filenameTemplate}
                                onChange={(event) => updateLocalSaveSettings({ filenameTemplate: event.target.value })}
                            />
                        </div>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.localSave.autoSave')}</span>
                                <span className="setting-description">{t('settings.localSave.autoSaveDescription')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${localSaveSettings.autoSaveGeneratedImages ? 'dark' : 'light'}`}
                                onClick={() => updateLocalSaveSettings({ autoSaveGeneratedImages: !localSaveSettings.autoSaveGeneratedImages })}
                                aria-label={t('settings.localSave.autoSave')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.ADDED} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.localSave.requireApproval')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${localSaveSettings.requireApproval ? 'dark' : 'light'}`}
                                onClick={() => updateLocalSaveSettings({ requireApproval: !localSaveSettings.requireApproval })}
                                aria-label={t('settings.localSave.requireApproval')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.INFO} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.localSave.allowLocalWrites')}</span>
                                <span className="setting-description">{t('settings.localSave.allowLocalWritesDescription')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${localSaveSettings.allowLocalWrites ? 'dark' : 'light'}`}
                                onClick={() => updateLocalSaveSettings({ allowLocalWrites: !localSaveSettings.allowLocalWrites })}
                                aria-label={t('settings.localSave.allowLocalWrites')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.CONFIG} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.localSave.allowOverwrite')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${localSaveSettings.allowOverwrite ? 'dark' : 'light'}`}
                                onClick={() => updateLocalSaveSettings({ allowOverwrite: !localSaveSettings.allowOverwrite })}
                                aria-label={t('settings.localSave.allowOverwrite')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.INFO} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">{t('settings.localSave.allowMultipleImages')}</span>
                            </div>
                            <button
                                className={`theme-toggle ${localSaveSettings.allowMultipleImages ? 'dark' : 'light'}`}
                                onClick={() => updateLocalSaveSettings({ allowMultipleImages: !localSaveSettings.allowMultipleImages })}
                                aria-label={t('settings.localSave.allowMultipleImages')}
                            >
                                <span className="toggle-track"><span className="toggle-thumb" /></span>
                                <Icon src={ICONS.CONFIG} size="xs" className="toggle-icon" />
                            </button>
                        </div>
                        <div className="setting-row setting-row-stacked">
                            <span className="setting-label">{t('settings.localSave.maxImagesPerTask')}</span>
                            <input
                                type="number"
                                className="timeout-input"
                                min="1"
                                max="12"
                                value={localSaveSettings.maxImagesPerTask}
                                onChange={(event) => updateLocalSaveSettings({ maxImagesPerTask: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })}
                                aria-label={t('settings.localSave.maxImagesPerTask')}
                            />
                        </div>
                        <div className="timeout-row">
                            <Button variant="secondary" onClick={handleChooseLocalDirectory}>
                                {t('settings.localSave.chooseDirectory')}
                            </Button>
                            {directoryName && <span className="setting-description">{directoryName}</span>}
                        </div>
                        {localSaveSettings.mode === 'local-server' && (
                            <div className="timeout-row" style={{ marginTop: '8px' }}>
                                <input
                                    type="text"
                                    className="timeout-input"
                                    value={localSaveSettings.serverBaseUrl}
                                    onChange={(event) => updateLocalSaveSettings({ serverBaseUrl: event.target.value, serverEnabled: true })}
                                    aria-label={t('settings.localSave.serverUrl')}
                                />
                            </div>
                        )}
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.skills.title')}</h2>
                        <span className="setting-description" style={{ marginBottom: '12px', display: 'block' }}>
                            {t('settings.skills.description')}
                        </span>
                        <div className="mode-options">
                            {SKILLS.map((skill) => (
                                <button
                                    key={skill.id}
                                    type="button"
                                    className={`mode-option ${activeSkill === skill.id ? 'active' : ''}`}
                                    onClick={() => handleSkillChange(skill.id)}
                                >
                                    {language === 'es' && skill.nameEs ? skill.nameEs : skill.name}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.about.title')}</h2>
                        <div className="about-info">
                            <div className="about-logo">
                                <Icon src={ICONS.LOGO} size={48} />
                            </div>
                            <span className="about-name">OpenContent IDE</span>
                            <span className="about-version">v{import.meta.env.VITE_APP_VERSION || '0.1.0'}</span>
                            <span className="about-powered">{t('settings.about.donatedBy')}</span>
                            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="about-link">
                                {REPO_URL}
                            </a>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

export default Settings;
