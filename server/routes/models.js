/**
 * Models Route
 * GET /api/models — List available models
 */
import { Router } from 'express';

export const modelsRoute = Router();

modelsRoute.get('/models', async (_req, res) => {
    let models = [];
    try {
        const configured = JSON.parse(process.env.OC_MODELS || '[]');
        if (Array.isArray(configured)) models = configured;
    } catch { /* Ignore malformed optional model configuration. */ }

    // Check Ollama
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    try {
        const resp = await fetch(`${ollamaUrl}/api/tags`);
        if (resp.ok) {
            const data = await resp.json();
            (data.models || []).forEach(m => {
                models.push({ id: m.name || m.model, name: m.name || m.model, type: 'text', provider: 'ollama' });
            });
        }
    } catch { /* Ollama not running */ }

    res.json({ models });
});
