/**
 * OpenAI-Compatible Route
 * POST /v1/chat/completions — Drop-in replacement for OpenAI API
 * 
 * This makes OpenContent IDE compatible with:
 * - LangChain
 * - n8n
 * - Any tool that speaks OpenAI protocol
 */
import { Router } from 'express';
import { sendToProvider } from '../lib/providers.js';

export const openaiRoute = Router();

openaiRoute.post('/chat/completions', async (req, res) => {
    const { model, messages, temperature, max_tokens, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: { message: 'messages array is required', type: 'invalid_request_error' } });
    }

    // Extract the last user message as prompt
    const userMessages = messages.filter(m => m.role === 'user');
    const systemMessages = messages.filter(m => m.role === 'system');
    const prompt = userMessages[userMessages.length - 1]?.content || '';
    const systemPrompt = systemMessages[0]?.content || undefined;

    if (stream) {
        return res.status(400).json({ error: { message: 'Streaming not yet supported', type: 'invalid_request_error' } });
    }

    try {
        const result = await sendToProvider({
            prompt,
            model: model || 'nvidia/nemotron-nano-12b-v2-vl:free',
            systemPrompt,
            temperature: temperature || 0.7,
            max_tokens: max_tokens || 1024
        });

        // Return in OpenAI format
        res.json({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: result.model || model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result.content || ''
                },
                finish_reason: 'stop'
            }],
            usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        });
    } catch (err) {
        res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
});
