import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
    addModel,
    addModelsFromDiscovery,
    getStoredModels,
    MODEL_TYPES,
    PROVIDERS,
    removeModel
} from '../../services/models';
import {
    CAPABILITY_FIELDS,
    detectCapabilities,
    detectCapabilitiesForSelection,
    discoverProviderModels
} from '../../services/models/providerDiscovery';
import './AISetupPage.css';

const PROVIDER_LABELS = {
    [PROVIDERS.OPENROUTER]: 'OpenRouter',
    [PROVIDERS.OPENAI]: 'OpenAI',
    [PROVIDERS.GOOGLE]: 'Google',
    [PROVIDERS.ANTHROPIC]: 'Anthropic',
    [PROVIDERS.OLLAMA]: 'Ollama',
    [PROVIDERS.CUSTOM]: 'Custom OpenAI-compatible'
};

const PROVIDER_ORDER = [
    PROVIDERS.OPENAI,
    PROVIDERS.OPENROUTER,
    PROVIDERS.GOOGLE,
    PROVIDERS.ANTHROPIC,
    PROVIDERS.OLLAMA,
    PROVIDERS.CUSTOM
];

const KEY_PROVIDERS = [PROVIDERS.OPENAI, PROVIDERS.OPENROUTER, PROVIDERS.GOOGLE, PROVIDERS.ANTHROPIC];
const BASE_URL_PROVIDERS = [PROVIDERS.OLLAMA, PROVIDERS.CUSTOM];
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const STEP_LABELS = [
    'setup.onboarding.stepProvider',
    'setup.onboarding.stepKey',
    'setup.onboarding.stepModel'
];
// The capability flags come from the discovery service so the detection rules
// and the toggles can never drift apart.
const CAPABILITY_KEYS = CAPABILITY_FIELDS;
const EMPTY_CAPABILITIES = {
    text: false,
    vision: false,
    imageGeneration: false,
    toolCalling: false,
    imageEditing: false
};
const DISCOVERY_ERROR_KEYS = {
    PROVIDER_LIST_UNAUTHORIZED: 'setup.discovery.errorUnauthorized',
    PROVIDER_LIST_RATE_LIMITED: 'setup.discovery.errorRateLimited',
    PROVIDER_LIST_NETWORK_ERROR: 'setup.discovery.errorNetwork',
    PROVIDER_LIST_TIMEOUT: 'setup.discovery.errorTimeout',
    PROVIDER_LIST_ABORTED: 'setup.discovery.errorAborted',
    PROVIDER_LIST_PROVIDER_DOWN: 'setup.discovery.errorProviderDown'
};
const REGISTRY_ERROR_KEYS = {
    MODEL_PROVIDER_REQUIRED: 'setup.provider',
    MODEL_BASE_URL_REQUIRED: 'setup.discovery.baseUrlRequired',
    MODEL_CAPABILITIES_REQUIRED: 'setup.capabilityRequired'
};

function normalizeUrl(value) {
    return String(value || '').trim().replace(/\/$/, '');
}

const DISCOVERY_CAPABILITY_KEYS = {
    text: 'text',
    vision: 'vision',
    imageGeneration: 'image',
    toolCalling: 'tools',
    imageEditing: 'editing'
};

