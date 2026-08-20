import { getErrorMessageFromResponse, normalizeError } from './shared.js';
import { appendOpenAIToolContext } from './toolContext.js';

export async function send(prompt, model, options = {}) {
    const baseUrl = (options.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return { success: false, error: 'CUSTOM_PROVIDER_URL_NOT_CONFIGURED' };
    const imageUrls = Array.isArray(options.imageUrls)
        ? options.imageUrls.filter(Boolean)
        : options.imageUrl ? [options.imageUrl] : [];
    const userContent = imageUrls.length > 0
        ? [{ type: 'text', text: prompt }, ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } }))]
        : prompt;
    const baseMessages = options.messages || [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: userContent }
    ];
    const messages = options.toolContext
        ? appendOpenAIToolContext(baseMessages, options.toolContext)
        : baseMessages;
    const body = { model, messages, stream: false, max_tokens: options.maxTokens || 1024 };
    if (Array.isArray(options.tools) && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = options.toolChoice || 'auto';
    }
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {})
            },
            body: JSON.stringify(body),
            signal: options.signal
        });
        if (!response.ok) throw new Error(await getErrorMessageFromResponse(response));
        const data = await response.json();
        const message = data.choices?.[0]?.message || {};
        return { success: true, content: message.content || '', model, toolCalls: message.tool_calls || [], assistantMessage: message, usage: data.usage };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function generateImage(prompt, model, options = {}) {
    const baseUrl = (options.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return { success: false, error: 'CUSTOM_PROVIDER_URL_NOT_CONFIGURED' };
    try {
        const response = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {})
            },
            body: JSON.stringify({
                model,
                prompt,
                n: 1,
                size: options.size || '1024x1024',
                quality: options.quality || 'standard',
                ...(options.responseFormat ? { response_format: options.responseFormat } : {})
            }),
            signal: options.signal
        });
        if (!response.ok) throw new Error(await getErrorMessageFromResponse(response));
        const data = await response.json();
        const imageUrl = data.data?.[0]?.url
            || (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null);
        return imageUrl ? { success: true, imageUrl, model } : { success: false, error: 'NO_IMAGE_IN_RESPONSE' };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function analyzeImage(imageUrl, prompt, options = {}) {
    const result = await send(prompt, options.visionModel || options.model, { ...options, imageUrl });
    if (!result.success) return result;
    return { success: true, analysis: result.content, model: result.model };
}
