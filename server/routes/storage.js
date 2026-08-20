import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const router = express.Router();
const rootDirectory = path.resolve(process.env.OPENCONTENT_DATA_DIR || path.join(process.cwd(), 'data', 'artifacts'));

const safeSegment = (value, fallback) => {
    const sanitized = String(value || fallback)
        .replace(/[<>:"/\\|?*]/g, '-')
        .split('')
        .filter((character) => character.charCodeAt(0) >= 32)
        .join('')
        .replace(/\.\.+/g, '.')
        .replace(/^[. ]+|[. ]+$/g, '')
        .trim();
    return sanitized.slice(0, 180) || fallback;
};

const decodeDataUrl = (data) => {
    const match = String(data || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('INVALID_DATA_URL');
    return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
};

router.post('/files', async (req, res) => {
    if (process.env.OPENCONTENT_ENABLE_STORAGE !== 'true') {
        return res.status(403).json({ error: 'LOCAL_STORAGE_DISABLED' });
    }

    try {
        const { filename, data, metadata = {} } = req.body || {};
        const decoded = decodeDataUrl(data);
        const safeFilename = safeSegment(filename, `artifact-${randomUUID()}`);
        const projectSegment = safeSegment(metadata.projectId || 'ungrouped', 'ungrouped');
        const directory = path.join(rootDirectory, projectSegment);
        await fs.mkdir(directory, { recursive: true });
        const destination = path.join(directory, safeFilename);
        const relative = path.relative(rootDirectory, destination);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return res.status(400).json({ error: 'INVALID_STORAGE_PATH' });
        }
        if (metadata.allowOverwrite !== true) {
            try {
                await fs.access(destination);
                return res.status(409).json({ error: 'OVERWRITE_BLOCKED' });
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error;
            }
        }
        const temporary = `${destination}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, decoded.buffer);
        await fs.rename(temporary, destination);
        return res.json({ success: true, path: relative, mimeType: decoded.mimeType });
    } catch (error) {
        return res.status(400).json({ error: error.message || 'LOCAL_STORAGE_FAILED' });
    }
});

export default router;
