/**
 * App Constants & Configuration
 * OpenContent IDE
 */

// App info
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'OpenContent IDE';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0';
export const REPO_URL = 'https://github.com/ErguLan/opencontent-ide';

// Feature flags
export const ENABLE_USAGE_LIMITS = import.meta.env.VITE_ENABLE_USAGE_LIMITS === 'true';
export const CLI_ENABLED = import.meta.env.VITE_CLI_ENABLED !== 'false';
export const CLI_ACCESS = import.meta.env.VITE_CLI_ACCESS || 'public'; // 'public' | 'local_only' | 'disabled'

// Routes
export const ROUTES = {
    LANDING: '/',
    WORKSPACE: '/workspace',
    SETTINGS: '/settings',
    LOGIN: '/login',
    PROJECT: '/project/:id',
    CLI: '/cli',
    GALLERY: '/gallery',
    ARTIFACTS: '/artifacts'
};

// Local storage keys
export const STORAGE_KEYS = {
    THEME: 'oc_theme',
    LANGUAGE: 'oc_language',
    USER: 'oc_user',
    PROJECTS: 'oc_projects',
    LAST_PROJECT: 'oc_last_project',
    PENDING_PROMPT: 'oc_pending_prompt',
    SELECTED_TEXT_MODEL: 'oc_selected_text_model',
    SELECTED_VISION_MODEL: 'oc_selected_vision_model',
    SELECTED_IMAGE_MODEL: 'oc_selected_image_model',
    SHOW_LAST_PROMPT: 'oc_show_last_prompt',
    IMAGE_PROCESSING_MODE: 'oc_image_processing_mode',
    CREATIVE_TASK_MODE: 'oc_creative_task_mode',
    AI_TIMEOUT_MS: 'oc_ai_timeout_ms',
    ACTIVE_SKILL: 'oc_active_skill',
    CUSTOM_TEXT_MODEL: 'oc_custom_text_model',
    CUSTOM_IMAGE_MODEL: 'oc_custom_image_model',
    OLLAMA_URL: 'oc_ollama_url',
    MODELS: 'oc_models',
    CLI_ACCESS: 'oc_cli_access',
    STREAMING_ENABLED: 'oc_streaming_enabled',
    TOOL_CALLING_ENABLED: 'oc_tool_calling_enabled',
    LOCAL_SAVE_SETTINGS: 'oc_local_save_settings',
    IMAGE_ARTIFACTS: 'oc_image_artifacts',
    BRAND_KIT: 'oc_brand_kit',
    ARTIFACT_STUDIO: 'oc_artifact_studio'
};

// Theme values
export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

// Language codes
export const LANGUAGES = {
    ES: 'es',
    EN: 'en'
};

// User plans (kept for optional SaaS forks)
export const PLANS = {
    FREE: 'FREE',
    PRO: 'PRO'
};

// Free tier limits (only enforced when ENABLE_USAGE_LIMITS is true)
export const FREE_LIMITS = {
    DAILY_GENERATIONS: 5,
    DAILY_IMAGES: 2,
    DAILY_EXPORTS: 2,
    DAILY_PUBLISHES: 1,
    MAX_PROJECTS: 5,
    MAX_ITERATIONS: 2,
    WATERMARK: true
};

// Pro tier limits
export const PRO_LIMITS = {
    DAILY_GENERATIONS: 100,
    DAILY_IMAGES: 80,
    DAILY_EXPORTS: 100,
    DAILY_PUBLISHES: 100,
    MAX_PROJECTS: -1,
    MAX_ITERATIONS: 10,
    WATERMARK: false
};

// Agent configuration
export const AGENT_CONFIG = {
    NAME: 'Agent',
    MAX_ITERATIONS: 5,
    TIMEOUT_MS: 60000
};

// Asset paths
export const ASSETS = {
    LOGO: '/brand/logo.svg',
    ICONS_DIR: '/icons'
};

// Safety bypass: set to true to allow Image Config Panel outside agentic mode
// WARNING: This bypasses the agentic-only restriction
export const ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC = false;

// Animation durations (sync with CSS)
export const ANIMATION = {
    FAST: 100,
    NORMAL: 200,
    SMOOTH: 300,
    SLOW: 400,
    SPRING: 500
};

export default {
    APP_NAME,
    APP_VERSION,
    ENABLE_USAGE_LIMITS,
    ROUTES,
    STORAGE_KEYS,
    THEMES,
    LANGUAGES,
    PLANS,
    FREE_LIMITS,
    PRO_LIMITS,
    AGENT_CONFIG,
    ASSETS,
    ANIMATION
};
