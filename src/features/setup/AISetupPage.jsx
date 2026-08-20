import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, STORAGE_KEYS } from '../../config/constants';
import { useLanguage } from '../../context/LanguageContext';
import {
    getActiveImageModel,
    getActiveTextModel,
    getActiveVisionModel,
    getApiKey,
    isAIConfigured,
    saveApiKey,
    setActiveModels
} from '../../services/ai';
import { addModel, getStoredModels, MODEL_TYPES, PROVIDERS, removeModel } from '../../services/models';
import './AISetupPage.css';

const PROVIDER_LABELS = {
    [PROVIDERS.OPENROUTER]: 'OpenRouter',
    [PROVIDERS.OPENAI]: 'OpenAI',
    [PROVIDERS.GOOGLE]: 'Google',
    [PROVIDERS.ANTHROPIC]: 'Anthropic',
    [PROVIDERS.OLLAMA]: 'Ollama',
    [PROVIDERS.CUSTOM]: 'Custom OpenAI-compatible'
};

const KEY_PROVIDERS = [PROVIDERS.OPENROUTER, PROVIDERS.OPENAI, PROVIDERS.GOOGLE, PROVIDERS.ANTHROPIC, PROVIDERS.CUSTOM];
const EMPTY_CAPABILITIES = { text: false, vision: false, imageGeneration: false, toolCalling: false, imageEditing: false };

function createEmptyModel() {
    return { id: '', nickname: '', provider: '', type: MODEL_TYPES.TEXT, baseUrl: '', capabilities: { ...EMPTY_CAPABILITIES } };
}

