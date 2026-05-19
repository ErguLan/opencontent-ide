import { FREE_LIMITS, PRO_LIMITS } from '../config/constants';

const STORAGE_PREFIX = 'oc_usage';
const MODEL_STORAGE_PREFIX = 'oc_model_usage';

const getTodayKey = () => {
    return new Date().toISOString().slice(0, 10);
};

const resolveUserKey = (userId) => {
    return userId || 'guest';
};

const getStorageKey = (userId) => {
    return `${STORAGE_PREFIX}:${resolveUserKey(userId)}:${getTodayKey()}`;
};

const DEFAULT_USAGE = {
    generate: 0,
    iteration: 0,
    image: 0,
    export: 0,
    publish: 0
};

export const getPlanLimits = (isPro) => {
    return isPro ? PRO_LIMITS : FREE_LIMITS;
};

export const getDailyUsage = (userId) => {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return { ...DEFAULT_USAGE };

    try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_USAGE, ...(parsed || {}) };
    } catch {
        return { ...DEFAULT_USAGE };
    }
};

export const incrementUsage = (action, userId, amount = 1) => {
    const usage = getDailyUsage(userId);
    usage[action] = (usage[action] || 0) + amount;
    localStorage.setItem(getStorageKey(userId), JSON.stringify(usage));
    return usage;
};

export const canUseAction = (action, { isPro, userId, projectCount = 0, currentProjectIterations = 0 } = {}) => {
    const limits = getPlanLimits(isPro);
    const usage = getDailyUsage(userId);

    const checks = {
        generate: {
            limit: limits.DAILY_GENERATIONS,
            used: usage.generate || 0,
            reason: 'DAILY_GENERATIONS_LIMIT'
        },
        iteration: {
            limit: limits.MAX_ITERATIONS,
            used: currentProjectIterations,
            reason: 'ITERATIONS_PER_PROJECT_LIMIT'
        },
        image: {
            limit: limits.DAILY_IMAGES,
            used: usage.image || 0,
            reason: 'DAILY_IMAGES_LIMIT'
        },
        export: {
            limit: limits.DAILY_EXPORTS,
            used: usage.export || 0,
            reason: 'DAILY_EXPORTS_LIMIT'
        },
        publish: {
            limit: limits.DAILY_PUBLISHES,
            used: usage.publish || 0,
            reason: 'DAILY_PUBLISHES_LIMIT'
        },
        project: {
            limit: limits.MAX_PROJECTS,
            used: projectCount,
            reason: 'PROJECT_LIMIT'
        }
    };

    const target = checks[action];
    if (!target) return { allowed: true, reason: null, used: 0, limit: -1, remaining: -1 };

    if (target.limit === -1) {
        return { allowed: true, reason: null, used: target.used, limit: target.limit, remaining: -1 };
    }

    const remaining = target.limit - target.used;
    return {
        allowed: remaining > 0,
        reason: remaining > 0 ? null : target.reason,
        used: target.used,
        limit: target.limit,
        remaining
    };
};

const getModelStorageKey = (userId) => {
    return `${MODEL_STORAGE_PREFIX}:${resolveUserKey(userId)}:${getTodayKey()}`;
};

const DEFAULT_MODEL_USAGE = {
    glm_text: 0,
    seedream_new: 0,
    seedream_edit: 0
};

export const getModelUsage = (userId) => {
    const raw = localStorage.getItem(getModelStorageKey(userId));
    if (!raw) return { ...DEFAULT_MODEL_USAGE };

    try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_MODEL_USAGE, ...(parsed || {}) };
    } catch {
        return { ...DEFAULT_MODEL_USAGE };
    }
};

export const incrementModelUsage = (key, userId, amount = 1) => {
    const usage = getModelUsage(userId);
    usage[key] = (usage[key] || 0) + amount;
    localStorage.setItem(getModelStorageKey(userId), JSON.stringify(usage));
    return usage;
};
