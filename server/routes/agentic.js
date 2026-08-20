import { Router } from 'express';
import { runAgenticCycle } from '../lib/agentic.js';

export const agenticRoute = Router();

agenticRoute.post('/agentic', async (req, res) => {
    const body = req.body || {};
    const textModel = body.textModel || body.model;
    const textProvider = body.textProvider || body.provider;
    if (!promptValue(body.prompt)) return res.status(400).json({ error: 'prompt is required' });
    if (!textModel) return res.status(400).json({ error: 'model is required' });
    if (!textProvider) return res.status(400).json({ error: 'provider is required' });

    try {
        const result = await runAgenticCycle({
            prompt: body.prompt,
            textModel,
            textProvider,
            textBaseUrl: body.textBaseUrl || body.baseUrl,
            imageModel: body.imageModel,
            imageProvider: body.imageProvider,
            imageBaseUrl: body.imageBaseUrl,
            imageOptions: body.imageOptions,
            temperature: body.temperature,
            max_tokens: body.max_tokens
        });
        return res.json(result);
    } catch (error) {
        const clientError = new Set([
            'IMAGE_MODEL_REQUIRED',
            'IMAGE_PROVIDER_REQUIRED',
            'IMAGE_PROMPT_REQUIRED',
            'MODEL_REQUIRED',
            'PROMPT_REQUIRED',
            'PROVIDER_REQUIRED'
        ]).has(error.message);
        return res.status(clientError ? 400 : 500).json({ success: false, error: error.message || 'AGENTIC_FAILED' });
    }
});

function promptValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
