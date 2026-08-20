/**
 * Server-side provider adapters.
 * The caller selects the provider; model IDs are never invented here.
 */

import skills from './skills.js';

const KEYS = {
    openrouter: process.env.OPENROUTER_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    custom: process.env.CUSTOM_API_KEY || ''
};
const BASE_URLS = {
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/models',
    anthropic: 'https://api.anthropic.com/v1/messages',
    custom: (process.env.CUSTOM_BASE_URL || '').replace(/\/$/, '')
};
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const PROVIDER_TIMEOUT_MS = Number(process.env.OC_PROVIDER_TIMEOUT_MS) || 45000;

async function fetchWithTimeout(url, options, provider) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`${provider.toUpperCase()}_TIMEOUT_${PROVIDER_TIMEOUT_MS}MS`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function getSkill(skillId) {
    return skills.find((skill) => skill.id === skillId) || skills[0];
}

function getProvider(provider, model) {
    if (provider) return String(provider).trim().toLowerCase();
    if (process.env.OC_DEFAULT_PROVIDER) return process.env.OC_DEFAULT_PROVIDER.toLowerCase();
    if (!model) throw new Error('MODEL_REQUIRED');
    throw new Error('MODEL_PROVIDER_REQUIRED');
}

function getKey(provider) {
    if (provider === 'ollama') return '';
    if (provider === 'custom') return KEYS.custom;
    const key = KEYS[provider];
    if (!key) throw new Error(`${provider.toUpperCase()}_API_KEY_NOT_CONFIGURED`);
    return key;
}

async function readError(response) {
    const payload = await response.json().catch(() => ({}));
    return payload?.error?.message || payload?.error || payload?.message || `HTTP_${response.status}`;
}

function ensureModel(model) {
    if (!model || typeof model !== 'string' || !model.trim()) throw new Error('MODEL_REQUIRED');
    return model.trim();
}

const serializeToolResult = (result) => JSON.stringify(result || {});

function getToolCall(call) {
    return {
        id: call.id,
        type: 'function',
        function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments || {})
        }
    };
}

function appendOpenAIToolContext(messages, context = {}) {
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    return [
        ...messages,
        {
            role: 'assistant',
            content: context.assistantMessage?.content || null,
            tool_calls: calls.map(getToolCall)
        },
        ...results.map((item, index) => ({
            role: 'tool',
            tool_call_id: (calls[index] || item.call)?.id,
            content: serializeToolResult(item.result ?? item)
        }))
    ];
}

function buildOpenAIMessages(prompt, systemPrompt, options = {}) {
    const messages = Array.isArray(options.messages) && options.messages.length > 0
        ? options.messages
        : [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
        ];
    return options.toolContext ? appendOpenAIToolContext(messages, options.toolContext) : messages;
}

async function sendToOpenAICompatible({ provider, prompt, model, systemPrompt, temperature, max_tokens, maxTokens, baseUrl, apiKey, ...options }) {
    const messages = buildOpenAIMessages(prompt, systemPrompt, options);
    const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            'X-Title': 'OpenContent IDE API'
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: temperature ?? 0.7,
            max_tokens: max_tokens ?? maxTokens ?? 1024,
            ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
            ...(Array.isArray(options.tools) && options.tools.length > 0 ? {
                tools: options.tools,
                tool_choice: options.toolChoice || 'auto',
                ...(typeof options.parallelToolCalls === 'boolean' ? { parallel_tool_calls: options.parallelToolCalls } : {})
            } : {})
        })
    }, provider);
    if (!response.ok) throw new Error(`${provider.toUpperCase()}_${await readError(response)}`);
    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    return {
        success: true,
        content: message.content || '',
        model,
        provider,
        usage: data.usage,
        toolCalls: message.tool_calls || [],
        assistantMessage: message
    };
}

function normalizeGoogleSchema(schema = {}) {
    const normalized = { ...schema };
    delete normalized.additionalProperties;
    if (normalized.properties) {
        normalized.properties = Object.fromEntries(
            Object.entries(normalized.properties).map(([key, value]) => [key, normalizeGoogleSchema(value)])
        );
    }
    if (normalized.items) normalized.items = normalizeGoogleSchema(normalized.items);
    return normalized;
}

