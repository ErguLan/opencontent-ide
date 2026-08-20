/**
 * Generate Route
 * POST /api/generate — Generate text content
 */
import { Router } from 'express';
import { sendToProvider } from '../lib/providers.js';

export const generateRoute = Router();

generateRoute.post('/generate', async (req, res) => {
    const { prompt, model, provider, baseUrl, skill, systemPrompt, temperature, max_tokens } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    if (!model) return res.status(400).json({ error: 'model is required' });
    if (!provider && !process.env.OC_DEFAULT_PROVIDER) return res.status(400).json({ error: 'provider is required' });

    try {
        const result = await sendToProvider({
            prompt,
            model,
            provider,
            baseUrl,
            skill,
            systemPrompt,
            temperature: temperature || 0.7,
            max_tokens: max_tokens || 1024
        });
        res.json(result);
    } catch (err) {
        if (process.env.OC_DEBUG_LOGS === 'true') {
            console.error(`[generate] failed provider=${provider || process.env.OC_DEFAULT_PROVIDER || 'unset'} model=${model || 'unset'} error=${err.message}`);
        }
        res.status(500).json({ error: err.message });
    }
});
