/**
 * Workspace Page
 * OpenContent IDE
 * 
 * Main working area after submitting a prompt
 * Contains: Sidebar, Canvas, Toolbar, Media/Templates
 * 
 * NO SIMULATION - Real AI or error message
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import './Workspace.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import Tooltip from '../../components/common/Tooltip';
import Modal from '../../components/common/Modal';
import { ROUTES, AGENT_CONFIG, STORAGE_KEYS } from '../../config/constants';
import { AI_CONFIG, isAIConfigured, sendToAI, generateImage, analyzeImage, getTextModelOptions, getImageModelOptions, supportsVisualInputModel } from '../../services/ai';
import {
    getLocalProjects,
    saveLocalProject,
    deleteLocalProject as deleteLocalProjectService
} from '../../services/projectsLocal';
import {
    saveMedia,
    getAllMedia,
    deleteMedia,
    updateMediaMetadata,
    countMedia,
    fileToBase64
} from '../../services/mediaService';
import { canUseAction, getDailyUsage, incrementUsage, getPlanLimits, getModelUsage, incrementModelUsage } from '../../services/freemium';
import { trackMetric } from '../../services/metrics';
import { queuePublication } from '../../services/publication';
import { applyLogoOverlay } from '../../utils/imageProcessor';

// Agent states
const AGENT_STATES = {
    IDLE: 'idle',
    ANALYZING: 'analyzing',
    GENERATING: 'generating',
    COMPLETE: 'complete',
    ERROR: 'error',
    NOT_CONFIGURED: 'not_configured'
};

const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

function Workspace() {
    const location = useLocation();
    const navigate = useNavigate();
    const { id: routeProjectId } = useParams();
    const { t } = useLanguage();
    const { toggleTheme } = useTheme();
    const { isAuthenticated, profile, isPro } = useAuth();

    // State
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const [agentState, setAgentState] = useState(AGENT_STATES.IDLE);
    const [errorMessage, setErrorMessage] = useState('');
    const [projects, setProjects] = useState([]);
    const [projectsLoaded, setProjectsLoaded] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState(null);
    const [paywall, setPaywall] = useState({ open: false, title: '', message: '', reason: '' });
    const [infoModal, setInfoModal] = useState({ open: false, title: '', message: '' });
    const [showProModal, setShowProModal] = useState(false);
    const [displayedText, setDisplayedText] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [history, setHistory] = useState([]);
    const [versions, setVersions] = useState([]); // Array of { type, prompt, result, model, steps }
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
    const [agentSteps, setAgentSteps] = useState([]); // Running steps for current generation
    const [isGenerating, setIsGenerating] = useState(false);
    const [isIterating, setIsIterating] = useState(false); // Controls loading UI
    const initialPromptHandled = useRef(false);
    const lastTypedVersionIndex = useRef(-1); // To prevent re-typing on state changes if not new
    const isWorking = agentState === AGENT_STATES.ANALYZING || agentState === AGENT_STATES.GENERATING;
    const usageUserId = profile?.uid || 'guest';
    const [dailyUsage, setDailyUsage] = useState(() => getDailyUsage(usageUserId));
    const [showModelModal, setShowModelModal] = useState(false);
    const [selectedTextModel, setSelectedTextModel] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SELECTED_TEXT_MODEL) || AI_CONFIG.DEFAULT_TEXT_MODEL
    );
    const [selectedImageModel, setSelectedImageModel] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL) || 'sourceful/riverflow-v2-fast'
    );
    const [imageProcessingMode] = useState(
        () => localStorage.getItem(STORAGE_KEYS.IMAGE_PROCESSING_MODE) || 'smart'
    );
    const [creativeTaskMode, setCreativeTaskMode] = useState(
        () => localStorage.getItem(STORAGE_KEYS.CREATIVE_TASK_MODE) || 'edit_template'
    );
    const [showLastPromptInResult] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SHOW_LAST_PROMPT) === 'true'
    );
    const generationAbortControllerRef = useRef(null);
    const slowGenerationNoticeTimerRef = useRef(null);

    // Media / Templates State
    const [mediaAssets, setMediaAssets] = useState([]);
    const [activeAssetIds, setActiveAssetIds] = useState([]);
    const [mediaSidebarOpen, setMediaSidebarOpen] = useState(true);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [uploadAssetRole, setUploadAssetRole] = useState('reference');
    const [attachedMedia, setAttachedMedia] = useState(null); // Selected image for NEXT prompt
    const fileInputRef = useRef(null);
    const chatFileInputRef = useRef(null);
    const textModelOptions = getTextModelOptions(isPro);
    const imageModelOptions = getImageModelOptions(isPro);

    const getTextModelLabel = (modelId) => {
        if (modelId === 'nvidia/nemotron-nano-12b-v2-vl:free') return t('workspace.model.textBestName');
        return t('workspace.model.textFreeName');
    };

    const getImageModelLabel = (modelId) => {
        if (modelId === 'bytedance-seed/seedream-4.5') return t('workspace.model.visualBestName');
        return t('workspace.model.visualFreeName');
    };

    const getTextModelBlurb = (modelId) => {
        if (modelId === 'nvidia/nemotron-nano-12b-v2-vl:free') return t('workspace.model.textBestDesc');
        return t('workspace.model.textFreeDesc');
    };

    const getImageModelBlurb = (modelId) => {
        if (modelId === 'bytedance-seed/seedream-4.5') return isPro ? t('workspace.model.visualBestDescPro') : t('workspace.model.visualBestDescFree');
        return t('workspace.model.visualFreeDesc');
    };

    // Typewriter effect for current version (only if new)
    useEffect(() => {
        const versionIndex = currentVersionIndex;
        if (versionIndex < 0) return;
        const currentVersion = versions[versionIndex];

        if (agentState === AGENT_STATES.COMPLETE &&
            currentVersion?.type === 'text' &&
            currentVersion?.isNew &&
            lastTypedVersionIndex.current !== versionIndex) {

            const rawText = currentVersion.result;
            let index = 0;
            setDisplayedText('');
            lastTypedVersionIndex.current = versionIndex;

            const timer = setInterval(() => {
                setDisplayedText(rawText.substring(0, index + 1));
                index++;
                if (index >= rawText.length) clearInterval(timer);
            }, 5);

            return () => clearInterval(timer);
        } else if (agentState === AGENT_STATES.COMPLETE && currentVersion?.type === 'text') {
            setDisplayedText(currentVersion.result || '');
            lastTypedVersionIndex.current = versionIndex;
        } else if (agentState !== AGENT_STATES.COMPLETE) {
            setDisplayedText('');
        }
    }, [agentState, currentVersionIndex, versions.length]);

    // Scroll to top when switching versions (not auto-scroll on every text update)
    useEffect(() => {
        const canvas = document.querySelector('.workspace-canvas');
        if (canvas && agentState === AGENT_STATES.COMPLETE) {
            canvas.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentVersionIndex]);

    useEffect(() => {
        if (versions.length === 0 && currentVersionIndex !== -1) {
            setCurrentVersionIndex(-1);
            return;
        }
        if (versions.length > 0 && (currentVersionIndex < 0 || currentVersionIndex >= versions.length)) {
            setCurrentVersionIndex(versions.length - 1);
        }
    }, [versions.length, currentVersionIndex]);

    // Check if AI is configured on mount
    useEffect(() => {
        if (!isAIConfigured()) {
            setAgentState(AGENT_STATES.NOT_CONFIGURED);
            notifyAIIssue('API_KEY_NOT_CONFIGURED', 'Configuracion de IA requerida');
        }
        loadMedia();
    }, []);

    // Load user projects
    useEffect(() => {
        loadProjects();
    }, [isAuthenticated, profile?.uid, isPro]);

    useEffect(() => {
        setDailyUsage(getDailyUsage(usageUserId));
    }, [usageUserId]);

    useEffect(() => {
        const textAllowed = textModelOptions.some((model) => model.id === selectedTextModel);
        if (!textAllowed && textModelOptions.length > 0) {
            setSelectedTextModel(textModelOptions[0].id);
        }

        const imageAllowed = imageModelOptions.some((model) => model.id === selectedImageModel);
        if (!imageAllowed && imageModelOptions.length > 0) {
            setSelectedImageModel(imageModelOptions[0].id);
        }
    }, [isPro]);

    // Get initial prompt from navigation state
    useEffect(() => {
        const initialPrompt = location.state?.initialPrompt;
        if (initialPrompt && !initialPromptHandled.current) {
            initialPromptHandled.current = true;
            setCurrentPrompt(initialPrompt);
            navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
            // Only start generation if AI is configured
            if (isAIConfigured()) {
                startGeneration(initialPrompt);
            }
        }
    }, [location.pathname, location.search, location.state, navigate]);

    // Load user's projects from local IndexedDB
    const loadProjects = async () => {
        try {
            const localItems = (await getLocalProjects()).map((item) => ({
                ...item,
                cloudSynced: Boolean(item.cloudSynced)
            }));

            // Sort by newest first
            localItems.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
            setProjects(localItems);
        } finally {
            setProjectsLoaded(true);
        }
    };

    const openProjectInWorkspace = (project, source = 'manual') => {
        if (!project?.id) return;

        setCurrentProjectId(project.id);
        setCurrentPrompt(project.prompt || '');
        const loadedVersions = Array.isArray(project.versions) && project.versions.length > 0
            ? project.versions.map((version) => ({ ...version, isNew: false }))
            : (project.result ? [{
                type: 'text',
                prompt: project.prompt,
                result: project.result,
                imageUrl: project.imageUrl,
                timestamp: project.updatedAt || project.createdAt,
                isNew: false,
                steps: [{ id: 1, text: 'Loaded from history', status: 'done' }]
            }] : []);

        if (loadedVersions.length > 0) {
            const safeIndex = Math.min(
                Math.max(project.currentVersionIndex || 0, 0),
                loadedVersions.length - 1
            );
            setVersions(loadedVersions);
            setCurrentVersionIndex(safeIndex);
            setHistory(project.history || []);
            setAgentState(AGENT_STATES.COMPLETE);
        } else {
            setVersions([]);
            setCurrentVersionIndex(-1);
            setHistory(project.history || []);
            setAgentState(AGENT_STATES.IDLE);
        }

        setErrorMessage('');
        trackMetric('project_opened', { projectId: project.id, source });
    };

    useEffect(() => {
        if (!projectsLoaded || !routeProjectId) return;
        const matchingProject = projects.find((project) => project.id === routeProjectId);

        if (!matchingProject) {
            openInfoNotice(
                'Proyecto no encontrado',
                'No encontramos un proyecto con ese enlace local. Crea uno nuevo o abre otro desde la lista.'
            );
            navigate(ROUTES.WORKSPACE, { replace: true });
            return;
        }

        if (currentProjectId !== matchingProject.id) {
            openProjectInWorkspace(matchingProject, 'url');
        }
    }, [projectsLoaded, projects, routeProjectId, currentProjectId, navigate]);

    useEffect(() => {
        if (!projectsLoaded) return;

        if (currentProjectId) {
            localStorage.setItem(STORAGE_KEYS.LAST_PROJECT, currentProjectId);
            if (routeProjectId !== currentProjectId) {
                navigate(ROUTES.PROJECT.replace(':id', currentProjectId), { replace: true });
            }
            return;
        }

        if (routeProjectId) {
            const exists = projects.some((project) => project.id === routeProjectId);
            if (!exists) {
                navigate(ROUTES.WORKSPACE, { replace: true });
            }
        }
    }, [projectsLoaded, currentProjectId, routeProjectId, projects, navigate]);

    const refreshDailyUsage = () => {
        setDailyUsage(getDailyUsage(usageUserId));
    };

    const openPaywall = (checkResult) => {
        const map = {
            DAILY_GENERATIONS_LIMIT: {
                title: t('paywall.dailyGenerationsTitle'),
                message: t('paywall.dailyGenerationsMessage')
            },
            ITERATIONS_PER_PROJECT_LIMIT: {
                title: t('paywall.iterationsTitle'),
                message: t('paywall.iterationsMessage')
            },
            DAILY_IMAGES_LIMIT: {
                title: t('paywall.dailyImagesTitle'),
                message: t('paywall.dailyImagesMessage')
            },
            DAILY_EXPORTS_LIMIT: {
                title: t('paywall.dailyExportsTitle'),
                message: t('paywall.dailyExportsMessage')
            },
            DAILY_PUBLISHES_LIMIT: {
                title: t('paywall.dailyPublishesTitle'),
                message: t('paywall.dailyPublishesMessage')
            },
            PROJECT_LIMIT: {
                title: t('paywall.projectsTitle'),
                message: t('paywall.projectsMessage')
            }
        };

        const copy = map[checkResult.reason] || {
            title: t('paywall.defaultTitle'),
            message: t('paywall.defaultMessage')
        };

        setPaywall({
            open: true,
            title: copy.title,
            message: copy.message,
            reason: checkResult.reason
        });

        trackMetric('paywall_shown', {
            reason: checkResult.reason,
            used: checkResult.used,
            limit: checkResult.limit,
            plan: isPro ? 'PRO' : 'FREE'
        });
    };

    const gateAction = (action, extra = {}) => {
        const check = canUseAction(action, {
            isPro,
            userId: usageUserId,
            projectCount: projects.length,
            currentProjectIterations: versions.length,
            ...extra
        });

        if (!check.allowed) {
            openPaywall(check);
            return false;
        }
        return true;
    };

    const saveModelSelection = () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_TEXT_MODEL, selectedTextModel);
        localStorage.setItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL, selectedImageModel);
        setShowModelModal(false);
        trackMetric('model_selection_saved', {
            textModel: selectedTextModel,
            imageModel: selectedImageModel,
            plan: isPro ? 'PRO' : 'FREE'
        });
    };

    const checkTextModelAllowance = () => {
        if (isPro) return true;
        if (selectedTextModel !== 'nvidia/nemotron-nano-12b-v2-vl:free') return true;

        const modelUsage = getModelUsage(usageUserId);
        if ((modelUsage.glm_text || 0) >= 2) {
            setInfoModal({
                open: true,
                title: t('workspace.model.glmLimitTitle'),
                message: t('workspace.model.glmLimitMessage')
            });
            trackMetric('glm_free_limit_hit', { used: modelUsage.glm_text || 0 });
            return false;
        }
        return true;
    };

    const checkSeedreamAllowance = (mode = 'new') => {
        if (isPro) return true;
        if (selectedImageModel !== 'bytedance-seed/seedream-4.5') return true;

        const modelUsage = getModelUsage(usageUserId);
        const usedNew = modelUsage.seedream_new || 0;
        const usedEdit = modelUsage.seedream_edit || 0;

        if (mode === 'new' && usedNew >= 5) {
            setInfoModal({
                open: true,
                title: t('workspace.model.seedreamNewLimitTitle'),
                message: t('workspace.model.seedreamNewLimitMessage')
            });
            trackMetric('seedream_new_limit_hit', { used: usedNew });
            return false;
        }

        if (mode === 'edit' && usedEdit >= 2) {
            setInfoModal({
                open: true,
                title: t('workspace.model.seedreamEditLimitTitle'),
                message: t('workspace.model.seedreamEditLimitMessage')
            });
            trackMetric('seedream_edit_limit_hit', { used: usedEdit });
            return false;
        }
        return true;
    };

    const getSafeVersionIndex = (index, list = versions) => {
        if (!Array.isArray(list) || list.length === 0) return -1;
        const normalized = Number.isInteger(index) ? index : list.length - 1;
        return Math.min(Math.max(normalized, 0), list.length - 1);
    };

    const getScopedHistory = (allHistory, versionIndex) => {
        if (!Array.isArray(allHistory) || allHistory.length === 0 || versionIndex < 0) return [];
        const maxEntries = (versionIndex + 1) * 2;
        return allHistory.slice(0, Math.min(allHistory.length, maxEntries));
    };

    const shouldAllowAutoImage = (promptText, hasAttachedImage) => {
        if (hasAttachedImage) return true;
        const text = String(promptText || '').toLowerCase();
        return /(image|imagen|photo|foto|thumbnail|poster|cover|banner|visual|design|disena|diseña|logo|ilustracion|ilustración|render|mockup)/.test(text);
    };

    const isImageEditRequest = (promptText) => {
        const text = String(promptText || '').toLowerCase();
        // Requires both an action (edit/mod) AND a visual object (image/photo/style)
        const hasAction = /(edita|editar|edit|retoca|retouch|modifica|modify|ajusta|improve|mejora|cambia|change|aplica|apply|pon|put)/.test(text);
        const hasVisualContext = /(imagen|image|template|visual|foto|photo|diseno|diseño|estilo|style|color|iluminacion|lighting|fondo|background|efecto|effect)/.test(text);
        return hasAction && hasVisualContext;
    };

    const isCasualChatPrompt = (promptText) => {
        const text = String(promptText || '').trim().toLowerCase();
        const compact = text.replace(/[!?.:,;]/g, '').trim();
        const tokens = compact.split(/\s+/).filter(Boolean);
        const greetingOnly = /^(hola|hello|hi|hey|que onda|que tal|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/.test(compact);
        const shortCasual = /^(hola|hello|hi|hey|gracias|thanks|ok|vale|va|listo)$/.test(compact) || tokens.length <= 2;
        return greetingOnly || shortCasual;
    };

    const normalizeAIError = (message) => {
        if (!message) return 'Something went wrong';
        if (message === 'API_KEY_NOT_CONFIGURED' || message === 'OPENROUTER_API_KEY_NOT_CONFIGURED' || message === 'GEMINI_API_KEY_NOT_CONFIGURED') {
            return 'La API de IA no esta configurada. Revisa tus llaves en .env para continuar.';
        }
        if (message === 'REQUEST_TIMEOUT') {
            return 'El modelo tardo demasiado en responder. Intenta de nuevo o cambia de modelo.';
        }
        if (message === 'REQUEST_ABORTED') {
            return 'Generacion cancelada.';
        }
        if (message === 'EMPTY_AI_RESPONSE') {
            return 'El modelo no devolvio contenido util. Prueba reformular el prompt o cambiar de modelo.';
        }
        if (message === 'AI_REQUEST_FAILED') {
            return 'La solicitud al modelo fallo. Intenta nuevamente en unos segundos.';
        }
        if (String(message).includes('NO_IMAGE_IN_RESPONSE')) {
            return 'El modelo respondio sin imagen. Puedes reintentar o probar otro modelo visual.';
        }
        if (message === 'IMAGE_GENERATION_FAILED' || message === 'IMAGE_ANALYSIS_FAILED') {
            return 'No se pudo completar la operacion visual. Cambia de modelo o vuelve a intentar.';
        }
        return message;
    };

    const openInfoNotice = (title, message) => {
        setInfoModal({
            open: true,
            title,
            message
        });
    };

    const notifyAIIssue = (rawMessage, title = 'Aviso del modelo de IA') => {
        const normalized = normalizeAIError(rawMessage);
        setErrorMessage(normalized);
        openInfoNotice(title, normalized);
        return normalized;
    };

    const clearSlowGenerationNoticeTimer = () => {
        if (slowGenerationNoticeTimerRef.current) {
            clearTimeout(slowGenerationNoticeTimerRef.current);
            slowGenerationNoticeTimerRef.current = null;
        }
    };

    const cancelCurrentGeneration = (customMessage = 'Generacion cancelada.') => {
        clearSlowGenerationNoticeTimer();
        if (generationAbortControllerRef.current) {
            generationAbortControllerRef.current.abort();
            generationAbortControllerRef.current = null;
        }
        setAgentState(AGENT_STATES.ERROR);
        setErrorMessage(customMessage);
        setIsGenerating(false);
        setIsIterating(false);
    };

    const getAssetRoleLabel = (role) => {
        const map = {
            logo: 'Logo',
            template: 'Template',
            reference: 'Ref',
            overlay: 'Overlay'
        };
        return map[role] || 'Ref';
    };

    const isPersistedAssetId = (assetId) => String(assetId || '').startsWith('asset_');

    const buildAssetContext = (assets) => {
        if (!Array.isArray(assets) || assets.length === 0) return '';
        const lines = assets.map((asset, index) => {
            const role = getAssetRoleLabel(asset.role || 'reference');
            return `${index + 1}. ${role}: ${asset.name || 'asset'}`;
        });
        return `\n\nACTIVE BRAND/TEMPLATE ASSETS:\n${lines.join('\n')}`;
    };

    const buildTaskModeInstruction = (mode) => {
        if (mode === 'from_scratch') {
            return `\n\nTASK MODE: GENERATE FROM SCRATCH. You can use active assets as style guidance only, but prioritize creating a fresh concept.`;
        }
        return `\n\nTASK MODE: EDIT TEMPLATE. Keep layout coherence, preserve brand identity, and integrate logos/effects requested by the user in a realistic way.`;
    };

    const toggleAssetActive = (assetId) => {
        if (!assetId) return;
        setActiveAssetIds((prev) => prev.includes(assetId)
            ? prev.filter((id) => id !== assetId)
            : [...prev, assetId]
        );
    };

    const handleAssetRoleChange = async (assetId, role) => {
        try {
            await updateMediaMetadata(assetId, { role });
            await loadMedia();
        } catch (error) {
            console.error('Asset role update failed', error);
        }
    };

    const handleSelectedAssetRoleChange = async (role) => {
        if (!attachedMedia?.id) return;
        if (isPersistedAssetId(attachedMedia.id)) {
            await handleAssetRoleChange(attachedMedia.id, role);
            setAttachedMedia((prev) => prev ? { ...prev, role } : prev);
            return;
        }
        setAttachedMedia((prev) => prev ? { ...prev, role } : prev);
    };

    const toggleSelectedAssetActive = () => {
        if (!attachedMedia?.id) return;
        if (!isPersistedAssetId(attachedMedia.id)) return;
        toggleAssetActive(attachedMedia.id);
    };

    const handleTaskModeChange = (mode) => {
        setCreativeTaskMode(mode);
        localStorage.setItem(STORAGE_KEYS.CREATIVE_TASK_MODE, mode);
    };

    // Media Logic
    const loadMedia = async () => {
        try {
            const assets = await getAllMedia();
            const normalized = assets.map((asset) => ({
                ...asset,
                role: asset.role || 'reference'
            }));
            setMediaAssets(normalized);
            setActiveAssetIds((prev) => prev.filter((id) => normalized.some((asset) => asset.id === id)));
        } catch (error) {
            console.error("Failed to load media", error);
        }
    };

    const handleUploadMedia = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // 1. Size Limit Check (10MB)
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            setErrorMessage(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max limit is 10MB.`);
            return;
        }

        // 2. Count Limits Check: FREE 3, PRO 10
        const currentCount = await countMedia();
        const limit = isPro ? 10 : 3;

        if (currentCount >= limit) {
            if (!isPro) {
                setPaywall({
                    open: true,
                    title: t('workspace.media.limitTitle'),
                    message: t('workspace.media.limitFree'),
                    reason: 'MEDIA_LIMIT'
                });
                trackMetric('paywall_shown', { reason: 'MEDIA_LIMIT', plan: 'FREE' });
            } else {
                setErrorMessage(t('workspace.media.limitPro'));
            }
            return;
        }

        setIsUploadingMedia(true);
        try {
            await saveMedia(file, file.name, { role: uploadAssetRole });
            await loadMedia();
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setIsUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteMedia = async (id) => {
        try {
            await deleteMedia(id);
            if (attachedMedia?.id === id) {
                setAttachedMedia(null);
            }
            setActiveAssetIds((prev) => prev.filter((assetId) => assetId !== id));
            await loadMedia();
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleAttachMediaFromChat = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Size Limit Check (10MB)
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            setErrorMessage(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max limit is 10MB.`);
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            setAttachedMedia({ id: `temp_${Date.now()}`, name: file.name, data: base64, role: 'reference' });
        } catch (error) {
            console.error("Context attach failed", error);
        }
    };

    // Start agentic generation flow
    const startGeneration = async (prompt, isIteration = false) => {
        if (isGenerating) return;
        if (!isAIConfigured()) {
            setAgentState(AGENT_STATES.NOT_CONFIGURED);
            notifyAIIssue('API_KEY_NOT_CONFIGURED');
            return;
        }
        if (!isIteration && !currentProjectId && !gateAction('project')) return;
        if (!gateAction('generate')) return;
        if (isIteration && !gateAction('iteration', { currentProjectIterations: versions.length })) return;
        if (!checkTextModelAllowance()) return;

        setIsGenerating(true);
        setIsIterating(isIteration);
        const requestController = new AbortController();
        generationAbortControllerRef.current = requestController;
        setAgentState(AGENT_STATES.ANALYZING);
        setErrorMessage('');
        setAgentSteps([{ id: 1, text: 'Thinking...', status: 'working' }]);
        clearSlowGenerationNoticeTimer();
        slowGenerationNoticeTimerRef.current = setTimeout(() => {
            if (generationAbortControllerRef.current === requestController) {
                openInfoNotice(
                    'La IA esta tardando',
                    'Esta solicitud esta tardando mas de lo normal. Puedes esperar, detenerla o cambiar de modelo.'
                );
            }
        }, 18000);

        try {
            let projectId = currentProjectId;

            // Local-first project storage (IndexedDB)
            if (!isIteration) {
                const projectData = {
                    name: prompt.substring(0, 50),
                    prompt: prompt,
                    type: 'content',
                    createdAt: new Date().toISOString()
                };

                const localProj = await saveLocalProject({ ...projectData, id: projectId });
                projectId = localProj.id;
                setCurrentProjectId(projectId);
                await loadProjects();
            }

            // Step: Generating
            setAgentSteps([
                { id: 1, text: 'Thinking...', status: 'done' },
                { id: 2, text: 'Generating content...', status: 'working' }
            ]);
            setAgentState(AGENT_STATES.GENERATING);

            let fullPrompt = prompt;
            let iterativeContext = "";
            const activeAssets = mediaAssets.filter((asset) => activeAssetIds.includes(asset.id));
            const activeLogos = activeAssets.filter((asset) => asset.role === 'logo');
            const templateAssets = activeAssets.filter((asset) => asset.role === 'template');

            // INTENT ROUTER: Determine the primary pipeline
            const isCasualPrompt = isCasualChatPrompt(prompt);
            const hasInitialImage = Boolean(attachedMedia || templateAssets[0] || activeAssets[0]);
            const isEditIntent = !isCasualPrompt && hasInitialImage && isImageEditRequest(prompt);
            const isFreshGenIntent = !isCasualPrompt && !isEditIntent && shouldAllowAutoImage(prompt, hasInitialImage);

            const selectedPrimaryAsset = attachedMedia || templateAssets[0] || activeAssets[0] || null;
            const imageUrls = [selectedPrimaryAsset?.data, ...activeAssets.map((asset) => asset.data)]
                .filter(Boolean)
                .filter((value, index, arr) => arr.indexOf(value) === index);
            const modelSupportsVisualInput = supportsVisualInputModel(selectedTextModel);
            const aiReadableImageUrls = modelSupportsVisualInput ? imageUrls : [];
            let currentImageUrl = imageUrls[0] || null;

            if (imageUrls.length > 0 && !modelSupportsVisualInput) {
                openInfoNotice(
                    'Modelo sin entrada visual',
                    'El modelo de texto seleccionado no puede analizar imagenes o referencias visuales directamente. Usaremos la referencia solo para imitar estilo.'
                );
                fullPrompt = `${fullPrompt}\n\nVISUAL INPUT LIMITATION: The selected text model cannot read image inputs. If user asks visual edits, imitate style from text instructions and keep brand consistency.`;
            }

            let baseVersionPrompt = currentPrompt;
            let scopedHistory = [];
            let safeBaseVersionIndex = getSafeVersionIndex(currentVersionIndex);
            let baseVersion = safeBaseVersionIndex >= 0 ? versions[safeBaseVersionIndex] : null;
            const assetContext = buildAssetContext(activeAssets);
            const taskModeInstruction = buildTaskModeInstruction(creativeTaskMode);

            if (isIteration && versions.length > 0) {
                scopedHistory = getScopedHistory(history, safeBaseVersionIndex);
                const historyContext = scopedHistory
                    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`)
                    .join('\n\n');

                baseVersionPrompt = baseVersion?.prompt || currentPrompt || '';
                const baseDraftContext = baseVersion?.result
                    ? `\n\nCurrent draft to refine:\n${baseVersion.result}`
                    : '';
                fullPrompt = `${historyContext}${baseDraftContext}\n\nUser request: ${prompt}\n\nPlease update the content based on this new request.`;

                if (baseVersion?.imageUrl && !currentImageUrl) {
                    iterativeContext = `\n\nCURRENT VISUAL: There is already an image. If the user asks to modify the visual, describe the NEW image prompt in the [GENERATE_IMAGE: ...] tag, taking the previous one as reference.`;
                }
            }

            const shouldInjectCreativeContext = !isCasualPrompt && (
                isImageEditRequest(prompt) ||
                shouldAllowAutoImage(prompt, Boolean(currentImageUrl)) ||
                Boolean(currentImageUrl && activeAssets.length > 0)
            );

            if (shouldInjectCreativeContext) {
                fullPrompt = `${fullPrompt}${taskModeInstruction}${assetContext}`;
            }

            if (currentImageUrl && imageProcessingMode === 'analysis_send' && modelSupportsVisualInput) {
                try {
                    const analysis = await analyzeImage(
                        currentImageUrl,
                        'Describe this image with visual details useful to edit or improve social content.',
                        { signal: requestController.signal }
                    );
                    if (analysis?.success && analysis.analysis) {
                        fullPrompt = `${fullPrompt}\n\nIMAGE ANALYSIS CONTEXT:\n${analysis.analysis}\n\nUse this context to improve the response.`;
                    }
                } catch (analysisError) {
                    console.warn('Image analysis step failed, continuing with send-only flow.', analysisError);
                }
            }

            const shouldDirectGenerateFromEdit =
                currentImageUrl &&
                imageProcessingMode === 'smart' &&
                !isCasualPrompt &&
                isImageEditRequest(prompt);

            if (shouldDirectGenerateFromEdit) {
                setAgentSteps([
                    { id: 1, text: 'Thinking...', status: 'done' },
                    { id: 2, text: 'Detected image edit intent', status: 'done' },
                    { id: 3, text: 'Generating edited visual...', status: 'working' }
                ]);
                setAgentState(AGENT_STATES.GENERATING);

                const logoLine = activeLogos.length > 0
                    ? `\nIncorporate these brand logos naturally: ${activeLogos.map((asset) => asset.name).join(', ')}.`
                    : '';
                const smartImagePrompt = `Edit this template with premium quality and preserve brand consistency.\nUser request: ${prompt}${logoLine}\nAdd realistic lighting/effects only if requested.`;
                const directImage = await generateImage(smartImagePrompt, selectedImageModel, 3, 2000, { signal: requestController.signal });

                if (directImage?.success) {
                    setAttachedMedia(null);
                    const cleanText = 'Edicion visual aplicada segun tu solicitud. Si quieres, ahora te genero texto optimizado para esta nueva imagen.';
                    const newUserMessage = { role: 'user', content: prompt };
                    const textAssistantMessage = { role: 'assistant', content: cleanText };
                    const nextHistory = isIteration
                        ? [...scopedHistory, newUserMessage, textAssistantMessage]
                        : [newUserMessage, textAssistantMessage];
                    setHistory(nextHistory);

                    const newVersion = {
                        type: 'text',
                        prompt,
                        result: cleanText,
                        model: directImage.model || `visual:${selectedImageModel}`,
                        imageUrl: directImage.imageUrl,
                        imageModel: directImage.model || selectedImageModel,
                        imagePrompt: smartImagePrompt,
                        timestamp: new Date().toISOString(),
                        isNew: true,
                        steps: [
                            { id: 1, text: 'Detected image edit request', status: 'done' },
                            { id: 2, text: 'Generated edited visual', status: 'done' }
                        ]
                    };

                    const previousVersions = Array.isArray(versions) ? versions : [];
                    const versionsSnapshot = [...previousVersions, newVersion];
                    const newVersionIndex = versionsSnapshot.length - 1;
                    setVersions(versionsSnapshot);
                    setCurrentVersionIndex(newVersionIndex);
                    setAgentSteps(prev => prev.map(step => ({ ...step, status: 'done' })));
                    setAgentState(AGENT_STATES.COMPLETE);

                    incrementUsage('generate', usageUserId);
                    incrementUsage('image', usageUserId);
                    if (isIteration) incrementUsage('iteration', usageUserId);
                    if (selectedImageModel === 'bytedance-seed/seedream-4.5') {
                        incrementModelUsage('seedream_edit', usageUserId);
                    }
                    refreshDailyUsage();
                    trackMetric('smart_direct_image_edit_success', {
                        projectId,
                        imageModel: directImage.model || selectedImageModel
                    });

                    if (projectId) {
                        const nextPromptValue = isIteration
                            ? `${baseVersionPrompt}\n> ${prompt}`
                            : prompt;
                        const updateData = {
                            status: 'complete',
                            result: cleanText,
                            imageUrl: directImage.imageUrl,
                            prompt: nextPromptValue,
                            history: nextHistory,
                            versions: versionsSnapshot,
                            currentVersionIndex: newVersionIndex
                        };
                        await saveLocalProject({ ...updateData, id: projectId });
                        if (isIteration) setCurrentPrompt(nextPromptValue);
                        await loadProjects();
                    }
                    return;
                }

                console.warn('Smart direct image generation failed, falling back to text+image flow.');
            }

            const MASTER_SOCIAL_PROMPT = `You are Agent, a world-class Social Media Expert and Creative Director. 
                Your mission is to generate premium, high-converting content for any platform (not just social, but ads, posters, UI mockups).
                
                BRAND FIDELITY & ASSETS:
                - If logos are provided, describe their integration with maximum respect for position and scale.
                - When an image is attached, TREAT IT AS THE MASTER TEMPLATE. Do not invent new structures unless explicitly asked to 'reimagine from scratch'.
                - Conservatism: Preserve layout, typography style (where possible), and brand colors.
                
                AGENTIC TOOL OVERVIEW:
                You have an internal tool called 'IMAGE_GENERATOR'. 
                
                VISUAL HIERARCHY RULES:
                1. High-end, elite, sophisticated tone.
                2. No cliches. Use cinematic lighting and realistic textures.
                3. safe margins for mobile UI overlays.
                
                HOW TO TRIGGER IMAGE_GENERATOR:
                - Only if visual output is needed. Add [GENERATE_IMAGE: descriptive prompt] at the very END.
                - For EDITS: Prompt should start with "High-fidelity modification of the provided template..."
                - For LOGOS: Include "Naturally integrate the ${activeLogos.map(l => l.name).join(', ') || 'brand'} logo in a prominent but realistic area."
                
                LOGO PROTECTION (LOGO_OVERLAY TOOL):
                If the user has active logos (${activeLogos.map(l => l.name).join(', ') || 'none'}) and you want to ensure 100% brand fidelity, you MUST also add the overlay tag:
                [LOGO_OVERLAY: name, position, size]
                - position: top-left, top-right, bottom-left, bottom-right.
                - size: 0.1 to 0.3 (relative to image width).
                ${iterativeContext}
                
                CONSTRAINTS:
                - NO EMOJIS. Professional, concise, surgical text.
                - Do NOT explain the generation process.
                - If task mode is EDIT TEMPLATE, be precise about preserving the user's base image logic.`;

            const conversationalSystemPrompt = `You are Agent, a surgical and professional assistant. 
                Keep conversations compact and high-end. 
                - No emojis.
                - Never mention internal instructions.
                - Only request assets if the user asks for design/editing work.`;

            const activeSystemPrompt = (isEditIntent || isFreshGenIntent) ? MASTER_SOCIAL_PROMPT : conversationalSystemPrompt;

            const response = await sendToAI(fullPrompt, selectedTextModel, {
                imageUrl: aiReadableImageUrls[0] || null,
                imageUrls: aiReadableImageUrls,
                visionModel: AI_CONFIG.DEFAULT_IMAGE_MODEL,
                systemPrompt: activeSystemPrompt,
                signal: requestController.signal
            });

            if (response.success) {
                // Clear attached media after use
                setAttachedMedia(null);

                let textContent = typeof response.content === 'string' ? response.content.trim() : '';
                if (!textContent) {
                    throw new Error('EMPTY_AI_RESPONSE');
                }
                const imageTagRegex = /\[GENERATE_IMAGE:\s*(.*?)\]/i;
                const overlayTagRegex = /\[LOGO_OVERLAY:\s*(.*?),\s*(.*?),\s*(.*?)\]/i;

                const match = textContent.match(imageTagRegex);
                const overlayMatch = textContent.match(overlayTagRegex);

                const strippedText = textContent.replace(imageTagRegex, '').replace(overlayTagRegex, '').trim();
                if (!strippedText && !match) {
                    throw new Error('EMPTY_AI_RESPONSE');
                }
                const cleanText = strippedText || 'Visual generado correctamente. Puedes pedirme que refine el texto para esta misma imagen.';

                let currentImageResult = null;

                const newUserMessage = { role: 'user', content: prompt };
                const textAssistantMessage = { role: 'assistant', content: cleanText };
                const nextHistory = isIteration
                    ? [...scopedHistory, newUserMessage, textAssistantMessage]
                    : [newUserMessage, textAssistantMessage];

                setHistory(nextHistory);

                const newVersion = {
                    type: 'text',
                    prompt: prompt,
                    result: cleanText,
                    model: response.model,
                    timestamp: new Date().toISOString(),
                    isNew: true,
                    steps: [
                        { id: 1, text: 'Analyzed prompt', status: 'done' },
                        { id: 2, text: 'Generated content', status: 'done' }
                    ]
                };

                const previousVersions = Array.isArray(versions) ? versions : [];
                const versionsSnapshot = [...previousVersions, newVersion];
                setVersions(prev => [...prev, newVersion]);
                const newVersionIndex = versionsSnapshot.length - 1;
                setCurrentVersionIndex(newVersionIndex);

                // If AI requested an image agentically
                const allowAutoImage = shouldAllowAutoImage(prompt, Boolean(currentImageUrl));
                if (match && match[1] && allowAutoImage) {
                    const imagePrompt = match[1];
                    console.log("Agent Agent: Requesting image with prompt:", imagePrompt);
                    if (!checkSeedreamAllowance('new')) {
                        setAgentSteps(prev => prev.map(s => s.status === 'working' ? { ...s, status: 'done' } : s));
                        setAgentState(AGENT_STATES.COMPLETE);
                    } else {

                        setAgentSteps(prev => [
                            ...prev.map(s => ({ ...s, status: 'done' })),
                            { id: 'img-' + Date.now(), text: `AI Tool: Generating requested visual...`, status: 'working' }
                        ]);

                        const imgResponse = await generateImage(imagePrompt, selectedImageModel, 3, 2000, { signal: requestController.signal });

                        if (imgResponse.success) {
                            let finalImageUrl = imgResponse.imageUrl;

                            // Apply deterministic Logo Overlay if requested
                            if (overlayMatch && activeLogos.length > 0) {
                                try {
                                    setAgentSteps(prev => [
                                        ...prev,
                                        { id: 'overlay-' + Date.now(), text: `Applying brand protection (deterministic logo)...`, status: 'working' }
                                    ]);

                                    const logoName = overlayMatch[1].toLowerCase();
                                    const pos = overlayMatch[2].trim();
                                    const sizeVal = parseFloat(overlayMatch[3]) || 0.15;

                                    const targetLogo = activeLogos.find(l => l.name.toLowerCase().includes(logoName)) || activeLogos[0];

                                    if (targetLogo) {
                                        finalImageUrl = await applyLogoOverlay(imgResponse.imageUrl, targetLogo.data, {
                                            position: pos,
                                            size: sizeVal
                                        });
                                    }
                                } catch (overlayErr) {
                                    console.error("Logo overlay failed", overlayErr);
                                }
                            }

                            currentImageResult = finalImageUrl;
                            versionsSnapshot[newVersionIndex] = {
                                ...versionsSnapshot[newVersionIndex],
                                imageUrl: finalImageUrl,
                                imageModel: imgResponse.model,
                                imagePrompt: imagePrompt
                            };
                            setVersions(prev => prev.map((v, i) =>
                                i === newVersionIndex
                                    ? { ...v, imageUrl: finalImageUrl, imageModel: imgResponse.model, imagePrompt: imagePrompt }
                                    : v
                            ));
                            setAgentSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
                            incrementUsage('image', usageUserId);
                            if (selectedImageModel === 'bytedance-seed/seedream-4.5') {
                                incrementModelUsage('seedream_new', usageUserId);
                            }
                        } else {
                            notifyAIIssue(imgResponse.error || 'The image tool failed to respond.', 'Error de herramienta visual');
                            setAgentSteps(prev => prev.map(s => s.status === 'working' ? { ...s, status: 'error', text: 'Image tool error' } : s));
                        }
                    }
                }

                setAgentState(AGENT_STATES.COMPLETE);
                incrementUsage('generate', usageUserId);
                if (isIteration) incrementUsage('iteration', usageUserId);
                if (selectedTextModel === 'nvidia/nemotron-nano-12b-v2-vl:free' && !isPro) {
                    incrementModelUsage('glm_text', usageUserId);
                }
                refreshDailyUsage();
                trackMetric(isIteration ? 'iteration_success' : 'generation_success', {
                    projectId,
                    hasImage: Boolean(currentImageResult),
                    model: response.model,
                    imageModel: selectedImageModel
                });

                // Update project
                if (projectId) {
                    const nextPromptValue = isIteration
                        ? `${baseVersionPrompt}\n> ${prompt}`
                        : prompt;
                    const latestVersion = versionsSnapshot[newVersionIndex];
                    const updateData = {
                        status: 'complete',
                        result: cleanText,
                        imageUrl: currentImageResult || latestVersion?.imageUrl || null,
                        prompt: nextPromptValue,
                        history: nextHistory,
                        versions: versionsSnapshot,
                        currentVersionIndex: newVersionIndex
                    };

                    await saveLocalProject({ ...updateData, id: projectId });
                    if (isIteration) setCurrentPrompt(nextPromptValue);
                    await loadProjects();
                }
            } else {
                throw new Error(response.error || 'Generation failed');
            }

        } catch (error) {
            setAgentState(AGENT_STATES.ERROR);
            notifyAIIssue(error.message || 'Something went wrong');
        } finally {
            clearSlowGenerationNoticeTimer();
            generationAbortControllerRef.current = null;
            setIsGenerating(false);
            setIsIterating(false);
        }
    };

    // Handle chat iteration
    const handleIteration = (e) => {
        if (e) e.preventDefault();
        if (isGenerating) {
            cancelCurrentGeneration('Generacion cancelada por el usuario.');
            return;
        }
        if (!chatInput.trim()) return;

        const nextPrompt = chatInput.trim();
        setChatInput('');
        startGeneration(nextPrompt, true);
    };

    // Pagination handlers
    const goToPrevVersion = () => {
        if (currentVersionIndex > 0) {
            setCurrentVersionIndex(prev => prev - 1);
        }
    };

    const goToNextVersion = () => {
        if (currentVersionIndex < versions.length - 1) {
            setCurrentVersionIndex(prev => prev + 1);
        }
    };

    // Handle new prompt
    const handleNewPrompt = () => {
        navigate(ROUTES.LANDING);
    };

    // Handle project delete
    const handleDeleteProject = async (projectId) => {
        await deleteLocalProjectService(projectId);

        await loadProjects();
        trackMetric('project_deleted', { projectId });
        if (currentProjectId === projectId) {
            setCurrentProjectId(null);
            setVersions([]);
            setCurrentVersionIndex(-1);
            setCurrentPrompt('');
        }
    };

    const handleDownloadImage = async (url) => {
        if (!url) return;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `opencontent-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Download failed:", error);
            window.open(url, '_blank');
        }
    };

    const handleExportProject = async () => {
        if (versions.length === 0) return;
        if (!gateAction('export')) return;

        const safeIndex = getSafeVersionIndex(currentVersionIndex);
        const current = safeIndex >= 0 ? versions[safeIndex] : null;
        const payload = {
            app: 'OpenContent IDE',
            exportedAt: new Date().toISOString(),
            projectId: currentProjectId,
            prompt: current?.prompt || currentPrompt,
            content: current?.result || '',
            imageUrl: current?.imageUrl || null,
            versions,
            history
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `opencontent-export-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        incrementUsage('export', usageUserId);
        refreshDailyUsage();
        trackMetric('export_success', { projectId: currentProjectId });
    };

    const handlePublishProject = async () => {
        if (versions.length === 0) return;
        if (!gateAction('publish')) return;

        const safeIndex = getSafeVersionIndex(currentVersionIndex);
        const current = safeIndex >= 0 ? versions[safeIndex] : null;
        const publication = queuePublication({
            projectId: currentProjectId,
            prompt: current?.prompt || currentPrompt,
            content: current?.result || '',
            imageUrl: current?.imageUrl || null,
            userId: profile?.uid || null
        });

        incrementUsage('publish', usageUserId);
        refreshDailyUsage();
        trackMetric('publication_queued', { publicationId: publication.id, projectId: currentProjectId });
        setInfoModal({
            open: true,
            title: t('workspace.publish.title'),
            message: t('workspace.publish.message')
        });
    };

    const handleSendToAU = () => {
        trackMetric('send_to_au_waitlist_clicked', { projectId: currentProjectId });
        setInfoModal({
            open: true,
            title: t('workspace.au.title'),
            message: t('workspace.au.message')
        });
    };

    const handleSaveCurrentProject = async () => {
        if (!currentProjectId || versions.length === 0) return;

        const safeIndex = getSafeVersionIndex(currentVersionIndex);
        const current = safeIndex >= 0 ? versions[safeIndex] : null;
        const updateData = {
            status: 'complete',
            prompt: currentPrompt || current?.prompt || '',
            result: current?.result || '',
            imageUrl: current?.imageUrl || null,
            history,
            versions,
            currentVersionIndex: safeIndex
        };

        await saveLocalProject({ ...updateData, id: currentProjectId });

        trackMetric('project_saved_manual', { projectId: currentProjectId });
        await loadProjects();
    };

    // Get agent status text
    const getAgentStatusText = () => {
        switch (agentState) {
            case AGENT_STATES.ANALYZING: return t('Agent.analyzing');
            case AGENT_STATES.GENERATING: return t('Agent.generating');
            case AGENT_STATES.COMPLETE: return t('Agent.complete');
            case AGENT_STATES.ERROR: return t('errors.generic');
            case AGENT_STATES.NOT_CONFIGURED: return 'AI Not Configured';
            default: return '';
        }
    };

    // Generate image for current version (adds to same message, not new slide)
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);

    const handleGenerateImage = async () => {
        if (isGeneratingImage || versions.length === 0) return;
        if (!gateAction('image')) return;
        if (!checkSeedreamAllowance('edit')) return;

        const safeIndex = getSafeVersionIndex(currentVersionIndex);
        const currentVersion = safeIndex >= 0 ? versions[safeIndex] : null;
        if (!currentVersion || currentVersion.imageUrl) return; // Already has image

        setIsGeneratingImage(true);

        try {
            const imagePrompt = `Create an image that visually represents: ${currentVersion.prompt || currentVersion.result?.substring(0, 200)}`;
            const imgResponse = await generateImage(imagePrompt, selectedImageModel);

            if (imgResponse.success) {
                const updatedVersions = versions.map((v, i) =>
                    i === safeIndex
                        ? { ...v, imageUrl: imgResponse.imageUrl, imageModel: imgResponse.model, imagePrompt: imagePrompt }
                        : v
                );
                setVersions(updatedVersions);
                incrementUsage('image', usageUserId);
                if (selectedImageModel === 'bytedance-seed/seedream-4.5') {
                    incrementModelUsage('seedream_edit', usageUserId);
                }
                refreshDailyUsage();
                trackMetric('image_generation_success', {
                    projectId: currentProjectId,
                    model: imgResponse.model,
                    type: 'edit'
                });

                if (currentProjectId) {
                    await saveLocalProject({
                        id: currentProjectId,
                        versions: updatedVersions,
                        currentVersionIndex: safeIndex,
                        history,
                        prompt: currentPrompt,
                        result: updatedVersions[safeIndex]?.result || '',
                        imageUrl: updatedVersions[safeIndex]?.imageUrl || null
                    });
                }
            } else {
                notifyAIIssue(imgResponse.error || 'Image generation failed', 'Error de imagen');
            }
        } catch (error) {
            notifyAIIssue(error.message || 'Image generation failed', 'Error de imagen');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const getCurrentVersion = () => {
        const safeIndex = getSafeVersionIndex(currentVersionIndex);
        return safeIndex >= 0 ? versions[safeIndex] : null;
    };

    const handleCopyCurrentVersionText = async () => {
        const current = getCurrentVersion();
        const text = current?.result?.trim() || '';
        if (!text) {
            setInfoModal({
                open: true,
                title: 'Sin texto para copiar',
                message: 'Esta version no trae texto de respuesta para copiar.'
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            setErrorMessage('No se pudo copiar el texto');
        }
    };

    const currentVersion = getCurrentVersion();
    const currentVersionHasText = Boolean(currentVersion?.result && currentVersion.result.trim());
    const currentVersionPromptPreview = (currentVersion?.imagePrompt || currentVersion?.prompt || currentPrompt || '').trim();


    return (
        <div className="workspace">
            {/* Sidebar */}
            <aside className={`workspace-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo" onClick={() => navigate(ROUTES.LANDING)}>
                        <Icon src={ICONS.LOGO} size="sm" />
                        <span className="sidebar-title">{AGENT_CONFIG.NAME}</span>
                    </div>

                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label={sidebarOpen ? t('workspace.actions.closeSidebar') : t('workspace.actions.openSidebar')}
                    >
                        <Icon
                            src={sidebarOpen ? ICONS.CLOSE : ICONS.DOCK}
                            size="xs"
                        />
                    </button>
                </div>

                <div className="sidebar-content">
                    <Button
                        variant="primary"
                        fullWidth
                        icon={ICONS.ADDED}
                        onClick={handleNewPrompt}
                        aria-label={t('workspace.newProject')}
                    >
                        {t('workspace.newProject')}
                    </Button>

                    {/* Media / Templates Section */}
                    <div className="sidebar-section media-section">
                        <div className="section-header" onClick={() => setMediaSidebarOpen(!mediaSidebarOpen)}>
                            <h3 className="section-title">Templates & Assets</h3>
                            <Icon
                                src={ICONS.DOCK}
                                size="xs"
                                style={{ transform: mediaSidebarOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                            />
                        </div>

                        {mediaSidebarOpen && (
                            <div className="media-grid-container">
                                <div className="media-actions-row">
                                    <button
                                        className="media-upload-btn"
                                        onClick={() => fileInputRef.current.click()}
                                        disabled={isUploadingMedia}
                                    >
                                        {isUploadingMedia ? <Loader variant="dots" size="xs" /> : <Icon src={ICONS.IMPORT} size="xs" />}
                                        <span>{isUploadingMedia ? "..." : "Upload"}</span>
                                    </button>
                                    <select
                                        className="media-role-select"
                                        value={uploadAssetRole}
                                        onChange={(e) => setUploadAssetRole(e.target.value)}
                                        aria-label="Tipo de asset"
                                    >
                                        <option value="reference">Ref</option>
                                        <option value="template">Template</option>
                                        <option value="logo">Logo</option>
                                        <option value="overlay">Overlay</option>
                                    </select>
                                    {!isPro && <span className="media-limit-badge">{mediaAssets.length}/3</span>}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        hidden
                                        accept="image/*"
                                        onChange={handleUploadMedia}
                                    />
                                </div>

                                <div className="media-grid">
                                    {mediaAssets.length === 0 ? (
                                        <p className="empty-text">No assets yet</p>
                                    ) : (
                                        mediaAssets.map(asset => (
                                            <div
                                                key={asset.id}
                                                className={`media-item ${attachedMedia?.id === asset.id ? 'selected' : ''} ${activeAssetIds.includes(asset.id) ? 'active' : ''}`}
                                                onClick={() => {
                                                    setAttachedMedia({ id: asset.id, name: asset.name, data: asset.data, role: asset.role });
                                                }}
                                            >
                                                <img src={asset.data} alt={asset.name} />
                                                <div className="media-item-top">
                                                    <span className="media-role-badge">{getAssetRoleLabel(asset.role)}</span>
                                                    {activeAssetIds.includes(asset.id) && <span className="media-active-dot" aria-hidden="true" />}
                                                </div>
                                                <button
                                                    className="media-item-delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteMedia(asset.id);
                                                    }}
                                                >
                                                    <Icon src={ICONS.DELETE} size="xs" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {attachedMedia && (
                                    <div className="media-selected-panel">
                                        <div className="media-selected-title">
                                            <span>Selected</span>
                                            <span className="media-selected-name">{attachedMedia.name}</span>
                                        </div>
                                        <div className="media-selected-controls">
                                            <select
                                                className="media-selected-role"
                                                value={attachedMedia.role || 'reference'}
                                                onChange={(e) => handleSelectedAssetRoleChange(e.target.value)}
                                                aria-label="Rol del asset seleccionado"
                                            >
                                                <option value="reference">Ref</option>
                                                <option value="template">Template</option>
                                                <option value="logo">Logo</option>
                                                <option value="overlay">Overlay</option>
                                            </select>

                                            <button
                                                type="button"
                                                className={`media-selected-use ${attachedMedia.id && isPersistedAssetId(attachedMedia.id) && activeAssetIds.includes(attachedMedia.id) ? 'active' : ''}`}
                                                onClick={toggleSelectedAssetActive}
                                                disabled={!attachedMedia.id || !isPersistedAssetId(attachedMedia.id)}
                                                aria-label="Usar en chat"
                                            >
                                                {attachedMedia.id && isPersistedAssetId(attachedMedia.id) && activeAssetIds.includes(attachedMedia.id) ? 'Using' : 'Use in chat'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {isAuthenticated && !isPro && (
                        <div className="project-limit-info">
                            <span>{projects.length}/{getPlanLimits(false).MAX_PROJECTS} {t('workspace.projects')}</span>
                            <span>
                                {dailyUsage.generate || 0}/{getPlanLimits(false).DAILY_GENERATIONS} gens hoy
                            </span>
                        </div>
                    )}

                    <div className="sidebar-section">
                        <h3 className="section-title">{t('workspace.projects')}</h3>
                        <div className="projects-list">
                            {projects.length === 0 ? (
                                <p className="empty-text">{t('workspace.untitled')}</p>
                            ) : (
                                projects.map((project) => (
                                    <div
                                        key={project.id}
                                        className={`project-item ${currentProjectId === project.id ? 'active' : ''}`}
                                        onClick={() => openProjectInWorkspace(project)}
                                    >
                                        <Icon src={ICONS.FOLDER} size="sm" />
                                        <span className="project-name">{project.name || 'Untitled'}</span>
                                        <span className="project-id-chip" title={project.id}>
                                            {String(project.id || '').slice(-6)}
                                        </span>
                                        <button
                                            className="project-delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProject(project.id);
                                            }}
                                            aria-label={t('workspace.actions.delete')}
                                        >
                                            <Icon src={ICONS.DELETE} size="xs" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <button className="icon-button" onClick={() => navigate(ROUTES.SETTINGS)} aria-label={t('settings.title')}>
                        <Icon src={ICONS.SETTINGS} size="sm" animation="spin" />
                    </button>
                    <button className="icon-button" onClick={toggleTheme} aria-label={t('settings.theme.title')}>
                        <Icon src={ICONS.FOQUITO} size="sm" animation="pop" />
                    </button>
                </div>
            </aside>

            {/* Main Canvas */}
            <main className="workspace-main">
                <header className="workspace-header">
                    <div className="header-left">
                        {isWorking && (
                            <div className="agent-status" aria-live="polite">
                                <Loader variant="dots" size="sm" />
                                <span>{getAgentStatusText()}</span>
                            </div>
                        )}
                        {agentState === AGENT_STATES.COMPLETE && (
                            <div className="agent-status complete" aria-live="polite">
                                <Icon src={ICONS.CHECK} size="sm" />
                                <span>{t('Agent.complete')}</span>
                            </div>
                        )}
                        {(agentState === AGENT_STATES.ERROR || agentState === AGENT_STATES.NOT_CONFIGURED) && (
                            <div className="agent-status error" aria-live="polite">
                                <Icon src={ICONS.INFO} size="sm" />
                                <span>{getAgentStatusText()}</span>
                            </div>
                        )}
                    </div>

                    <div className="header-center">
                        <span className="prompt-preview">
                            {currentPrompt || t('workspace.untitled')}
                        </span>
                    </div>

                    <div className="header-right">
                        {isAuthenticated && profile && (
                            <button
                                className="user-avatar-small"
                                onClick={() => navigate(ROUTES.SETTINGS)}
                                aria-label={profile.displayName}
                            >
                                {profile?.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt={profile.displayName} />
                                ) : (
                                    <span>{profile?.displayName?.charAt(0) || profile?.email?.charAt(0) || '?'}</span>
                                )}
                            </button>
                        )}
                    </div>
                </header>

                <div className="workspace-canvas">
                    {agentState === AGENT_STATES.NOT_CONFIGURED && (
                        <div className="canvas-error animate-fadeInUp">
                            <Icon src={ICONS.INFO} size="xl" />
                            <h3>{t('errors.notFound')}</h3>
                            <p>Configure your AI API key in <code>.env</code> file:</p>
                            <pre className="code-block">VITE_OPENROUTER_API_KEY=your_key</pre>
                            <Button variant="secondary" onClick={handleNewPrompt}>{t('common.back')}</Button>
                        </div>
                    )}

                    {agentState === AGENT_STATES.ERROR && (
                        <div className="canvas-error animate-fadeInUp">
                            <Icon src={ICONS.INFO} size="xl" />
                            <h3>{t('errors.generic')}</h3>
                            <p>{errorMessage}</p>
                            <Button variant="secondary" onClick={handleNewPrompt}>{t('common.retry')}</Button>
                        </div>
                    )}

                    {isWorking && !isIterating && (
                        <div className="canvas-loading">
                            <div className="agent-steps-log">
                                {agentSteps.map(step => (
                                    <div key={step.id} className={`step-item ${step.status}`}>
                                        <div className="step-dot" />
                                        <span className="step-text">{step.text}</span>
                                    </div>
                                ))}
                            </div>
                            <Loader variant="Agent" size="lg" />
                        </div>
                    )}

                    {(agentState === AGENT_STATES.COMPLETE || (isWorking && isIterating)) && versions.length > 0 && (
                        <div className={`canvas-result animate-fadeInUp ${isIterating ? 'iterating-blur' : ''}`}>
                            {versions.length > 1 && (
                                <div className="version-navigation">
                                    <button className="nav-btn" onClick={goToPrevVersion} disabled={currentVersionIndex === 0} aria-label="Previous version">
                                        <Icon src={ICONS.RELOAD} size="xs" style={{ transform: 'rotate(-90deg)' }} />
                                    </button>
                                    <span className="version-indicator">{currentVersionIndex + 1} / {versions.length}</span>
                                    <button className="nav-btn" onClick={goToNextVersion} disabled={currentVersionIndex === versions.length - 1} aria-label="Next version">
                                        <Icon src={ICONS.RELOAD} size="xs" style={{ transform: 'rotate(90deg)' }} />
                                    </button>
                                </div>
                            )}

                            <div className="result-card">
                                <div className="result-header">
                                    <span className="result-type">
                                        {currentVersion?.imageUrl ? t('workspace.result.contentVisual') : t('workspace.result.contentOnly')}
                                    </span>
                                    {currentVersion?.model && (
                                        <span className="result-model">{currentVersion.model}</span>
                                    )}
                                </div>
                                <div className="result-content">
                                    {showLastPromptInResult && currentVersionPromptPreview && (
                                        <div className="result-context-strip" role="note" aria-label="Prompt usado para esta respuesta">
                                            <span className="context-label">Prompt</span>
                                            <span className="context-text">{currentVersionPromptPreview}</span>
                                        </div>
                                    )}

                                    {currentVersionHasText ? (
                                        <div className="result-text">
                                            {currentVersionIndex === versions.length - 1 && currentVersion?.isNew
                                                ? displayedText
                                                : currentVersion?.result}
                                        </div>
                                    ) : (
                                        <div className="result-text result-text-empty">
                                            El modelo devolvio visual, pero sin bloque de texto en esta version.
                                        </div>
                                    )}
                                    {currentVersion?.imageUrl && (
                                        <div className="result-image" role="region" aria-label={t('workspace.accessibility.imageAlt')}>
                                            <img
                                                src={currentVersion.imageUrl}
                                                alt={currentVersion.imagePrompt || t('workspace.accessibility.imageAlt')}
                                            />
                                            <div className="image-actions">
                                                <button
                                                    className="image-download-btn"
                                                    onClick={() => handleDownloadImage(currentVersion.imageUrl)}
                                                    title={t('workspace.actions.download')}
                                                    aria-label={t('workspace.actions.download')}
                                                >
                                                    <Icon src={ICONS.TROPHY} size="sm" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        className="result-copy-text-btn"
                                        onClick={handleCopyCurrentVersionText}
                                    >
                                        <img src="/Assets/book.png" alt="" aria-hidden="true" />
                                        <span>Copiar texto</span>
                                    </button>
                                </div>
                                <div className="result-footer">
                                    <div className="agent-steps-compact">
                                        {currentVersion?.steps?.map(step => (
                                            <div key={step.id} className="step-pill">
                                                <Icon src={ICONS.CHECK} size="xs" />
                                                <span>{step.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {agentState === AGENT_STATES.IDLE && versions.length === 0 && (
                        <div className="canvas-empty">
                            <Icon src={ICONS.EMPTY} size="xl" />
                            <p>{t('workspace.untitled')}</p>
                            <Button variant="primary" onClick={handleNewPrompt}>{t('workspace.newProject')}</Button>
                        </div>
                    )}
                </div>

                {(agentState === AGENT_STATES.COMPLETE || (isWorking && isIterating)) && versions.length > 0 && (
                    <div className="workspace-chat-container">
                        {isWorking && isIterating && (
                            <div className="iteration-status animate-fadeIn">
                                <Loader variant="dots" size="xs" />
                                <span>{t('workspace.iterating')}</span>
                            </div>
                        )}

                        <div className="chat-utility-row">
                            <div className="task-mode-row">
                                <button
                                    type="button"
                                    className={`task-mode-btn ${creativeTaskMode === 'edit_template' ? 'active' : ''}`}
                                    onClick={() => handleTaskModeChange('edit_template')}
                                >
                                    Editar template
                                </button>
                                <button
                                    type="button"
                                    className={`task-mode-btn ${creativeTaskMode === 'from_scratch' ? 'active' : ''}`}
                                    onClick={() => handleTaskModeChange('from_scratch')}
                                >
                                    Desde cero
                                </button>
                            </div>

                            <button
                                className="chat-model-btn"
                                type="button"
                                onClick={() => setShowModelModal(true)}
                                title={t('workspace.model.change')}
                            >
                                <Icon src={ICONS.CONFIG} size="xs" />
                                <span>{t('workspace.model.short')}</span>
                            </button>

                            <button
                                className="chat-pro-cta-mini"
                                type="button"
                                onClick={() => setShowProModal(true)}
                                title={t('pro.cta')}
                            >
                                <Icon src={ICONS.PRO} size={16} />
                                <span>{t('pro.mini')}</span>
                            </button>
                        </div>

                        {attachedMedia && (
                            <div className="chat-attachment-preview animate-fadeInUp">
                                <img src={attachedMedia.data} alt="Context" />
                                <button className="remove-attach" onClick={() => setAttachedMedia(null)}>
                                    <Icon src={ICONS.CLOSE} size="xs" />
                                </button>
                            </div>
                        )}
                        {activeAssetIds.length > 0 && (
                            <div className="active-assets-row">
                                {mediaAssets
                                    .filter((asset) => activeAssetIds.includes(asset.id))
                                    .map((asset) => (
                                        <button
                                            key={asset.id}
                                            type="button"
                                            className="active-asset-chip"
                                            onClick={() => toggleAssetActive(asset.id)}
                                            title={`Desactivar ${asset.name}`}
                                        >
                                            <span>{getAssetRoleLabel(asset.role)}</span>
                                            <span>{asset.name}</span>
                                        </button>
                                    ))}
                            </div>
                        )}

                        <form className={`chat-input-wrapper ${isWorking && isIterating ? 'form-loading' : ''}`} onSubmit={handleIteration}>
                            <button
                                type="button"
                                className="chat-import-btn"
                                onClick={() => chatFileInputRef.current.click()}
                                title={t('workspace.media.attach')}
                                aria-label={t('workspace.media.attach')}
                            >
                                <Icon src={ICONS.IMPORT} size="xs" />
                            </button>
                            <input
                                type="file"
                                ref={chatFileInputRef}
                                hidden
                                accept="image/*"
                                onChange={handleAttachMediaFromChat}
                            />

                            <input
                                type="text"
                                className="chat-input"
                                placeholder={t('workspace.askChanges')}
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                disabled={isGenerating}
                                aria-label={t('workspace.askChanges')}
                            />
                            <button
                                type="submit"
                                className={`chat-send-btn ${isGenerating ? 'stop' : ''}`}
                                disabled={!isGenerating && !chatInput.trim()}
                                aria-label={isGenerating ? 'Stop generation' : 'Send'}
                                title={isGenerating ? 'Stop generation' : 'Send'}
                            >
                                {isGenerating
                                    ? <Icon src={ICONS.CLOSE} size="xs" />
                                    : <Icon src={ICONS.RELOAD} size="xs" />}
                            </button>
                        </form>
                    </div>
                )}
            </main>

            <aside className="workspace-toolbar">
                <div className="toolbar-group">
                    <Tooltip content={t('workspace.model.change')} position="left">
                        <button
                            className="toolbar-button"
                            aria-label={t('workspace.model.change')}
                            onClick={() => setShowModelModal(true)}
                        >
                            <Icon src={ICONS.CONFIG} size="sm" animation="spin" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.save')} position="left">
                        <button
                            className="toolbar-button"
                            disabled={versions.length === 0}
                            aria-label={t('workspace.actions.save')}
                            onClick={handleSaveCurrentProject}
                        >
                            <Icon src={ICONS.ADDED} size="sm" animation="pop" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.copy')} position="left">
                        <button
                            className="toolbar-button"
                            disabled={versions.length === 0}
                            onClick={() => {
                                const current = versions[currentVersionIndex];
                                if (current?.result) navigator.clipboard.writeText(current.result);
                            }}
                            aria-label={t('workspace.actions.copy')}
                        >
                            <Icon src={ICONS.COPY} size="sm" animation="pop" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.edit')} position="left">
                        <button className="toolbar-button" disabled={versions.length === 0} aria-label={t('workspace.actions.edit')}>
                            <Icon src={ICONS.EDIT_PEN} size="sm" animation="pop" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.generateImage')} position="left">
                        <button
                            className="toolbar-button"
                            disabled={versions.length === 0 || isGeneratingImage || versions[currentVersionIndex]?.imageUrl}
                            onClick={handleGenerateImage}
                            aria-label={t('workspace.actions.generateImage')}
                        >
                            {isGeneratingImage ? <Loader variant="dots" size="xs" /> : <Icon src={ICONS.FOQUITO} size="sm" animation="pop" />}
                        </button>
                    </Tooltip>
                </div>

                <div className="toolbar-divider" />

                <div className="toolbar-group">
                    <Tooltip content={t('workspace.actions.sendToAU')} position="left">
                        <button
                            className="toolbar-button toolbar-button-accent"
                            disabled={versions.length === 0}
                            aria-label={t('workspace.actions.sendToAU')}
                            onClick={handleSendToAU}
                        >
                            <Icon src={ICONS.ACTIVATE} size="sm" animation="pop" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.publish')} position="left">
                        <button
                            className="toolbar-button toolbar-button-accent"
                            disabled={versions.length === 0}
                            aria-label={t('workspace.actions.publish')}
                            onClick={handlePublishProject}
                        >
                            <Icon src={ICONS.DEPLOY} size="sm" animation="pop" />
                        </button>
                    </Tooltip>

                    <Tooltip content={t('workspace.actions.export')} position="left">
                        <button
                            className="toolbar-button"
                            disabled={versions.length === 0}
                            aria-label={t('workspace.actions.export')}
                            onClick={handleExportProject}
                        >
                            <Icon src={ICONS.SHARE} size="sm" animation="pop" />
                        </button>
                    </Tooltip>
                </div>

                <div className="toolbar-divider" />

                <div className="toolbar-group">
                    <Tooltip content={t('workspace.actions.delete')} position="left">
                        <button
                            className="toolbar-button toolbar-button-danger"
                            disabled={!currentProjectId}
                            onClick={() => currentProjectId && handleDeleteProject(currentProjectId)}
                            aria-label={t('workspace.actions.delete')}
                        >
                            <Icon src={ICONS.DELETE} size="sm" animation="shake" />
                        </button>
                    </Tooltip>
                </div>
            </aside>

            <Modal
                isOpen={paywall.open}
                onClose={() => setPaywall({ open: false, title: '', message: '', reason: '' })}
                title={paywall.title || t('paywall.defaultTitle')}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setPaywall({ open: false, title: '', message: '', reason: '' })}
                        >
                            {t('common.close')}
                        </Button>
                        <Button variant="primary" onClick={() => navigate(ROUTES.SETTINGS)}>
                            {t('paywall.viewPlan')}
                        </Button>
                    </>
                }
            >
                <p>{paywall.message}</p>
            </Modal>

            <Modal
                isOpen={infoModal.open}
                onClose={() => setInfoModal({ open: false, title: '', message: '' })}
                title={infoModal.title}
                footer={
                    <Button
                        variant="primary"
                        onClick={() => setInfoModal({ open: false, title: '', message: '' })}
                    >
                        {t('common.close')}
                    </Button>
                }
            >
                <p>{infoModal.message}</p>
            </Modal>

            <Modal
                isOpen={showProModal}
                onClose={() => setShowProModal(false)}
                title={t('pro.modal.title')}
                className="modal-pro"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setShowProModal(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => window.open('https://www.opencontent.ide/#settings?section=profile', '_blank', 'noopener,noreferrer')}
                        >
                            {t('pro.modal.buy')}
                        </Button>
                    </>
                )}
            >
                <div className="pro-hero">
                    <div className="pro-hero-badge">
                        <Icon src={ICONS.PRO} size={28} alt="PRO" />
                        <div className="pro-hero-title">{t('pro.modal.heroTitle')}</div>
                    </div>
                    <div className="pro-hero-sub">{t('pro.modal.subtitle')}</div>
                </div>

                <div className="pro-grid">
                    <div className="pro-card">
                        <div className="pro-card-title">{t('pro.modal.sectionStudioTitle')}</div>
                        <ul className="pro-benefits-list">
                            <li>{t('pro.modal.benefitModels')}</li>
                            <li>{t('pro.modal.benefitLimits')}</li>
                        </ul>
                    </div>
                    <div className="pro-card">
                        <div className="pro-card-title">{t('pro.modal.sectionIdeTitle')}</div>
                        <ul className="pro-benefits-list">
                            <li>{t('pro.modal.benefitIde')}</li>
                            <li>{t('pro.modal.benefitWorkflow')}</li>
                        </ul>
                    </div>
                    <div className="pro-card">
                        <div className="pro-card-title">{t('pro.modal.sectionSiteTitle')}</div>
                        <ul className="pro-benefits-list">
                            <li>{t('pro.modal.benefitSite')}</li>
                            <li>{t('pro.modal.benefitProfile')}</li>
                        </ul>
                    </div>
                </div>

                <div className="pro-footnote">
                    {t('pro.modal.noteRedirect')}
                </div>
            </Modal>

            <Modal
                isOpen={showModelModal}
                onClose={() => setShowModelModal(false)}
                title={t('workspace.model.title')}
                className="modal-model"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setShowModelModal(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="primary" onClick={saveModelSelection}>
                            {t('workspace.model.save')}
                        </Button>
                    </>
                )}
            >
                <div className="model-selector-block">
                    <label htmlFor="workspace-text-model">{t('workspace.model.textLabel')}</label>
                    <select
                        id="workspace-text-model"
                        value={selectedTextModel}
                        onChange={(e) => setSelectedTextModel(e.target.value)}
                    >
                        {textModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                                {getTextModelLabel(model.id)}
                            </option>
                        ))}
                    </select>
                    {!isPro && selectedTextModel === 'nvidia/nemotron-nano-12b-v2-vl:free' && (
                        <small>{t('workspace.model.glmHint')}</small>
                    )}
                    <div className="model-blurb">
                        {getTextModelBlurb(selectedTextModel)}
                    </div>
                </div>

                <div className="model-selector-block">
                    <label htmlFor="workspace-image-model">{t('workspace.model.imageLabel')}</label>
                    <select
                        id="workspace-image-model"
                        value={selectedImageModel}
                        onChange={(e) => setSelectedImageModel(e.target.value)}
                    >
                        {imageModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                                {getImageModelLabel(model.id)}
                            </option>
                        ))}
                    </select>
                    {!isPro && selectedImageModel === 'bytedance-seed/seedream-4.5' && (
                        <small>{t('workspace.model.seedreamHint')}</small>
                    )}
                    <div className="model-blurb">
                        {getImageModelBlurb(selectedImageModel)}
                    </div>
                </div>
            </Modal>
        </div>
    );
}

export default Workspace;
