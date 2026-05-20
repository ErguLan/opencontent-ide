/**
 * Copy as API — Generate curl/fetch snippets from a prompt
 * OpenContent IDE
 * 
 * Generates ready-to-use API call snippets so users can
 * reproduce any generation via CLI, n8n, LangChain, etc.
 */

import { AI_CONFIG, getActiveSkill } from './ai';

/**
 * Generate a curl command for the current prompt
 * @param {Object} params - { prompt, model, systemPrompt, temperature, max_tokens }
 * @returns {string} curl command string
 */
export function generateCurlCommand({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || AI_CONFIG.DEFAULT_TEXT_MODEL;

    // Detect if it should target the local server or OpenRouter directly
    const isLocalModel = !resolvedModel.includes('/');

    if (isLocalModel) {
        // Ollama curl
        const ollamaUrl = localStorage.getItem('oc_ollama_url') || AI_CONFIG.OLLAMA_BASE_URL || 'http://localhost:11434';
        const body = JSON.stringify({
            model: resolvedModel,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false
        }, null, 2);

        return `curl -X POST ${ollamaUrl}/api/chat \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
    }

    // OpenRouter curl
    const body = JSON.stringify({
        model: resolvedModel,
        messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens
    }, null, 2);

    return `curl -X POST https://openrouter.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Title: OpenContent IDE" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
}

/**
 * Generate a fetch (JS) snippet for the current prompt
 */
export function generateFetchSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || AI_CONFIG.DEFAULT_TEXT_MODEL;

    return `const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY,
    "Content-Type": "application/json",
    "X-Title": "OpenContent IDE"
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
console.log(data.choices[0].message.content);`;
}

/**
 * Generate a Python requests snippet
 */
export function generatePythonSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;
    const resolvedModel = model || AI_CONFIG.DEFAULT_TEXT_MODEL;

    return `import requests, os

response = requests.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        "Content-Type": "application/json",
        "X-Title": "OpenContent IDE"
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

/**
 * Generate OpenAI-compatible snippet (for local server mode)
 */
export function generateLocalServerSnippet({ prompt, model, systemPrompt, temperature = 0.7, max_tokens = 1024 }) {
    const skill = getActiveSkill();
    const sysPrompt = systemPrompt || skill.systemPrompt;

    return `curl -X POST http://localhost:4000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model || AI_CONFIG.DEFAULT_TEXT_MODEL}",
    "messages": [
      {"role": "system", "content": ${JSON.stringify(sysPrompt)}},
      {"role": "user", "content": ${JSON.stringify(prompt)}}
    ],
    "temperature": ${temperature},
    "max_tokens": ${max_tokens}
  }'`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback
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
