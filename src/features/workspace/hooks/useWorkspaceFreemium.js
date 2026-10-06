/**
 * useWorkspaceFreemium — plan limits, usage counters and the paywall gate.
 *
 * The workspace never blocks a request by itself: it asks this gate, and the
 * gate either allows the action or opens the paywall with translated copy.
 */

import { useCallback, useMemo, useState } from 'react';
import { canUseAction, getDailyUsage, getPlanLimits } from '../../../services/freemium';
import { trackMetric } from '../../../services/metrics';
import { ENABLE_USAGE_LIMITS } from '../../../config/constants';

const CLOSED_PAYWALL = Object.freeze({ open: false, title: '', message: '', reason: '' });

const PAYWALL_REASON_KEYS = Object.freeze({
    DAILY_GENERATIONS_LIMIT: ['paywall.dailyGenerationsTitle', 'paywall.dailyGenerationsMessage'],
    ITERATIONS_PER_PROJECT_LIMIT: ['paywall.iterationsTitle', 'paywall.iterationsMessage'],
    DAILY_IMAGES_LIMIT: ['paywall.dailyImagesTitle', 'paywall.dailyImagesMessage'],
    DAILY_EXPORTS_LIMIT: ['paywall.dailyExportsTitle', 'paywall.dailyExportsMessage'],
    DAILY_PUBLISHES_LIMIT: ['paywall.dailyPublishesTitle', 'paywall.dailyPublishesMessage'],
    PROJECT_LIMIT: ['paywall.projectsTitle', 'paywall.projectsMessage']
});

export function useWorkspaceFreemium({ t, isPro, usageUserId, projectCount, currentProjectIterations }) {
    const [dailyUsage, setDailyUsage] = useState(() => getDailyUsage(usageUserId));
    const [paywall, setPaywall] = useState(CLOSED_PAYWALL);

    const planLimits = useMemo(() => getPlanLimits(isPro), [isPro]);

    const refreshUsage = useCallback(() => {
        setDailyUsage(getDailyUsage(usageUserId));
    }, [usageUserId]);

    const closePaywall = useCallback(() => setPaywall(CLOSED_PAYWALL), []);

    const openPaywall = useCallback((check) => {
        const keys = PAYWALL_REASON_KEYS[check.reason];
        setPaywall({
            open: true,
            title: t(keys ? keys[0] : 'paywall.defaultTitle'),
            message: t(keys ? keys[1] : 'paywall.defaultMessage'),
            reason: check.reason
        });
        trackMetric('paywall_shown', {
            reason: check.reason,
            used: check.used,
            limit: check.limit,
            plan: isPro ? 'PRO' : 'FREE'
        });
    }, [isPro, t]);

    /** Returns true when the action is allowed. Opens the paywall otherwise. */
    const gateAction = useCallback((action, extra = {}) => {
        // The default open-source build ships without plan limits. The gate only
        // engages when a fork opts in explicitly via VITE_ENABLE_USAGE_LIMITS.
        if (!ENABLE_USAGE_LIMITS) return true;
        const check = canUseAction(action, {
            isPro,
            userId: usageUserId,
            projectCount,
            currentProjectIterations,
            ...extra
        });
        if (!check.allowed) {
            openPaywall(check);
            return false;
        }
        return true;
    }, [currentProjectIterations, isPro, openPaywall, projectCount, usageUserId]);

    return {
        dailyUsage,
        planLimits,
        paywall,
        closePaywall,
        openPaywall,
        gateAction,
        refreshUsage
    };
}