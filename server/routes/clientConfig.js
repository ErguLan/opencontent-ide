import express from 'express';

const router = express.Router();
let clientConfig = {
    models: [],
    activeTextModel: null,
    activeVisionModel: null,
    activeImageModel: null,
    updatedAt: null
};

function normalizeModel(model) {
    if (!model || typeof model !== 'object' || typeof model.id !== 'string') return null;
    return {
        id: model.id,
        nickname: model.nickname || model.id,
        provider: model.provider || null,
        type: model.type || 'text',
        capabilities: model.capabilities || {},
        baseUrl: model.baseUrl || '',
        requestFormat: model.requestFormat || 'openai-compatible'
    };
}

router.get('/client-config', (_req, res) => {
    res.json({ success: true, config: clientConfig });
});

router.post('/client-config', (req, res) => {
    const body = req.body || {};
    clientConfig = {
        models: Array.isArray(body.models) ? body.models.map(normalizeModel).filter(Boolean) : [],
        activeTextModel: typeof body.activeTextModel === 'string' ? body.activeTextModel : null,
        activeVisionModel: typeof body.activeVisionModel === 'string' ? body.activeVisionModel : null,
        activeImageModel: typeof body.activeImageModel === 'string' ? body.activeImageModel : null,
        updatedAt: new Date().toISOString()
    };
    res.json({ success: true, config: clientConfig });
});

export default router;
