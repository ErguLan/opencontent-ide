#!/usr/bin/env node
/**
 * OpenContent IDE — MCP Tool Provider
 * 
 * Exposes OpenContent IDE capabilities as MCP tools so that
 * AI agents (Claude, Gemini, etc.) can use it as a content generation tool.
 * 
 * Protocol: Model Context Protocol (MCP) over stdio
 * 
 * Tools provided:
 *   - generate_content: Generate text content using AI
 *   - generate_image: Generate an image using AI
 *   - list_skills: List available AI personas/skills
 *   - list_models: List available AI models
 * 
 * Usage:
 *   OPENROUTER_API_KEY=sk-... node mcp/index.js
 */

import { createInterface } from 'readline';

// Config from env
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const SKILLS = [
    { id: 'content-creator', name: 'Content Creator', systemPrompt: 'You are a creative content assistant. Help the user create professional content for social media. Be direct and creative.' },
    { id: 'seo-writer', name: 'SEO Writer', systemPrompt: 'You are an SEO-optimized content writer. Create search-engine friendly content with relevant keywords.' },
    { id: 'brand-designer', name: 'Brand Designer', systemPrompt: 'You are a brand identity designer. Help create visual concepts, color palettes, and brand-consistent content.' },
    { id: 'social-strategist', name: 'Social Strategist', systemPrompt: 'You are a social media strategist. Analyze trends, suggest posting schedules, and create platform-specific content.' },
    { id: 'copywriter', name: 'Copywriter', systemPrompt: 'You are a professional copywriter. Write persuasive, concise copy for ads, landing pages, and email campaigns.' },
    { id: 'meme-creator', name: 'Meme Creator', systemPrompt: 'You create viral meme concepts and humorous social media content. Be funny and culturally aware.' }
];

// Tool definitions
const TOOLS = [
    {
        name: 'generate_content',
        description: 'Generate text content using AI. Supports multiple skills/personas like Content Creator, SEO Writer, Copywriter, etc.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The content generation prompt' },
                skill: { type: 'string', description: 'Skill/persona ID (content-creator, seo-writer, brand-designer, social-strategist, copywriter, meme-creator)', default: 'content-creator' },
                model: { type: 'string', description: 'Model ID (default: nvidia/nemotron-nano-12b-v2-vl:free)', default: 'nvidia/nemotron-nano-12b-v2-vl:free' },
                temperature: { type: 'number', description: 'Temperature (0.0-1.0)', default: 0.7 },
                max_tokens: { type: 'number', description: 'Max tokens', default: 1024 }
            },
            required: ['prompt']
        }
    },
    {
        name: 'generate_image',
        description: 'Generate an image using AI models via OpenRouter.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Image generation prompt' },
                model: { type: 'string', description: 'Image model ID', default: 'sourceful/riverflow-v2-fast' }
            },
            required: ['prompt']
        }
    },
    {
        name: 'list_skills',
        description: 'List available AI personas/skills for content generation.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'list_models',
        description: 'List available AI models including local Ollama models.',
        inputSchema: { type: 'object', properties: {} }
    }
];

// Provider functions
async function sendToOpenRouter(prompt, model, systemPrompt, temperature, maxTokens) {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'OpenContent IDE MCP'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
            temperature, max_tokens: maxTokens
        })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

async function sendToOllama(prompt, model, systemPrompt) {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], stream: false })
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message?.content || '';
}

async function getOllamaModels() {
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.models || []).map(m => ({ id: m.name || m.model, name: m.name || m.model, provider: 'ollama' }));
    } catch { return []; }
}

// Tool handlers
async function handleToolCall(name, args) {
    switch (name) {
        case 'generate_content': {
            const skill = SKILLS.find(s => s.id === (args.skill || 'content-creator')) || SKILLS[0];
            const model = args.model || 'nvidia/nemotron-nano-12b-v2-vl:free';
            const isOllama = !model.includes('/');
            const content = isOllama
                ? await sendToOllama(args.prompt, model, skill.systemPrompt)
                : await sendToOpenRouter(args.prompt, model, skill.systemPrompt, args.temperature || 0.7, args.max_tokens || 1024);
            return [{ type: 'text', text: content }];
        }
        case 'generate_image': {
            const model = args.model || 'sourceful/riverflow-v2-fast';
            if (!OPENROUTER_API_KEY) return [{ type: 'text', text: 'Error: OPENROUTER_API_KEY not set' }];
            const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'OpenContent IDE MCP' },
                body: JSON.stringify({ model, modalities: ['image'], messages: [{ role: 'user', content: args.prompt }] })
            });
            if (!res.ok) return [{ type: 'text', text: `Image generation failed: ${res.status}` }];
            const data = await res.json();
            return [{ type: 'text', text: `Image generated with model ${model}. Response: ${JSON.stringify(data.choices?.[0]?.message?.content || 'No content')}` }];
        }
        case 'list_skills':
            return [{ type: 'text', text: JSON.stringify(SKILLS.map(s => ({ id: s.id, name: s.name })), null, 2) }];
        case 'list_models': {
            const cloud = [
                { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nanometron', type: 'text', provider: 'openrouter' },
                { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash', type: 'text', provider: 'openrouter' },
                { id: 'sourceful/riverflow-v2-fast', name: 'Riverflow V2', type: 'image', provider: 'openrouter' }
            ];
            const ollama = await getOllamaModels();
            return [{ type: 'text', text: JSON.stringify([...cloud, ...ollama], null, 2) }];
        }
        default:
            return [{ type: 'text', text: `Unknown tool: ${name}` }];
    }
}

// MCP stdio protocol
const rl = createInterface({ input: process.stdin });
let requestId = 0;

function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', async (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    const { id, method, params } = msg;

    switch (method) {
        case 'initialize':
            send({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'opencontent-ide', version: '0.1.0' }
                }
            });
            break;

        case 'tools/list':
            send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
            break;

        case 'tools/call':
            try {
                const content = await handleToolCall(params.name, params.arguments || {});
                send({ jsonrpc: '2.0', id, result: { content } });
            } catch (err) {
                send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
            }
            break;

        case 'notifications/initialized':
            // Client acknowledged initialization
            break;

        default:
            send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
});

process.stderr.write('OpenContent IDE MCP server running on stdio\n');
