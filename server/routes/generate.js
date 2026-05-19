/**
 * Generate Route
 * POST /api/generate — Generate text content
 */
import { Router } from 'express';
import { sendToProvider } from '../lib/providers.js';

export const generateRoute = Router();

generateRoute.post('/generate', async (req, res) => {
    const { prompt, model, skill, temperature, max_tokens } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    try {
        const result = await sendToProvider({
            prompt,
            model: model || 'nvidia/nemotron-nano-12b-v2-vl:free',
            skill,
            temperature: temperature || 0.7,
            max_tokens: max_tokens || 1024
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
