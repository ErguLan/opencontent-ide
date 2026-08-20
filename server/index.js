/**
 * OpenContent IDE — API Server
 */
import express from 'express';
import cors from 'cors';
import { generateRoute } from './routes/generate.js';
import { imagesRoute } from './routes/images.js';
import { openaiRoute } from './routes/openai.js';
import { modelsRoute } from './routes/models.js';
import usageRoute from './routes/usage.js';
import storageRoute from './routes/storage.js';
import sessionsRoute from './routes/sessions.js';
import clientConfigRoute from './routes/clientConfig.js';
import { agenticRoute } from './routes/agentic.js';
import artifactsRoute from './routes/artifacts.js';

const app = express();
const PORT = process.env.PORT || 4000;
const DEBUG_LOGS = process.env.OC_DEBUG_LOGS === 'true';
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => { const startedAt = Date.now(); res.on('finish', () => { if (DEBUG_LOGS) console.error(`[server] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - startedAt}ms`); }); next(); });
app.get('/api/health', (_req, res) => { res.json({ status:'ok',name:'OpenContent IDE API',version:'0.1.0',providers:{ openrouter:!!process.env.OPENROUTER_API_KEY,openai:!!process.env.OPENAI_API_KEY,gemini:!!process.env.GOOGLE_API_KEY,anthropic:!!process.env.ANTHROPIC_API_KEY,ollama:!!process.env.OLLAMA_BASE_URL },debugLogs:DEBUG_LOGS,artifactEngine:true }); });
app.use('/api', generateRoute);
app.use('/api', imagesRoute);
app.use('/api', modelsRoute);
app.use('/api/usage', usageRoute);
app.use('/api/storage', storageRoute);
app.use('/api', sessionsRoute);
app.use('/api', clientConfigRoute);
app.use('/api', agenticRoute);
app.use('/api', artifactsRoute);
app.use('/v1', openaiRoute);
app.listen(PORT, () => { console.log(`OpenContent IDE API running on http://localhost:${PORT}`); console.log(`OpenAI-compatible endpoint: http://localhost:${PORT}/v1/chat/completions`); console.log(`Artifact endpoints: http://localhost:${PORT}/api/artifacts/*`); console.log(`Health: http://localhost:${PORT}/api/health`); });
