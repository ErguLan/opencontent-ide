/**
 * Images Route
 * POST /api/generate-image — Generate an image
 */
import { Router } from 'express';
import { generateImageProvider } from '../lib/providers.js';

export const imagesRoute = Router();

imagesRoute.post('/generate-image', async (req, res) => {
    const { prompt, model } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    try {
        const result = await generateImageProvider({
            prompt,
            model: model || 'sourceful/riverflow-v2-fast'
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
