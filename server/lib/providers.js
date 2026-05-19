/**
 * AI Providers Library (Server-side)
 * Handles communication with OpenRouter, Gemini, and Ollama
 */

import skills from './skills.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function getSkill(skillId) {
    return skills.find(s => s.id === skillId) || skills[0];
}

function detectProvider(model) {
    if (!model) return 'openrouter';
    if (!model.includes('/')) return 'ollama';
    return 'openrouter';
}

export async function sendToProvider({ prompt, model, skill, systemPrompt, temperature, max_tokens }) {
    const provider = detectProvider(model);

    if (provider === 'ollama') {
        return sendToOllama({ prompt, model, systemPrompt, skill });
    }
    return sendToOpenRouter({ prompt, model, systemPrompt, skill, temperature, max_tokens });
}

async function sendToOpenRouter({ prompt, model, systemPrompt, skill, temperature, max_tokens }) {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

    const skillData = skill ? getSkill(skill) : skills[0];
    const sysPrompt = systemPrompt || skillData.systemPrompt;

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'OpenContent IDE API'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            temperature: temperature || 0.7,
            max_tokens: max_tokens || 1024
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    return {
        success: true,
        content: data.choices?.[0]?.message?.content || '',
        model,
        provider: 'openrouter',
        usage: data.usage
    };
}

async function sendToOllama({ prompt, model, systemPrompt, skill }) {
    const skillData = skill ? getSkill(skill) : skills[0];
    const sysPrompt = systemPrompt || skillData.systemPrompt;

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt }
            ],
            stream: false
        })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    const data = await response.json();
    return {
        success: true,
        content: data.message?.content || '',
        model,
        provider: 'ollama'
    };
}

export async function generateImageProvider({ prompt, model }) {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'OpenContent IDE API'
        },
        body: JSON.stringify({
            model,
            modalities: ['image'],
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Image generation error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data, model, provider: 'openrouter' };
}
