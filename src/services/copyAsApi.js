/**
 * Copy as API — Generate curl/fetch snippets from a prompt
 * OpenContent IDE
 *
 * Generates ready-to-use API call snippets so users can
 * reproduce any generation via CLI, n8n, LangChain, etc.
 */

import { AI_CONFIG, getActiveSkill } from './ai';
import { resolveModel, PROVIDERS } from './models';

function getKeyForProvider(provider) {
    switch (provider) {
        case PROVIDERS.OPENAI: return AI_CONFIG.OPENAI_API_KEY;
        case PROVIDERS.GOOGLE: return AI_CONFIG.GEMINI_API_KEY;
        case PROVIDERS.ANTHROPIC: return AI_CONFIG.ANTHROPIC_API_KEY;
        case PROVIDERS.CUSTOM: return AI_CONFIG.CUSTOM_API_KEY;
        default: return AI_CONFIG.OPENROUTER_API_KEY;
    }
}

function maskKey() {
    return '$YOUR_API_KEY';
}

function getRegisteredModel(model) {
    if (!model) return null;
    const info = resolveModel(model);
    return info.provider ? info : null;
}

function missingModelMessage() {
    return '# Select a model registered in Settings before generating this snippet.';
}

export function generateCurlCommand({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || '';
    const modelInfo = getRegisteredModel(resolvedModel);
    if (!modelInfo) return missingModelMessage();

    if (modelInfo.provider === PROVIDERS.OLLAMA) {
        const ollamaUrl = AI_CONFIG.OLLAMA_BASE_URL;
        const body = JSON.stringify({
            model: resolvedModel,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false
        }, null, 2);
        return `curl -X POST ${ollamaUrl}/api/chat \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }

    if (modelInfo.provider === PROVIDERS.OPENAI) {
        const body = JSON.stringify({
            model: resolvedModel,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens
        }, null, 2);
        return `curl -X POST https://api.openai.com/v1/chat/completions \\\n  -H "Authorization: Bearer ${maskKey(AI_CONFIG.OPENAI_API_KEY)}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }

    if (modelInfo.provider === PROVIDERS.GOOGLE) {
        return `curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${maskKey(AI_CONFIG.GEMINI_API_KEY)}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\n${prompt}` }] }] }, null, 2).replace(/'/g, "'\\''")}'`;
    }

    if (modelInfo.provider === PROVIDERS.ANTHROPIC) {
        const body = JSON.stringify({
            model: resolvedModel,
            max_tokens,
            temperature,
            system: sysPrompt,
            messages: [{ role: 'user', content: prompt }]
        }, null, 2);
        return `curl -X POST https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: ${maskKey(AI_CONFIG.ANTHROPIC_API_KEY)}" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }

    if (modelInfo.provider === PROVIDERS.CUSTOM) {
        const endpoint = `${modelInfo.baseUrl || '<CUSTOM_BASE_URL>'}/chat/completions`;
        const body = JSON.stringify({
            model: resolvedModel,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens
        }, null, 2);
        return `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer ${maskKey(AI_CONFIG.CUSTOM_API_KEY)}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }

    if (modelInfo.provider !== PROVIDERS.OPENROUTER) return missingModelMessage();
    const body = JSON.stringify({
        model: resolvedModel,
        messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens
    }, null, 2);
    return `curl -X POST https://openrouter.ai/api/v1/chat/completions \\\n  -H "Authorization: Bearer ${maskKey(AI_CONFIG.OPENROUTER_API_KEY)}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Title: OpenContent IDE" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
}

export function generateFetchSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || '';
    const modelInfo = getRegisteredModel(resolvedModel);
    if (!modelInfo) return missingModelMessage();
    getKeyForProvider(modelInfo.provider);

    const endpoint = modelInfo.provider === PROVIDERS.OPENAI
        ? 'https://api.openai.com/v1/chat/completions'
        : modelInfo.provider === PROVIDERS.CUSTOM
            ? `${modelInfo.baseUrl || '<CUSTOM_BASE_URL>'}/chat/completions`
            : modelInfo.provider === PROVIDERS.OPENROUTER
                ? 'https://openrouter.ai/api/v1/chat/completions'
                : 'http://localhost:4000/v1/chat/completions';
    const keyName = modelInfo.provider === PROVIDERS.OPENAI
        ? 'OPENAI_API_KEY'
        : modelInfo.provider === PROVIDERS.CUSTOM
            ? 'CUSTOM_API_KEY'
            : 'OPENROUTER_API_KEY';

    return `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.${keyName},
    "Content-Type": "application/json",
    ${modelInfo.provider === PROVIDERS.OPENROUTER ? '"X-Title": "OpenContent IDE"' : ''}
  },
  body: JSON.stringify({
    model: "${resolvedModel}",
    messages: [
      { role: "system", content: ${JSON.stringify(sysPrompt)} },
      { role: "user", content: ${JSON.stringify(prompt)} }
    ],
    temperature: ${temperature},
    max_tokens: ${max_tokens}
  })
});

const data = await response.json();
console.log(data.choices?.[0]?.message?.content);`;
}

export function generatePythonSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || '';
    const modelInfo = getRegisteredModel(resolvedModel);
    if (!modelInfo) return missingModelMessage();

    const endpoint = modelInfo.provider === PROVIDERS.OPENAI
        ? 'https://api.openai.com/v1/chat/completions'
        : modelInfo.provider === PROVIDERS.CUSTOM
            ? `${modelInfo.baseUrl || '<CUSTOM_BASE_URL>'}/chat/completions`
            : modelInfo.provider === PROVIDERS.OPENROUTER
                ? 'https://openrouter.ai/api/v1/chat/completions'
                : 'http://localhost:4000/v1/chat/completions';
    const keyName = modelInfo.provider === PROVIDERS.OPENAI
        ? 'OPENAI_API_KEY'
        : modelInfo.provider === PROVIDERS.CUSTOM
            ? 'CUSTOM_API_KEY'
            : 'OPENROUTER_API_KEY';

    return `import requests, os

response = requests.post(
    "${endpoint}",
    headers={
        "Authorization": f"Bearer {os.environ['${keyName}']}",
        "Content-Type": "application/json",
        ${modelInfo.provider === PROVIDERS.OPENROUTER ? '"X-Title": "OpenContent IDE"' : ''}
    },
    json={
        "model": "${resolvedModel}",
        "messages": [
            {"role": "system", "content": ${JSON.stringify(sysPrompt)}},
            {"role": "user", "content": ${JSON.stringify(prompt)}}
        ],
        "temperature": ${temperature},
        "max_tokens": ${max_tokens}
    }
)

print(response.json()["choices"][0]["message"]["content"])`;
}

export function generateLocalServerSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    return `curl -X POST http://localhost:4000/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{
    "model": "${model || ''}",
    "messages": [
      {"role": "system", "content": ${JSON.stringify(sysPrompt)}},
      {"role": "user", "content": ${JSON.stringify(prompt)}}
    ],
    "temperature": ${temperature},
    "max_tokens": ${max_tokens}
  }'`;
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
    }
}

export default {
    generateCurlCommand,
    generateFetchSnippet,
    generatePythonSnippet,
    generateLocalServerSnippet,
    copyToClipboard
};
