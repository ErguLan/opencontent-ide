const serializeResult = (result) => JSON.stringify(result || {});

const getToolCall = (call) => ({
    id: call.id,
    type: 'function',
    function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments || {})
    }
});

const getImageResult = (item) => item?.result?.imageUrl || null;

export function appendOpenAIToolContext(baseMessages, context = {}) {
    const messages = [...baseMessages];
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    messages.push({
        role: 'assistant',
        content: context.assistantMessage?.content || null,
        tool_calls: calls.map(getToolCall)
    });
    results.forEach((item, index) => {
        const call = calls[index] || item.call;
        messages.push({
            role: 'tool',
            tool_call_id: call?.id,
            content: serializeResult(item.result)
        });
        const imageUrl = getImageResult(item);
        if (imageUrl) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: `Tool result image artifact: ${item.result.assetId || 'generated'}` },
                    { type: 'image_url', image_url: { url: imageUrl } }
                ]
            });
        }
    });
    return messages;
}

export function appendAnthropicToolContext(baseMessages, context = {}) {
    const messages = [...baseMessages];
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    messages.push({
        role: 'assistant',
        content: context.assistantMessage?.content || []
    });
    const resultContent = results.flatMap((item, index) => {
        const content = [{
            type: 'tool_result',
            tool_use_id: (calls[index] || item.call)?.id,
            content: serializeResult(item.result)
        }];
        const imageUrl = getImageResult(item);
        if (imageUrl?.startsWith('data:')) {
            const [header, data] = imageUrl.split(',');
            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: header?.split(';')?.[0]?.split(':')?.[1] || 'image/png',
                    data
                }
            });
        }
        return content;
    });
    messages.push({ role: 'user', content: resultContent });
    return messages;
}

const toGoogleParts = (url) => {
    if (!url?.startsWith('data:')) return [];
    const [header, data] = url.split(',');
    const mimeType = header?.split(';')?.[0]?.split(':')?.[1] || 'image/png';
    return [{ inlineData: { mimeType, data } }];
};

export function appendGoogleToolContext(baseContents, context = {}) {
    const contents = [...baseContents];
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return contents;

    const assistantParts = context.assistantMessage?.parts || [];
    contents.push({ role: 'model', parts: assistantParts });
    contents.push({
        role: 'user',
        parts: results.flatMap((item, index) => {
            const call = calls[index] || item.call;
            const functionPart = {
                functionResponse: {
                    name: call?.name,
                    response: { result: item.result || {} }
                }
            };
            return [functionPart, ...toGoogleParts(getImageResult(item))];
        })
    });
    return contents;
}

export function appendOllamaToolContext(baseMessages, context = {}) {
    const messages = [...baseMessages];
    const calls = context.calls || [];
    const results = context.results || [];
    if (!calls.length) return messages;

    messages.push({
        role: 'assistant',
        content: context.assistantMessage?.content || '',
        tool_calls: calls.map(getToolCall)
    });
    results.forEach((item) => {
        const message = { role: 'tool', content: serializeResult(item.result) };
        const imageUrl = getImageResult(item);
        if (imageUrl) message.images = [imageUrl.split(',')[1] || imageUrl];
        messages.push(message);
    });
    return messages;
}