function toGoogleTools(tools = []) {
    const declarations = tools
        .filter((tool) => tool?.type === 'function' && tool.function?.name)
        .map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: normalizeGoogleSchema(tool.function.parameters)
        }));
    return declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined;
}

function appendGoogleToolContext(contents, context = {}) {
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return contents;

    return [
        ...contents,
        { role: 'model', parts: context.assistantMessage?.parts || [] },
        {
            role: 'user',
            parts: results.map((item, index) => ({
                functionResponse: {
                    name: (calls[index] || item.call)?.name,
                    response: { result: item.result ?? item }
                }
            }))
        }
    ];
}

function buildGoogleContents(prompt, systemPrompt, options = {}) {
    const contents = Array.isArray(options.contents) && options.contents.length > 0
        ? options.contents
        : [
            ...(systemPrompt ? [{ role: 'user', parts: [{ text: systemPrompt }] }, { role: 'model', parts: [{ text: 'OK' }] }] : []),
            { role: 'user', parts: [{ text: prompt }] }
        ];
    return options.toolContext ? appendGoogleToolContext(contents, options.toolContext) : contents;
}

async function sendToGoogle({ prompt, model, systemPrompt, temperature, max_tokens, maxTokens, apiKey, ...options }) {
    const contents = buildGoogleContents(prompt, systemPrompt, options);
    const googleTools = toGoogleTools(options.tools);
    const response = await fetchWithTimeout(`${BASE_URLS.google}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: max_tokens ?? maxTokens ?? 1024 },
            ...(googleTools ? { tools: googleTools } : {}),
            ...(googleTools && options.toolChoice ? {
                toolConfig: { functionCallingConfig: { mode: options.toolChoice === 'none' ? 'NONE' : 'AUTO' } }
            } : {})
        })
    }, 'google');
    if (!response.ok) throw new Error(`GOOGLE_${await readError(response)}`);
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    return {
        success: true,
        content: parts.map((part) => part.text || '').join(''),
        model,
        provider: 'google',
        usage: data.usageMetadata,
        toolCalls: parts
            .filter((part) => part.functionCall)
            .map((part, index) => ({
                id: `google_tool_${Date.now()}_${index}`,
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                }
            })),
        assistantMessage: data.candidates?.[0]?.content
    };
}

function appendAnthropicToolContext(messages, context = {}) {
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    return [
        ...messages,
        { role: 'assistant', content: context.assistantMessage?.content || [] },
        {
            role: 'user',
            content: results.map((item, index) => ({
                type: 'tool_result',
                tool_use_id: (calls[index] || item.call)?.id,
                content: serializeToolResult(item.result ?? item)
            }))
        }
    ];
}

function buildAnthropicMessages(prompt, options = {}) {
    const messages = Array.isArray(options.messages) && options.messages.length > 0
        ? options.messages
        : [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
    return options.toolContext ? appendAnthropicToolContext(messages, options.toolContext) : messages;
}

async function sendToAnthropic({ prompt, model, systemPrompt, temperature, max_tokens, maxTokens, apiKey, ...options }) {
    const messages = buildAnthropicMessages(prompt, options);
    const anthropicTools = (options.tools || [])
        .filter((tool) => tool?.type === 'function' && tool.function?.name)
        .map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters
        }));
    const response = await fetchWithTimeout(BASE_URLS.anthropic, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            max_tokens: max_tokens ?? maxTokens ?? 1024,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            temperature: temperature ?? 0.7,
            messages,
            ...(anthropicTools.length > 0 ? {
                tools: anthropicTools,
                tool_choice: options.toolChoice === 'none' ? { type: 'none' } : { type: 'auto' }
            } : {})
        })
    }, 'anthropic');
    if (!response.ok) throw new Error(`ANTHROPIC_${await readError(response)}`);
    const data = await response.json();
    const blocks = data.content || [];
    return {
        success: true,
        content: blocks.map((block) => block.text || '').join(''),
        model,
        provider: 'anthropic',
        usage: data.usage,
        toolCalls: blocks
            .filter((block) => block.type === 'tool_use')
            .map((block) => ({
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input || {}) }
            })),
        assistantMessage: { role: 'assistant', content: blocks }
    };
}

function appendOllamaToolContext(messages, context = {}) {
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    return [
        ...messages,
        {
            role: 'assistant',
            content: context.assistantMessage?.content || '',
            tool_calls: calls.map(getToolCall)
        },
        ...results.map((item) => ({ role: 'tool', content: serializeToolResult(item.result ?? item) }))
    ];
}

function buildOllamaMessages(prompt, systemPrompt, options = {}) {
    const messages = Array.isArray(options.messages) && options.messages.length > 0
        ? options.messages
        : [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
        ];
    return options.toolContext ? appendOllamaToolContext(messages, options.toolContext) : messages;
}

async function sendToOllama({ prompt, model, systemPrompt, baseUrl, ...options }) {
    const endpoint = (baseUrl || OLLAMA_BASE_URL).replace(/\/$/, '');
    const messages = buildOllamaMessages(prompt, systemPrompt, options);
    const response = await fetchWithTimeout(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages,
            stream: false,
            ...(Array.isArray(options.tools) && options.tools.length > 0 && options.toolChoice !== 'none'
                ? { tools: options.tools }
                : {})
        })
    }, 'ollama');
    if (!response.ok) throw new Error(`OLLAMA_${await readError(response)}`);
    const data = await response.json();
    return {
        success: true,
        content: data.message?.content || '',
        model,
        provider: 'ollama',
        toolCalls: data.message?.tool_calls || [],
        assistantMessage: data.message
    };
}

export async function sendToProvider({ prompt, model, provider, skill, systemPrompt, temperature, max_tokens, maxTokens, baseUrl, ...options }) {
    const selectedProvider = getProvider(provider, model);
    const selectedModel = ensureModel(model);
    const skillData = skill ? getSkill(skill) : skills[0];
    const resolvedSystemPrompt = systemPrompt || skillData.systemPrompt;

    if (selectedProvider === 'ollama') {
        return sendToOllama({ prompt, model: selectedModel, systemPrompt: resolvedSystemPrompt, baseUrl, ...options });
    }
    const apiKey = getKey(selectedProvider);
    if (selectedProvider === 'google') {
        return sendToGoogle({ prompt, model: selectedModel, systemPrompt: resolvedSystemPrompt, temperature, max_tokens, maxTokens, apiKey, ...options });
    }
    if (selectedProvider === 'anthropic') {
        return sendToAnthropic({ prompt, model: selectedModel, systemPrompt: resolvedSystemPrompt, temperature, max_tokens, maxTokens, apiKey, ...options });
    }
    const endpoint = selectedProvider === 'custom'
        ? (typeof (baseUrl || BASE_URLS.custom) === 'string' ? (baseUrl || BASE_URLS.custom).replace(/\/$/, '') : '')
        : BASE_URLS[selectedProvider];
    if (!endpoint) throw new Error('CUSTOM_PROVIDER_URL_NOT_CONFIGURED');
    return sendToOpenAICompatible({ provider: selectedProvider, prompt, model: selectedModel, systemPrompt: resolvedSystemPrompt, temperature, max_tokens, maxTokens, baseUrl: endpoint, apiKey, ...options });
}

async function generateOpenAIImage({ provider, prompt, model, options, baseUrl, apiKey }) {
    const endpoint = baseUrl.replace(/\/$/, '');
    const response = await fetch(`${endpoint}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ ...options, model, prompt, n: 1 })
    });
    if (!response.ok) throw new Error(`${provider.toUpperCase()}_${await readError(response)}`);
    const data = await response.json();
    const first = data.data?.[0];
    const imageUrl = first?.url || (first?.b64_json ? `data:${first.media_type || 'image/png'};base64,${first.b64_json}` : null);
    if (!imageUrl) throw new Error('NO_IMAGE_IN_RESPONSE');
    return { success: true, imageUrl, data, model, provider };
}

