/**
 * Usage & Paywall API Routes (Server-side)
 * OpenContent IDE
 *
 * Optional SaaS endpoints for tracking usage and enforcing limits.
 * Only active when ENABLE_USAGE_LIMITS is true.
 */

import { Router } from 'express';

const router = Router();

// In-memory usage store (replace with DB for production)
const usageStore = new Map();

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getUserKey(userId) {
    return `${userId}:${getTodayKey()}`;
}

// GET /api/usage/:userId — Get current usage for a user
router.get('/:userId', (req, res) => {
    const key = getUserKey(req.params.userId);
    const usage = usageStore.get(key) || { generate: 0, image: 0, export: 0, publish: 0 };
    res.json({ success: true, usage });
});

// POST /api/usage/:userId/increment — Increment an action
router.post('/:userId/increment', (req, res) => {
    const { action, amount = 1 } = req.body;
    if (!action) return res.status(400).json({ success: false, error: 'Action is required' });

    const key = getUserKey(req.params.userId);
    const current = usageStore.get(key) || { generate: 0, image: 0, export: 0, publish: 0 };
    current[action] = (current[action] || 0) + amount;
    usageStore.set(key, current);

    res.json({ success: true, usage: current });
});

// GET /api/limits — Get plan limits
router.get('/', (_req, res) => {
    res.json({
        success: true,
        limits: {
            free: {
                dailyGenerations: 5,
                dailyImages: 2,
                dailyExports: 2,
                dailyPublishes: 2,
                maxProjects: 5,
                maxIterations: 2
            },
            pro: {
                dailyGenerations: 100,
                dailyImages: 80,
                dailyExports: 100,
                dailyPublishes: 100,
                maxProjects: -1,
                maxIterations: 10
            }
        }
    });
});

export default router;