export default function AISetupPage() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [models, setModels] = useState(() => getStoredModels());
    const [activeText, setActiveText] = useState(() => getActiveTextModel() || '');
    const [activeVision, setActiveVision] = useState(() => getActiveVisionModel() || '');
    const [activeImage, setActiveImage] = useState(() => getActiveImageModel() || '');
    const [provider, setProvider] = useState('');
    const [keyDraft, setKeyDraft] = useState('');
    const [baseUrlDraft, setBaseUrlDraft] = useState('');
    const [step, setStep] = useState(1);
    const [showKey, setShowKey] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [discoveryState, setDiscoveryState] = useState('idle');
    const [discovery, setDiscovery] = useState({ supported: true, reason: null, models: [], error: null });
    const [selectedIds, setSelectedIds] = useState([]);
    const [capabilities, setCapabilities] = useState(() => ({ ...EMPTY_CAPABILITIES }));
    const [capabilitiesTouched, setCapabilitiesTouched] = useState(false);
    const [manualId, setManualId] = useState('');
    const [modelFilter, setModelFilter] = useState('');
    const [modelError, setModelError] = useState('');
    const discoveryAbort = useRef(null);
    const stepHeading = useRef(null);

    const textModels = useMemo(() => models.filter((model) => model.capabilities?.text), [models]);
    const visionModels = useMemo(() => models.filter((model) => model.capabilities?.vision), [models]);
    const imageModels = useMemo(() => models.filter((model) => model.capabilities?.imageGeneration), [models]);
    const ready = Boolean(activeText && isAIConfigured());

    const providerLabel = provider ? (PROVIDER_LABELS[provider] || provider) : '';
    const requiresKey = KEY_PROVIDERS.includes(provider);
    const optionalKey = provider === PROVIDERS.CUSTOM;
    const requiresBaseUrl = BASE_URL_PROVIDERS.includes(provider);
    const providerBaseUrl = requiresBaseUrl ? normalizeUrl(baseUrlDraft) : '';

    // The step is complete on the credential the user will actually end up
    // with, not only on the one already persisted. Reading only `getApiKey`
    // would leave the save button disabled on a fresh install, because the
    // first key is the very thing this step has to store.
    const effectiveKey = keyDraft.trim() || getApiKey(provider);

    const stepComplete = [
        Boolean(provider),
        requiresBaseUrl ? Boolean(providerBaseUrl) : (!requiresKey || Boolean(effectiveKey)),
        models.length > 0
    ];

    useEffect(() => () => discoveryAbort.current?.abort(), []);

    // What the provider itself says about whatever is about to be registered.
    // A typed id that exists in the discovered list is the most specific thing
    // the user can point at, so it wins over the checkbox selection; anything
    // the provider did not report stays unreported instead of being assumed.
    const detection = useMemo(() => {
        const typedId = manualId.trim();
        if (typedId) {
            const match = discovery.models.find((model) => model.id === typedId);
            if (match) return { ...detectCapabilities(match), origin: 'manual' };
        }
        return {
            ...detectCapabilitiesForSelection(discovery.models.filter((model) => selectedIds.includes(model.id))),
            origin: 'selection'
        };
    }, [discovery.models, manualId, selectedIds]);

    // Detection is a starting point, never an imposition: the first time the
    // user presses a toggle their decision wins and stops the sync.
    useEffect(() => {
        if (capabilitiesTouched || detection.source !== 'provider') return;
        setCapabilities({ ...EMPTY_CAPABILITIES, ...detection.capabilities });
    }, [capabilitiesTouched, detection]);

    useEffect(() => {
        if (provider) {
            setKeyDraft(getApiKey(provider));
            setBaseUrlDraft(
                provider === PROVIDERS.OLLAMA
                    ? (localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || DEFAULT_OLLAMA_URL)
                    : ''
            );
        } else {
            setKeyDraft('');
            setBaseUrlDraft('');
        }
        setShowKey(false);
        setDiscoveryState('idle');
        setDiscovery({ supported: true, reason: null, models: [], error: null });
        setSelectedIds([]);
        setCapabilities({ ...EMPTY_CAPABILITIES });
    }, [provider]);

    useEffect(() => {
        stepHeading.current?.focus();
    }, [step]);

    const refreshModels = useCallback(() => {
        const next = getStoredModels();
        setModels(next);
        const ids = new Set(next.map((model) => model.id));
        if (activeText && !ids.has(activeText)) { setActiveText(''); setActiveModels(null, undefined, undefined); }
        if (activeVision && !ids.has(activeVision)) { setActiveVision(''); setActiveModels(undefined, undefined, null); }
        if (activeImage && !ids.has(activeImage)) { setActiveImage(''); setActiveModels(undefined, null, undefined); }
    }, [activeImage, activeText, activeVision]);

    const goToStep = (target) => {
        const next = Math.min(3, Math.max(1, target));
        setStep(next);
        setFeedback('');
        setModelError('');
    };

    const handleProviderChange = (value) => {
        setProvider(value);
        setModelError('');
        setManualId('');
    };

    const saveCredentials = () => {
        if (requiresKey) saveApiKey(provider, keyDraft.trim());
        if (provider === PROVIDERS.OLLAMA) {
            const value = normalizeUrl(baseUrlDraft);
            if (value) localStorage.setItem(STORAGE_KEYS.OLLAMA_URL, value);
            else localStorage.removeItem(STORAGE_KEYS.OLLAMA_URL);
        }
        goToStep(3);
        setFeedback(t('setup.discovery.credentialsHint'));
    };

    const resetDiscovery = () => {
        setDiscoveryState('idle');
        setDiscovery({ supported: true, reason: null, models: [], error: null });
        setSelectedIds([]);
        setModelFilter('');
        setCapabilities({ ...EMPTY_CAPABILITIES });
        setCapabilitiesTouched(false);
    };

    const runDiscovery = async () => {
        if (!provider) {
            setModelError(t('setup.discovery.keyRequired', { provider: providerLabel }));
            return;
        }
        if (requiresKey && !getApiKey(provider)) {
            setModelError(t('setup.discovery.keyRequired', { provider: providerLabel }));
            return;
        }
        if (requiresBaseUrl && !providerBaseUrl) {
            setModelError(t('setup.discovery.baseUrlRequired'));
            return;
        }
        discoveryAbort.current?.abort();
        const controller = new AbortController();
        discoveryAbort.current = controller;
        setModelError('');
        setDiscoveryState('loading');
        setFeedback('');
        setSelectedIds([]);
        setCapabilities({ ...EMPTY_CAPABILITIES });
        const result = await discoverProviderModels({
            provider,
            apiKey: getApiKey(provider),
            baseUrl: providerBaseUrl,
            signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setDiscovery(result);
        setDiscoveryState(result.error ? 'error' : (result.supported ? (result.models.length ? 'ready' : 'empty') : 'unsupported'));
    };

    const toggleSelected = (id) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    };

    const toggleCapability = (key) => {
        setCapabilitiesTouched(true);
        setCapabilities((current) => ({ ...current, [key]: !current[key] }));
    };

    const registerDiscovered = () => {
        setModelError('');
        if (selectedIds.length === 0) {
            setModelError(t('setup.discovery.registerNone'));
            return;
        }
        const entries = discovery.models.filter((model) => selectedIds.includes(model.id));
        try {
            const { added, skipped } = addModelsFromDiscovery(entries, { provider, baseUrl: providerBaseUrl, capabilities });
            if (added.length === 0) {
                setModelError(t('setup.discovery.registeredSkipped', { count: skipped.length }));
                return;
            }
            setFeedback([
                t('setup.discovery.registeredOk', { count: added.length }),
                ...(skipped.length ? [t('setup.discovery.registeredSkipped', { count: skipped.length })] : [])
            ].join(' '));
            refreshModels();
            resetDiscovery();
        } catch (error) {
            setModelError(t(REGISTRY_ERROR_KEYS[error?.code] || 'setup.discovery.addFailed'));
        }
    };

    const registerManual = () => {
        setModelError('');
        const id = manualId.trim();
        if (!id) {
            setModelError(t('setup.discovery.manualIdLabel'));
            return;
        }
        if (models.some((model) => model.id === id)) {
            setModelError(t('setup.discovery.registeredSkipped', { count: 1 }));
            return;
        }
        try {
            addModel({
                id,
                provider,
                type: MODEL_TYPES.TEXT,
                baseUrl: providerBaseUrl,
                capabilities: { ...capabilities }
            });
            setManualId('');
            setFeedback(t('setup.discovery.registeredOk', { count: 1 }));
            refreshModels();
        } catch (error) {
            setModelError(t(REGISTRY_ERROR_KEYS[error?.code] || 'setup.discovery.addFailed'));
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

    const errorMessage = discovery.error
        ? t(DISCOVERY_ERROR_KEYS[discovery.error.code] || 'setup.discovery.errorGeneric')
        : '';
    const unsupportedMessage = !discovery.supported
        ? (discovery.reason === 'API_KEY_REQUIRED'
            ? t('setup.discovery.keyRequired', { provider: providerLabel })
            : (discovery.reason === 'BASE_URL_REQUIRED'
                ? t('setup.discovery.baseUrlRequired')
                : t('setup.discovery.unsupportedBody', { provider: providerLabel })))
        : '';

    // Providers such as OpenRouter can return hundreds of entries. Rendering
    // every one as a checkbox is unusable, so the list is filtered and the
    // manual field is always available for someone who already knows the id.
    const LIST_FILTER_THRESHOLD = 8;
    const filterable = discovery.models.length > LIST_FILTER_THRESHOLD;
    const visibleModels = useMemo(() => {
        const query = modelFilter.trim().toLowerCase();
        if (!query) return discovery.models;
        return discovery.models.filter((model) =>
            [model.id, model.label, model.ownedBy, model.contextHint]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query));
    }, [discovery.models, modelFilter]);

    const toggleVisible = () => {
        const ids = visibleModels.map((model) => model.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
        setSelectedIds((current) => (allSelected
            ? current.filter((id) => !ids.includes(id))
            : [...new Set([...current, ...ids])]));
    };

    return (
        <div className="oc-setup-page">
            <header className="oc-setup-header">
                <button type="button" className="oc-setup-back" onClick={() => navigate(-1)}>&larr; {t('common.back')}</button>
                <div>
                    <h1>{t('setup.title')}</h1>
                    <p>{t('setup.subtitle')}</p>
                </div>
                <button type="button" className="oc-setup-settings" onClick={() => navigate(ROUTES.SETTINGS)}>{t('settings.title')}</button>
            </header>

            <main className="oc-setup-main">
                <section className="oc-setup-intro">
                    <h2>{t('setup.onboarding.heading')}</h2>
                    <p>{t('setup.onboarding.description')}</p>
                    <p className="oc-setup-intro-hint">{t('setup.onboarding.jumpHint')}</p>
                </section>

                <nav className="oc-setup-progress" aria-label={t('setup.progress')}>
                    {STEP_LABELS.map((labelKey, index) => {
                        const stepNumber = index + 1;
                        const stateClass = stepComplete[index] ? 'done' : (stepNumber === step ? 'current' : 'todo');
                        return (
                            <button
                                type="button"
                                key={labelKey}
                                className={`oc-setup-step ${stateClass}`}
                                aria-current={stepNumber === step ? 'step' : undefined}
                                onClick={() => goToStep(stepNumber)}
                            >
                                <strong>{stepNumber}</strong>
                                <span>{t(labelKey)}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="oc-setup-step-announcer" role="status" aria-live="polite">
                    {t('setup.onboarding.stepStatus', { current: step, total: STEP_LABELS.length, label: t(STEP_LABELS[step - 1]) })}
                </div>

                {step === 1 && (
                    <section className="oc-setup-card">
                        <div className="oc-setup-card-heading">
                            <div><span className="oc-setup-eyebrow">01</span><h2 ref={stepHeading} tabIndex={-1}>{t('setup.onboarding.stepProvider')}</h2></div>
                        </div>
                        <p>{t('setup.discovery.providerLegend')}</p>
                        <fieldset className="oc-provider-choice">
                            <legend className="oc-visually-hidden">{t('setup.discovery.providerLegend')}</legend>
                            {PROVIDER_ORDER.map((value) => (
                                <label className={`oc-provider-option ${provider === value ? 'selected' : ''}`} key={value}>
                                    <input
                                        type="radio"
                                        name="oc-setup-provider"
                                        value={value}
                                        checked={provider === value}
                                        onChange={() => handleProviderChange(value)}
                                    />
                                    <span className="oc-provider-title">{PROVIDER_LABELS[value]}</span>
                                    <span className="oc-provider-hint">{t(`setup.discovery.providerHints.${value}`)}</span>
                                </label>
                            ))}
                        </fieldset>
                        <div className="oc-setup-final-actions">
                            <p />
                            <button
                                type="button"
                                className="oc-primary-action"
                                onClick={() => goToStep(2)}
                                disabled={!stepComplete[0]}
                            >
                                {t('setup.onboarding.next')}
                            </button>
                        </div>
                    </section>
                )}

                {step === 2 && (
                    <section className="oc-setup-card">
                        <div className="oc-setup-card-heading">
                            <div>
                                <span className="oc-setup-eyebrow">02</span>
                                <h2 ref={stepHeading} tabIndex={-1}>{t('setup.onboarding.stepKey')}</h2>
                            </div>
                            <span className="oc-setup-step-provider">{providerLabel}</span>
                        </div>
                        <p>{provider ? t(`setup.discovery.providerHints.${provider}`) : t('setup.onboarding.description')}</p>

                        {requiresBaseUrl && (
                            <div className="oc-credentials-field">
                                <label htmlFor="oc-setup-base-url">
                                    {provider === PROVIDERS.OLLAMA ? t('setup.discovery.baseUrlLabel') : t('setup.discovery.baseUrlCustomLabel')}
                                </label>
                                <input
                                    id="oc-setup-base-url"
                                    type="url"
                                    value={baseUrlDraft}
                                    onChange={(event) => setBaseUrlDraft(event.target.value)}
                                    aria-describedby="oc-setup-base-url-help"
                                    autoComplete="off"
                                    spellCheck="false"
                                />
                                <p className="oc-credentials-help" id="oc-setup-base-url-help">
                                    {provider === PROVIDERS.OLLAMA ? t('setup.discovery.baseUrlHelp') : t('setup.discovery.baseUrlCustomHelp')}
                                </p>
                            </div>
                        )}

                        {(requiresKey || optionalKey) && (
                            <div className="oc-credentials-field">
                                <label htmlFor="oc-setup-api-key">{t('setup.discovery.keyLabel', { provider: providerLabel })}</label>
                                <div className="oc-provider-input-row">
                                    <input
                                        id="oc-setup-api-key"
                                        type={showKey ? 'text' : 'password'}
                                        value={keyDraft}
                                        onChange={(event) => setKeyDraft(event.target.value)}
                                        aria-describedby="oc-setup-api-key-help oc-setup-api-key-privacy"
                                        autoComplete="off"
                                        spellCheck="false"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey((value) => !value)}
                                        aria-pressed={showKey}
                                    >
                                        {showKey ? t('setup.discovery.hideKey') : t('setup.discovery.showKey')}
                                    </button>
                                </div>
                                <p className="oc-credentials-help" id="oc-setup-api-key-help">
                                    {optionalKey ? t('setup.discovery.keyOptional') : t('setup.discovery.keyHelp')}
                                </p>
                                <p className="oc-credentials-privacy" id="oc-setup-api-key-privacy">
                                    {t('setup.discovery.keyPrivacy', { provider: providerLabel })}
                                </p>
                            </div>
                        )}

                        {modelError && <div className="oc-setup-error" role="alert">{modelError}</div>}

                        <div className="oc-setup-final-actions">
                            <button type="button" className="oc-setup-quiet" onClick={() => goToStep(1)}>
                                {t('setup.onboarding.back')}
                            </button>
                            <button type="button" className="oc-primary-action" onClick={saveCredentials} disabled={!stepComplete[1]}>
                                {t('setup.discovery.saveCredentials')}
                            </button>
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section className="oc-setup-card">
                        <div className="oc-setup-card-heading">
                            <div>
                                <span className="oc-setup-eyebrow">03</span>
                                <h2 ref={stepHeading} tabIndex={-1}>{t('setup.onboarding.stepModel')}</h2>
                            </div>
                            <span className="oc-setup-step-provider">{providerLabel}</span>
                        </div>
                        <p>{t('setup.discovery.discover', { provider: providerLabel })}</p>

                        <div className="oc-manual-model oc-manual-model-lead">
                            <h3>{t('setup.discovery.manualTitle')}</h3>
                            <p className="oc-credentials-help">{t('setup.discovery.manualIdLead')}</p>
                            <div className="oc-credentials-field">
                                <label htmlFor="oc-manual-model-id">{t('setup.discovery.manualIdLabel')}</label>
                                <div className="oc-provider-input-row">
                                    <input
                                        id="oc-manual-model-id"
                                        type="text"
                                        value={manualId}
                                        onChange={(event) => setManualId(event.target.value)}
                                        onKeyDown={(event) => { if (event.key === 'Enter' && manualId.trim()) registerManual(); }}
                                        placeholder={t('setup.discovery.manualIdPlaceholder', { provider: providerLabel })}
                                        aria-describedby="oc-manual-model-id-help"
                                        autoComplete="off"
                                        spellCheck="false"
                                    />
                                    <button
                                        type="button"
                                        className="oc-primary-action"
                                        onClick={registerManual}
                                        disabled={!manualId.trim()}
                                    >
                                        {t('setup.discovery.manualRegister')}
                                    </button>
                                </div>
                                <p className="oc-credentials-help" id="oc-manual-model-id-help">
                                    {t('setup.discovery.manualIdHelp')}
                                </p>
                            </div>
                        </div>

                        <div className="oc-capabilities" aria-label={t('setup.discovery.capabilitiesTitle')}>
                            {CAPABILITY_KEYS.map((key) => (
                                <button
                                    type="button"
                                    key={key}
                                    className={capabilities[key] ? 'active' : ''}
                                    onClick={() => toggleCapability(key)}
                                    aria-pressed={capabilities[key]}
                                >
                                    {t(`settings.models.${DISCOVERY_CAPABILITY_KEYS[key]}`)}
                                </button>
                            ))}
                        </div>
                        <p className="oc-credentials-help">{t('setup.discovery.capabilitiesHelp')}</p>

                        <div className="oc-discovery-actions">
                            <button type="button" className="oc-setup-quiet oc-discovery-trigger" onClick={runDiscovery} disabled={discoveryState === 'loading'}>
                                {discoveryState === 'loading' ? t('setup.discovery.discoveringShort') : t('setup.discovery.discover')}
                            </button>
                        </div>

                        <div
                            className="oc-setup-status"
                            role="status"
                            aria-live="polite"
                            aria-busy={discoveryState === 'loading'}
                            aria-label={t('setup.discovery.statusRegion')}
                        >
                            {discoveryState === 'loading' && t('setup.discovery.discovering', { provider: providerLabel })}
                        </div>

                        {discoveryState === 'error' && (
                            <div className="oc-setup-error" role="alert">
                                <strong>{t('setup.discovery.errorTitle')}</strong>
                                <span>{errorMessage}</span>
                                {discovery.error?.detail && (
                                    <span className="oc-setup-error-detail">{t('setup.discovery.errorDetail', { detail: discovery.error.detail })}</span>
                                )}
                            </div>
                        )}

                        {discoveryState === 'unsupported' && (
                            <div className="oc-setup-empty">
                                <strong>{t('setup.discovery.unsupportedTitle')}</strong>
                                <span>{unsupportedMessage}</span>
                            </div>
                        )}

                        {discoveryState === 'empty' && (
                            <div className="oc-setup-empty">
                                <strong>{t('setup.discovery.emptyTitle', { provider: providerLabel })}</strong>
                                <span>{t('setup.discovery.emptyBody')}</span>
                            </div>
                        )}

                        {discoveryState === 'ready' && (
                            <>
                                <p className="oc-discovery-count">
                                    {t('setup.discovery.resultTitle')} &middot; {t('setup.discovery.resultCount', { count: discovery.models.length, provider: providerLabel })}
                                </p>

                                {filterable && (
                                    <div className="oc-credentials-field">
                                        <label htmlFor="oc-model-filter">{t('setup.discovery.filterLabel')}</label>
                                        <input
                                            id="oc-model-filter"
                                            type="search"
                                            value={modelFilter}
                                            onChange={(event) => setModelFilter(event.target.value)}
                                            placeholder={t('setup.discovery.filterPlaceholder')}
                                            autoComplete="off"
                                            spellCheck="false"
                                        />
                                        <p className="oc-credentials-help">{t('setup.discovery.filterHelp')}</p>
                                    </div>
                                )}

                                <div className="oc-discovery-actions">
                                    <button type="button" className="oc-setup-quiet" onClick={toggleVisible}>
                                        {t('setup.discovery.selectMatching')}
                                    </button>
                                    <button type="button" className="oc-setup-quiet" onClick={() => setSelectedIds([])}>
                                        {t('setup.discovery.clearSelection')}
                                    </button>
                                </div>

                                {visibleModels.length === 0 ? (
                                    <div className="oc-setup-empty">{t('setup.discovery.filterNoResults')}</div>
                                ) : (
                                    <ul className="oc-discovery-list">
                                        {visibleModels.map((model) => (
                                            <li className="oc-discovery-item" key={model.id}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(model.id)}
                                                        onChange={() => toggleSelected(model.id)}
                                                    />
                                                    <span className="oc-discovery-item-main">
                                                        <span className="oc-discovery-item-label">{model.label}</span>
                                                        <code className="oc-discovery-item-id">{model.id}</code>
                                                    </span>
                                                </label>
                                                <span className="oc-discovery-item-meta">
                                                    {model.ownedBy && <span>{t('setup.discovery.ownedBy', { owner: model.ownedBy })}</span>}
                                                    {model.contextHint && <span>{t('setup.discovery.contextHint', { value: model.contextHint })}</span>}
                                                    {model.capabilitiesReported
                                                        ? <span>{t('setup.discovery.modalitiesHint', { input: model.inputModalities.join(', '), output: model.outputModalities.join(', ') })}</span>
                                                        : <span>{t('setup.discovery.capabilitiesUnknown')}</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}

                        {discoveryState === 'ready' && (
                            <button
                                type="button"
                                className="oc-primary-action"
                                onClick={registerDiscovered}
                                disabled={selectedIds.length === 0}
                            >
                                {t('setup.discovery.registerCount', { count: selectedIds.length })}
                            </button>
                        )}

                        {modelError && <div className="oc-setup-error" role="alert">{modelError}</div>}

                        <div className="oc-setup-final-actions">
                            <button type="button" className="oc-setup-quiet" onClick={() => goToStep(2)}>
                                {t('setup.onboarding.back')}
                            </button>
                        </div>
                    </section>
                )}

                <section className="oc-setup-card">
                    <div className="oc-setup-card-heading">
                        <div><span className="oc-setup-eyebrow">04</span><h2>{t('setup.modelsTitle')}</h2></div>
                        <span>{models.length} {t('setup.registered')}</span>
                    </div>
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
                </section>

                <section className="oc-setup-card">
                    <div className="oc-setup-card-heading">
                        <div><span className="oc-setup-eyebrow">05</span><h2>{t('setup.activeModelsTitle')}</h2></div>
                        <span className={`oc-ready-badge ${ready ? 'ready' : ''}`}>{ready ? t('setup.ready') : t('setup.notReady')}</span>
                    </div>
                    <p>{t('setup.activeModelsDescription')}</p>
                    <div className="oc-active-model-grid">
                        <label><span>{t('workspace.model.textLabel')}</span><select value={activeText} onChange={(event) => changeActive('text', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{textModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                        <label><span>{t('workspace.model.visionLabel')}</span><select value={activeVision} onChange={(event) => changeActive('vision', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{visionModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                        <label><span>{t('workspace.model.imageLabel')}</span><select value={activeImage} onChange={(event) => changeActive('image', event.target.value)}><option value="">{t('workspace.model.noModelSelected')}</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{model.nickname || model.id}</option>)}</select></label>
                    </div>
                    <div className="oc-setup-final-actions">
                        <p aria-live="polite">{feedback || t('workspace.model.chooseExplicitly')}</p>
                        <button type="button" className="oc-primary-action" onClick={() => navigate(ROUTES.WORKSPACE)} disabled={!activeText}>{t('setup.openWorkspace')}</button>
                    </div>
                </section>
            </main>
        </div>
    );
}
