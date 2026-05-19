/**
 * OpenContent IDE — API Server
 * 
 * Lightweight Express server that wraps AI providers
 * with REST endpoints, including an OpenAI-compatible one.
 * 
 * Usage:
 *   OPENROUTER_API_KEY=sk-... node server/index.js
 *   
 * Then query:
 *   POST http://localhost:4000/api/generate
 *   POST http://localhost:4000/v1/chat/completions  (OpenAI-compatible)
 *   GET  http://localhost:4000/api/models
 *   GET  http://localhost:4000/api/health
 */

import express from 'express';
import cors from 'cors';
import { generateRoute } from './routes/generate.js';
import { imagesRoute } from './routes/images.js';
import { openaiRoute } from './routes/openai.js';
import { modelsRoute } from './routes/models.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        name: 'OpenContent IDE API',
        version: '0.1.0',
        providers: {
            openrouter: !!process.env.OPENROUTER_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            ollama: !!process.env.OLLAMA_BASE_URL
        }
    });
});

// Routes
app.use('/api', generateRoute);
app.use('/api', imagesRoute);
app.use('/api', modelsRoute);
app.use('/v1', openaiRoute); // OpenAI-compatible

app.listen(PORT, () => {
    console.log(`OpenContent IDE API running on http://localhost:${PORT}`);
    console.log(`OpenAI-compatible endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
});