async function generateGoogleImage({ prompt, model, options, apiKey }) {
    const response = await fetch(`${BASE_URLS.google}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { ...options, responseModalities: ['TEXT', 'IMAGE'] }
        })
    });
    if (!response.ok) throw new Error(`GOOGLE_${await readError(response)}`);
    const data = await response.json();
    const imagePart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData) throw new Error('NO_IMAGE_IN_RESPONSE');
    return { success: true, imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`, model, provider: 'google' };
}

function isHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function toImageDataUrl(value, mimeType = 'image/png') {
    if (typeof value !== 'string' || !value) return null;
    if (value.startsWith('data:image/')) return value;
    if (value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        return `data:${mimeType};base64,${value}`;
    }
    return null;
}

function extractOpenRouterImage(data) {
    const message = data?.choices?.[0]?.message;
    if (!message) return null;
    const candidates = Array.isArray(message.images) ? message.images : [];
    for (const candidate of candidates) {
        const url = candidate?.image_url?.url || candidate?.url;
        if (isHttpUrl(url)) return url;
        const dataUrl = toImageDataUrl(candidate?.b64_json || candidate?.base64 || candidate?.data, candidate?.mime_type);
        if (dataUrl) return dataUrl;
    }
    const content = Array.isArray(message.content) ? message.content : [message.content];
    for (const part of content) {
        const url = part?.image_url?.url || part?.url;
        if (isHttpUrl(url)) return url;
        const dataUrl = toImageDataUrl(
            part?.b64_json || part?.base64 || part?.data || part?.inline_data?.data,
            part?.mime_type || part?.inline_data?.mime_type
        );
        if (dataUrl) return dataUrl;
        if (typeof part === 'string') {
            const matched = part.match(/https?:\/\/[^\s"')]+/i)?.[0];
            if (isHttpUrl(matched)) return matched;
        }
    }
    return null;
}

async function generateOpenRouterImage({ prompt, model, options, apiKey }) {
    const response = await fetch(`${BASE_URLS.openrouter}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://opencontent-ide.github.io',
            'X-Title': 'OpenContent IDE API'
        },
        body: JSON.stringify({
            model,
            modalities: ['image'],
            messages: [{ role: 'user', content: prompt }],
            ...(options?.size ? { size: options.size } : {}),
            ...(options?.quality ? { quality: options.quality } : {})
        })
    });
    if (!response.ok) throw new Error(`OPENROUTER_${await readError(response)}`);
    const data = await response.json();
    const imageUrl = extractOpenRouterImage(data);
    if (!imageUrl) throw new Error('NO_IMAGE_IN_RESPONSE');
    return { success: true, imageUrl, data, model, provider: 'openrouter' };
}

export async function generateImageProvider({ prompt, model, provider, options = {}, baseUrl }) {
    const selectedProvider = getProvider(provider, model);
    const selectedModel = ensureModel(model);
    if (selectedProvider === 'ollama' || selectedProvider === 'anthropic') {
        throw new Error('IMAGE_GENERATION_NOT_SUPPORTED');
    }
    const apiKey = getKey(selectedProvider);
    if (selectedProvider === 'openrouter') {
        return generateOpenRouterImage({ prompt, model: selectedModel, options, apiKey });
    }
    if (selectedProvider === 'google') {
        return generateGoogleImage({ prompt, model: selectedModel, options, apiKey });
    }
    const endpoint = selectedProvider === 'custom'
        ? (typeof (baseUrl || BASE_URLS.custom) === 'string' ? (baseUrl || BASE_URLS.custom).replace(/\/$/, '') : '')
        : BASE_URLS[selectedProvider];
    if (!endpoint) throw new Error('CUSTOM_PROVIDER_URL_NOT_CONFIGURED');
    return generateOpenAIImage({ provider: selectedProvider, prompt, model: selectedModel, options, baseUrl: endpoint, apiKey });
}
