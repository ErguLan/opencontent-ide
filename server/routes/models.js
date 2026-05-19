/**
 * Models Route
 * GET /api/models — List available models
 */
import { Router } from 'express';

export const modelsRoute = Router();

modelsRoute.get('/models', async (_req, res) => {
    const models = [
        { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nanometron', type: 'text', provider: 'openrouter' },
        { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash', type: 'text', provider: 'openrouter' },
        { id: 'sourceful/riverflow-v2-fast', name: 'Riverflow V2 Fast', type: 'image', provider: 'openrouter' },
        { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5', type: 'image', provider: 'openrouter' }
    ];

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
