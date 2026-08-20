/**
 * Provider-neutral tool contracts.
 * Providers adapt this OpenAI-shaped definition to their native format.
 */

export const IMAGE_AGENT_TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'list_gallery_assets',
            description: 'List image assets currently stored in the application gallery. Use this before selecting an existing image by ID.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    query: { type: 'string', description: 'Optional search text for name, kind, model, prompt or tags.' },
                    kind: { type: 'string', enum: ['all', 'generated', 'edited', 'source'] },
                    limit: { type: 'number', minimum: 1, maximum: 100 }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_gallery_asset',
            description: 'Read one image asset from the application gallery by ID. The original gallery asset remains unchanged.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { assetId: { type: 'string' } },
                required: ['assetId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'clone_gallery_asset',
            description: 'Copy an existing gallery image to an approved destination while preserving the original in the gallery. This never moves or deletes the source.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string' },
                    filename: { type: 'string', description: 'Optional safe filename for the copy.' },
                    destination: { type: 'string', enum: ['configured', 'download', 'project'] },
                    approved: { type: 'boolean', description: 'Set true only when the user explicitly approved writing the copy.' }
                },
                required: ['assetId', 'destination']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_image',
            description: 'Generate an image artifact from a detailed visual brief. Use when the user requests a visual result or a variation.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    prompt: { type: 'string', description: 'Detailed visual brief including subject, composition, lighting, style and intended use.' },
                    model: { type: 'string', description: 'Optional image model ID. Use the application-selected model when omitted.' },
                    sourceAssetIds: { type: 'array', items: { type: 'string' }, description: 'Optional local asset IDs to use as references.' },
                    size: { type: 'string', description: 'Requested image size or aspect ratio.' },
                    quality: { type: 'string', enum: ['auto', 'standard', 'low', 'medium', 'high', 'hd'] },
                    style: { type: 'string', enum: ['vivid', 'natural'] },
                    negativePrompt: { type: 'string' }
                },
                required: ['prompt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_image',
            description: 'Edit an existing image artifact while preserving its identity and applying the requested changes.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string', description: 'Existing local image artifact ID.' },
                    prompt: { type: 'string', description: 'Specific edit instructions.' }
                },
                required: ['assetId', 'prompt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyze_image',
            description: 'Inspect an image artifact and return useful visual observations for the next operation.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string', description: 'Local image artifact ID.' },
                    imageUrl: { type: 'string', description: 'Image data URL or URL when the image is not yet stored as an artifact.' },
                    prompt: { type: 'string', description: 'What to inspect in the image.' }
                },
                required: ['prompt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_image',
            description: 'Save an image artifact to the user-approved destination. This operation respects Settings permissions.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string' },
                    filename: { type: 'string', description: 'Optional filename without unsafe path segments.' },
                    destination: { type: 'string', enum: ['configured', 'download', 'project'] }
                },
                required: ['assetId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_artifact',
            description: 'Rename an image artifact inside the current project.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string' },
                    name: { type: 'string' }
                },
                required: ['assetId', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_image',
            description: 'Rename an image artifact inside the current project.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string' },
                    name: { type: 'string' }
                },
                required: ['assetId', 'name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_image_config',
            description: 'Change the active image configuration before the next generation.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    size: { type: 'string' },
                    quality: { type: 'string' },
                    style: { type: 'string' },
                    negativePrompt: { type: 'string' },
                    seed: { type: 'string' },
                    steps: { type: 'number' },
                    guidanceScale: { type: 'number' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_image_configuration',
            description: 'Change the active image configuration before the next generation.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    size: { type: 'string' },
                    quality: { type: 'string' },
                    style: { type: 'string' },
                    negativePrompt: { type: 'string' },
                    seed: { type: 'string' },
                    steps: { type: 'number' },
                    guidanceScale: { type: 'number' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'compare_images',
            description: 'Compare two or more image artifacts and report meaningful differences in composition, lighting, and quality.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
                    prompt: { type: 'string' }
                },
                required: ['assetIds']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'use_image_as_reference',
            description: 'Select an existing image artifact as a reference for a later generation or edit.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { assetId: { type: 'string' } },
                required: ['assetId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_image_variation',
            description: 'Generate a variation from an existing image artifact while preserving its identity and selected changes.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    assetId: { type: 'string' },
                    prompt: { type: 'string' },
                    count: { type: 'number', minimum: 1, maximum: 4 }
                },
                required: ['assetId', 'prompt']
            }
        }
    }
];

export const OPENROUTER_IMAGE_SERVER_TOOL = {
    type: 'openrouter:image_generation'
};

export function getImageAgentTools({ includeOpenRouterServerTool = false } = {}) {
    return includeOpenRouterServerTool
        ? [...IMAGE_AGENT_TOOL_DEFINITIONS, OPENROUTER_IMAGE_SERVER_TOOL]
        : IMAGE_AGENT_TOOL_DEFINITIONS;
}

export function toolDefinitionsToPrompt(tools = IMAGE_AGENT_TOOL_DEFINITIONS, { fallback = false } = {}) {
    const names = tools
        .filter((tool) => tool.type === 'function')
        .map((tool) => `${tool.function.name}: ${tool.function.description}`)
        .join('\n');
    if (fallback) {
        return `You can request controlled application operations using JSON only when needed. Available operations:\n${names}\nReturn an object with an "actions" array when an operation is needed. Do not invent filesystem paths.`;
    }
    return `You can request controlled application operations through the tools supplied by the application. Available operations:\n${names}\nUse the native tool interface, not JSON in your response. Do not invent filesystem paths.`;
}

export function parseFallbackToolCommands(content) {
    if (!content || typeof content !== 'string') return [];
    const candidates = [content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')];
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) candidates.push(objectMatch[0]);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) return parsed.filter((item) => item?.name || item?.tool);
            if (Array.isArray(parsed?.actions)) return parsed.actions;
            if (parsed?.name || parsed?.tool) return [parsed];
        } catch {
            // Try the next candidate. Normal text is not a tool command.
        }
    }
    return [];
}

export function normalizeToolCalls(toolCalls = []) {
    return toolCalls.map((call) => {
        const rawArguments = call?.function?.arguments ?? call?.arguments ?? {};
        let argumentsValue = rawArguments;
        if (typeof rawArguments === 'string') {
            try {
                argumentsValue = JSON.parse(rawArguments);
            } catch {
                argumentsValue = {};
            }
        }
        return {
            id: call?.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: call?.function?.name || call?.name || call?.tool || '',
            arguments: argumentsValue || {}
        };
    }).filter((call) => call.name);
}