export default function AISetupPage() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [models, setModels] = useState(() => getStoredModels());
    const [activeText, setActiveText] = useState(() => getActiveTextModel() || '');
    const [activeVision, setActiveVision] = useState(() => getActiveVisionModel() || '');
    const [activeImage, setActiveImage] = useState(() => getActiveImageModel() || '');
    const [keys, setKeys] = useState(() => Object.fromEntries(KEY_PROVIDERS.map((provider) => [provider, getApiKey(provider)])));
    const [savedProvider, setSavedProvider] = useState('');
    const [showKeys, setShowKeys] = useState(false);
    const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || 'http://localhost:11434');
    const [ollamaState, setOllamaState] = useState('idle');
    const [ollamaModels, setOllamaModels] = useState([]);
    const [newModel, setNewModel] = useState(createEmptyModel);
    const [modelError, setModelError] = useState('');

    const textModels = useMemo(() => models.filter((model) => model.capabilities?.text), [models]);
    const visionModels = useMemo(() => models.filter((model) => model.capabilities?.vision), [models]);
    const imageModels = useMemo(() => models.filter((model) => model.capabilities?.imageGeneration), [models]);
    const ready = Boolean(activeText && isAIConfigured());

    const refreshModels = () => {
        const next = getStoredModels();
        setModels(next);
        const ids = new Set(next.map((model) => model.id));
        if (activeText && !ids.has(activeText)) { setActiveText(''); setActiveModels(null, undefined, undefined); }
        if (activeVision && !ids.has(activeVision)) { setActiveVision(''); setActiveModels(undefined, undefined, null); }
        if (activeImage && !ids.has(activeImage)) { setActiveImage(''); setActiveModels(undefined, null, undefined); }
    };

    const saveProviderKey = (provider) => {
        saveApiKey(provider, keys[provider] || '');
        setSavedProvider(provider);
        window.setTimeout(() => setSavedProvider(''), 1800);
    };

    const saveOllamaEndpoint = () => {
        const value = ollamaUrl.trim();
        if (value) localStorage.setItem(STORAGE_KEYS.OLLAMA_URL, value.replace(/\/$/, ''));
        else localStorage.removeItem(STORAGE_KEYS.OLLAMA_URL);
    };

    const discoverOllama = async () => {
        const baseUrl = ollamaUrl.trim().replace(/\/$/, '');
        if (!baseUrl) return;
        saveOllamaEndpoint();
        setOllamaState('loading');
        setOllamaModels([]);
        try {
            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setOllamaModels((data.models || []).map((model) => model.name || model.model).filter(Boolean));
            setOllamaState('ready');
        } catch {
            setOllamaState('error');
        }
    };

    const prefillOllamaModel = (id) => {
        setNewModel({
            id,
            nickname: id,
            provider: PROVIDERS.OLLAMA,
            type: MODEL_TYPES.TEXT,
            baseUrl: ollamaUrl.trim().replace(/\/$/, ''),
            capabilities: { ...EMPTY_CAPABILITIES }
        });
        setModelError('');
        document.getElementById('oc-register-model')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const toggleCapability = (key) => setNewModel((current) => ({
        ...current,
        capabilities: { ...current.capabilities, [key]: !current.capabilities[key] }
    }));

    const registerModel = () => {
        setModelError('');
        if (!Object.values(newModel.capabilities).some(Boolean)) {
            setModelError(t('setup.capabilityRequired'));
            return;
        }
        try {
            addModel(newModel);
            setNewModel(createEmptyModel());
            refreshModels();
        } catch (error) {
            setModelError(error?.message || t('setup.modelAddFailed'));
        }
    };

    const changeActive = (kind, value) => {
        if (kind === 'text') {
            setActiveText(value);
            setActiveModels(value || null, undefined, undefined);
        } else if (kind === 'vision') {
            setActiveVision(value);
            setActiveModels(undefined, undefined, value || null);
        } else {
            setActiveImage(value);
            setActiveModels(undefined, value || null, undefined);
        }
    };

    return (
        <div className="oc-setup-page">
            <header className="oc-setup-header">
                <button type="button" className="oc-setup-back" onClick={() => navigate(-1)}>← {t('common.back')}</button>
                <div>
                    <h1>{t('setup.title')}</h1>
                    <p>{t('setup.subtitle')}</p>
                </div>
                <button type="button" className="oc-setup-settings" onClick={() => navigate(ROUTES.SETTINGS)}>{t('settings.title')}</button>
            </header>

            <main className="oc-setup-main">
                <section className="oc-setup-progress" aria-label={t('setup.progress')}>
                    <div className={`oc-setup-step ${KEY_PROVIDERS.some((provider) => Boolean(getApiKey(provider))) || localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) ? 'done' : ''}`}>
                        <strong>1</strong><span>{t('setup.stepProvider')}</span>
                    </div>
                    <div className={`oc-setup-step ${models.length ? 'done' : ''}`}>
                        <strong>2</strong><span>{t('setup.stepModel')}</span>
                    </div>
                    <div className={`oc-setup-step ${activeText ? 'done' : ''}`}>
                        <strong>3</strong><span>{t('setup.stepSelect')}</span>
                    </div>
                </section>

                <section className="oc-setup-card">
                    <div className="oc-setup-card-heading">
                        <div><span className="oc-setup-eyebrow">01</span><h2>{t('setup.providersTitle')}</h2></div>
                        <button type="button" className="oc-setup-quiet" onClick={() => setShowKeys((value) => !value)}>{showKeys ? t('settings.apiKeys.hide') : t('settings.apiKeys.show')}</button>
                    </div>
                    <p>{t('setup.providersDescription')}</p>
                    <div className="oc-provider-grid">
                        {KEY_PROVIDERS.map((provider) => (
                            <label className="oc-provider-card" key={provider}>
                                <span className="oc-provider-title">{PROVIDER_LABELS[provider]}</span>
                                <span className="oc-provider-hint">{provider === PROVIDERS.CUSTOM ? t('setup.customKeyOptional') : t('setup.keyStoredLocally')}</span>
                                <div className="oc-provider-input-row">
                                    <input
                                        type={showKeys ? 'text' : 'password'}
                                        value={keys[provider] || ''}
                                        onChange={(event) => setKeys((current) => ({ ...current, [provider]: event.target.value }))}
                                        placeholder={t('setup.apiKeyPlaceholder')}
                                        autoComplete="off"
                                    />
                                    <button type="button" onClick={() => saveProviderKey(provider)}>{savedProvider === provider ? t('ux.saved') : t('common.save')}</button>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="oc-local-provider">
                        <div>
                            <span className="oc-provider-title">{t('setup.localProvider')}</span>
                            <p>{t('setup.localProviderDescription')}</p>
                        </div>
                        <div className="oc-provider-input-row">
                            <input value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} placeholder="http://localhost:11434" />
                            <button type="button" onClick={discoverOllama} disabled={ollamaState === 'loading'}>
                                {ollamaState === 'loading' ? t('setup.discovering') : t('setup.discoverModels')}
                            </button>
                        </div>
                        {ollamaState === 'error' && <div className="oc-setup-error">{t('setup.localProviderError')}</div>}
                        {ollamaState === 'ready' && (
                            <div className="oc-discovered-models">
                                {ollamaModels.length === 0 ? <span>{t('setup.noLocalModels')}</span> : ollamaModels.map((id) => (
                                    <button type="button" key={id} onClick={() => prefillOllamaModel(id)}>{id} <span>{t('setup.useInForm')}</span></button>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section id="oc-register-model" className="oc-setup-card">
                    <div className="oc-setup-card-heading"><div><span className="oc-setup-eyebrow">02</span><h2>{t('setup.modelsTitle')}</h2></div><span>{models.length} {t('setup.registered')}</span></div>
                    <p>{t('setup.modelsDescription')}</p>

                    {models.length === 0 ? <div className="oc-setup-empty">{t('setup.noModels')}</div> : (
                        <div className="oc-registered-models">
                            {models.map((model) => (
                                <div className="oc-registered-model" key={model.id}>
                                    <div><strong>{model.nickname || model.id}</strong><code>{model.id}</code></div>
                                    <div className="oc-model-tags">
                                        <span>{PROVIDER_LABELS[model.provider] || model.provider}</span>
                                        {Object.entries(model.capabilities || {}).filter(([, enabled]) => enabled).map(([capability]) => <span key={capability}>{capability}</span>)}
                                    </div>
                                    <button type="button" className="oc-danger-quiet" onClick={() => { if (window.confirm(t('ux.deleteConfirm'))) { removeModel(model.id); refreshModels(); } }}>{t('common.delete')}</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="oc-model-form">
                        <h3>{t('setup.registerModel')}</h3>
                        {modelError && <div className="oc-setup-error">{modelError}</div>}
                        <div className="oc-form-grid">
                            <label><span>{t('setup.modelId')}</span><input value={newModel.id} onChange={(event) => setNewModel((current) => ({ ...current, id: event.target.value }))} placeholder="provider/model-id" /></label>
                            <label><span>{t('setup.nickname')}</span><input value={newModel.nickname} onChange={(event) => setNewModel((current) => ({ ...current, nickname: event.target.value }))} placeholder={t('setup.nicknameOptional')} /></label>
                            <label><span>{t('setup.provider')}</span><select value={newModel.provider} onChange={(event) => setNewModel((current) => ({ ...current, provider: event.target.value }))}><option value="">{t('settings.models.selectProvider')}</option>{Object.values(PROVIDERS).map((provider) => <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>)}</select></label>
                            <label><span>{t('setup.modelType')}</span><select value={newModel.type} onChange={(event) => setNewModel((current) => ({ ...current, type: event.target.value }))}>{Object.values(MODEL_TYPES).map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                        </div>
                        {(newModel.provider === PROVIDERS.CUSTOM || newModel.provider === PROVIDERS.OLLAMA) && (
                            <label className="oc-full-field"><span>{t('setup.baseUrl')}</span><input value={newModel.baseUrl} onChange={(event) => setNewModel((current) => ({ ...current, baseUrl: event.target.value }))} placeholder={newModel.provider === PROVIDERS.OLLAMA ? ollamaUrl : 'https://provider.example/v1'} /></label>
                        )}
                        <div className="oc-capabilities" aria-label={t('setup.capabilities')}>
                            {[
                                ['text', t('settings.models.text')],
                                ['vision', t('settings.models.vision')],
                                ['imageGeneration', t('settings.models.image')],
                                ['toolCalling', t('settings.models.tools')],
                                ['imageEditing', t('settings.models.editing')]
                            ].map(([key, label]) => <button type="button" key={key} className={newModel.capabilities[key] ? 'active' : ''} onClick={() => toggleCapability(key)} aria-pressed={newModel.capabilities[key]}>{label}</button>)}
                        </div>
                        <button type="button" className="oc-primary-action" onClick={registerModel} disabled={!newModel.id.trim() || !newModel.provider}>{t('setup.registerModel')}</button>
                    </div>
                </section>

                <section className="oc-setup-card">
                    <div className="oc-setup-card-heading"><div><span className="oc-setup-eyebrow">03</span><h2>{t('setup.activeModelsTitle')}</h2></div><span className={`oc-ready-badge ${ready ? 'ready' : ''}`}>{ready ? t('setup.ready') : t('setup.notReady')}</span></div>
                    <p>{t('setup.activeModelsDescription')}</p>
                    <div className="oc-active-model-grid">
                        <label><span>{t('workspace.model.textLabel')}</span><select value={activeText} onChange={(event) => changeActive('text', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{textModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                        <label><span>{t('workspace.model.visionLabel')}</span><select value={activeVision} onChange={(event) => changeActive('vision', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{visionModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                        <label><span>{t('workspace.model.imageLabel')}</span><select value={activeImage} onChange={(event) => changeActive('image', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                    </div>
                    <div className="oc-setup-final-actions">
                        <p>{t('workspace.model.chooseExplicitly')}</p>
                        <button type="button" className="oc-primary-action" onClick={() => navigate(ROUTES.WORKSPACE)} disabled={!activeText}>{t('setup.openWorkspace')}</button>
                    </div>
                </section>
            </main>
        </div>
    );
}
