import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const router = express.Router();
const sessionsFile = path.resolve(
    process.env.OPENCONTENT_SESSIONS_FILE || path.join(process.cwd(), 'data', 'sessions.json')
);

async function readSessions() {
    try {
        const raw = await fs.readFile(sessionsFile, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
    }
}

async function writeSessions(sessions) {
    await fs.mkdir(path.dirname(sessionsFile), { recursive: true });
    const temporary = `${sessionsFile}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(sessions, null, 2), 'utf8');
    await fs.rename(temporary, sessionsFile);
}

function normalizeSession(body = {}, existing = null) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const result = typeof body.result === 'string'
        ? body.result
        : typeof body.content === 'string'
            ? body.content
            : '';
    if (!prompt || !result) throw new Error('SESSION_PROMPT_AND_RESULT_REQUIRED');

    const now = new Date().toISOString();
    const version = {
        type: body.type || 'text',
        prompt,
        result,
        model: body.model || null,
        imageUrl: body.imageUrl || null,
        imageModel: body.imageModel || null,
        timestamp: body.updatedAt || now,
        isNew: false,
        steps: Array.isArray(body.steps) ? body.steps : [{ id: 1, text: 'External session', status: 'done' }]
    };

    return {
        ...(existing || {}),
        id: existing?.id || body.id || `external_${randomUUID()}`,
        name: body.name || prompt.slice(0, 50),
        prompt,
        result,
        type: body.type || 'text',
        model: body.model || null,
        provider: body.provider || null,
        source: body.source || 'external',
        externalSource: body.externalSource || body.source || 'external',
        history: Array.isArray(body.history) && body.history.length > 0
            ? body.history
            : [{ role: 'user', content: prompt }, { role: 'assistant', content: result }],
        versions: Array.isArray(body.versions) && body.versions.length > 0
            ? body.versions
            : [version],
        currentVersionIndex: Number.isInteger(body.currentVersionIndex) ? body.currentVersionIndex : 0,
        imageUrl: body.imageUrl || null,
        imageModel: body.imageModel || null,
        status: body.status || 'complete',
        createdAt: existing?.createdAt || body.createdAt || now,
        updatedAt: body.updatedAt || now
    };
}

router.get('/sessions', async (_req, res) => {
    try {
        return res.json({ sessions: await readSessions() });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'SESSIONS_READ_FAILED' });
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const sessions = await readSessions();
        const existingIndex = sessions.findIndex((session) => session.id === req.body?.id);
        const session = normalizeSession(req.body, existingIndex >= 0 ? sessions[existingIndex] : null);
        if (existingIndex >= 0) sessions[existingIndex] = session;
        else sessions.push(session);
        await writeSessions(sessions.slice(-200));
        return res.json({ success: true, session });
    } catch (error) {
        const clientError = error.message === 'SESSION_PROMPT_AND_RESULT_REQUIRED';
        return res.status(clientError ? 400 : 500).json({ error: error.message || 'SESSION_WRITE_FAILED' });
    }
});

export default router;
