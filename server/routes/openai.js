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
    const {
        model,
        provider,
        baseUrl,
        messages,
        temperature,
        max_tokens,
        stream,
        tools,
        tool_choice,
        parallel_tool_calls,
        response_format
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: { message: 'messages array is required', type: 'invalid_request_error' } });
    }

    // Extract the last user message as prompt
    const userMessages = messages.filter(m => m.role === 'user');
    const systemMessages = messages.filter(m => m.role === 'system');
    const prompt = userMessages[userMessages.length - 1]?.content || '';
    const systemPrompt = systemMessages[0]?.content || undefined;

    try {
        const result = await sendToProvider({
            prompt,
            model,
            provider,
            baseUrl,
            messages,
            systemPrompt,
            temperature: temperature || 0.7,
            max_tokens: max_tokens || 1024,
            tools,
            toolChoice: tool_choice,
            parallelToolCalls: parallel_tool_calls,
            responseFormat: response_format
        });

        const toolCalls = result.toolCalls || [];
        const completion = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: result.model || model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result.content || null,
                    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
                },
                finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
            }],
            usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();
            const choice = completion.choices[0];
            res.write(`data: ${JSON.stringify({
                id: completion.id,
                object: 'chat.completion.chunk',
                created: completion.created,
                model: completion.model,
                choices: [{ index: 0, delta: { role: 'assistant', content: choice.message.content }, finish_reason: null }]
            })}\n\n`);
            res.write(`data: ${JSON.stringify({
                id: completion.id,
                object: 'chat.completion.chunk',
                created: completion.created,
                model: completion.model,
                choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }]
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        return res.json(completion);
    } catch (err) {
        res.status(500).json({ error: { message: err.message, type: 'server_error' } });
    }
});
