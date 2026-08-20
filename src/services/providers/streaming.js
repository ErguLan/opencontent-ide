/**
 * Streaming helpers for OpenAI-compatible SSE responses.
 */

export async function* readOpenAIStream(response) {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') return;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta?.content) yield delta.content;
                    if (delta?.role) continue;
                } catch {
                    // ignore malformed JSON
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

export function createStreamAccumulator() {
    let content = '';
    return {
        append(chunk) {
            content += chunk;
            return content;
        },
        getContent() {
            return content;
        }
    };
}
