import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendToAI = vi.fn();
const generateImage = vi.fn();
const analyzeImage = vi.fn();
const executeAgentTool = vi.fn();
const saveImageArtifact = vi.fn();

vi.mock('./index.js', () => ({
    sendToAI: (...args) => sendToAI(...args),
    generateImage: (...args) => generateImage(...args),
    analyzeImage: (...args) => analyzeImage(...args)
}));

vi.mock('./toolRuntime.js', () => ({
    executeAgentTool: (...args) => executeAgentTool(...args)
}));

vi.mock('../imageArtifacts.js', () => ({
    saveImageArtifact: (...args) => saveImageArtifact(...args)
}));

vi.mock('../filePersistence.js', () => ({
    getLocalSaveSettings: () => ({ maxImagesPerTask: 4, filenameTemplate: '{name}.png' })
}));

vi.mock('../brandKit.js', () => ({
    buildBrandContextText: () => '',
    getBrandKitAssetIds: () => []
}));

vi.mock('../mediaService.js', () => ({
    getMedia: () => Promise.resolve(null)
}));

const {
    AGENTIC_ABORT_CODE,
    AGENTIC_IMAGE_LIMIT_STATUS,
    AGENTIC_STEP_STATUS,
    AGENTIC_STEP_STATUSES,
    executeAgenticPipeline
} = await import('./agenticPipeline.js');

const TRANSLATIONS = {
    en: {
        'agentic.toolPlanning': 'Selecting and coordinating tools...',
        'agentic.toolComplete': 'Tool operation completed',
        'agentic.plannerPrompt': 'planner prompt',
        'agentic.executorPrompt': 'executor prompt',
        'agentic.visualStepComplete': 'The visual was generated successfully.',
        'agentic.noImageForAnalysis': 'No image was available for this analysis step.',
        'agentic.noOutputNotice': 'The assistant produced no usable result for this task.',
        'agentic.partialFailureNotice': 'Some steps could not be completed ({count} failed).',
        'agentic.failureWithDetail': '{message} Details: {detail}',
        'agentic.imageStepLimitReached': 'Skipped: image limit reached.',
        'agentic.imageStepModelMissing': 'Skipped: no image model selected.',
        'agentic.failures.plannerFailed': 'The task could not be planned.',
        'agentic.failures.textStepFailed': 'The writing step failed.',
        'agentic.failures.toolFailed': 'A tool operation failed.',
        'agentic.failures.imageGenerationFailed': 'The image could not be generated.',
        'agentic.failures.imageModelNotSelected': 'No image model is selected.',
        'agentic.failures.unknownTool': 'The AI requested a tool that does not exist.',
        'agentic.failures.unexpected': 'An unexpected error occurred ({code}).',
        'agentic.failures.imageStepFailed': 'The image step failed.',
        'agentic.failures.analysisStepFailed': 'The analysis step failed.',
        'workspace.visualGeneratedNoText': 'Visual generated successfully.'
    }
};

const t = (key, vars = {}) => {
    const template = TRANSLATIONS.en[key];
    if (!template) return key;
    return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
};

const createStepTracker = () => {
    const steps = [];
    const onSteps = (next) => {
        const resolved = typeof next === 'function' ? next(steps) : next;
        steps.length = 0;
        steps.push(...resolved);
    };
    return { steps, onSteps };
};

const toolCall = (name, args = {}, id = 'call_1') => ({
    id,
    function: { name, arguments: JSON.stringify(args) }
});

const baseOptions = (overrides = {}) => ({
    prompt: 'Write a post about coffee and generate an image',
    selectedTextModel: 'text-model',
    selectedImageModel: 'image-model',
    visionModel: 'vision-model',
    t,
    brandContext: '',
    brandAssetIds: [],
    ...overrides
});

const registerTextModel = async ({ toolCalling = true } = {}) => {
    const models = await import('../models/index.js');
    models.addModel({
        id: 'text-model',
        provider: models.PROVIDERS.OPENAI,
        capabilities: { text: true, toolCalling }
    });
};

describe('agentic step status vocabulary', () => {
    it('exports exactly the five agreed statuses', () => {
        expect([...AGENTIC_STEP_STATUSES].sort()).toEqual([
            'completed',
            'failed',
            'skipped',
            'waiting',
            'working'
        ]);
        expect(AGENTIC_STEP_STATUS).toEqual({
            WAITING: 'waiting',
            WORKING: 'working',
            COMPLETED: 'completed',
            FAILED: 'failed',
            SKIPPED: 'skipped'
        });
    });

    it('freezes the vocabulary so consumers cannot mutate it', () => {
        expect(Object.isFrozen(AGENTIC_STEP_STATUS)).toBe(true);
        expect(Object.isFrozen(AGENTIC_STEP_STATUSES)).toBe(true);
    });
});

describe('agentic native tool loop', () => {
    beforeEach(async () => {
        sendToAI.mockReset();
        generateImage.mockReset();
        analyzeImage.mockReset();
        executeAgentTool.mockReset();
        saveImageArtifact.mockReset();
        localStorage.clear();
        await registerTextModel();
    });

    it('keeps running and reports one failure when a tool throws', async () => {
        sendToAI
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('generate_image', { prompt: 'a coffee cup' })], assistantMessage: 'a1' })
            .mockResolvedValueOnce({ success: true, content: 'Here is the post about coffee.', assistantMessage: 'a2' });
        executeAgentTool.mockRejectedValueOnce(new Error('IMAGE_GENERATION_FAILED'));
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps }));

        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]).toMatchObject({
            name: 'generate_image',
            code: 'IMAGE_GENERATION_FAILED',
            message: 'The image could not be generated.'
        });
        expect(result.failures[0].stepId).toBeTruthy();
        expect(result.partial).toBe(true);
        expect(result.retryable).toBe(true);
        expect(result.text).toContain('Here is the post about coffee.');
        expect(result.text).toContain('Some steps could not be completed (1 failed).');
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.FAILED)).toBe(true);
        expect(steps.every((step) => step.status !== AGENTIC_STEP_STATUS.WORKING)).toBe(true);
    });

    it('reports no failures when every tool succeeds', async () => {
        saveImageArtifact.mockResolvedValue({
            asset: { id: 'asset-1', data: 'data:image/png;base64,AAAA' }
        });
        sendToAI
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('generate_image', { prompt: 'a coffee cup' })], assistantMessage: 'a1' })
            .mockResolvedValueOnce({ success: true, content: 'Post ready.', assistantMessage: 'a2' });
        executeAgentTool.mockResolvedValueOnce({ status: 'ok', assetId: 'asset-1', imageUrl: 'data:image/png;base64,AAAA' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps }));

        expect(result.failures).toEqual([]);
        expect(result.partial).toBe(false);
        expect(result.retryable).toBe(false);
        expect(result.images).toHaveLength(1);
        expect(result.text).toBe('Post ready.');
        expect(steps.every((step) => step.status !== AGENTIC_STEP_STATUS.FAILED)).toBe(true);
    });

    it('does not record an image limit as a failure', async () => {
        saveImageArtifact.mockResolvedValue({
            asset: { id: 'asset-1', data: 'data:image/png;base64,AAAA' }
        });
        sendToAI
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('generate_image', { prompt: 'first' }, 'call_1')], assistantMessage: 'a1' })
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('generate_image', { prompt: 'second' }, 'call_2')], assistantMessage: 'a2' })
            .mockResolvedValueOnce({ success: true, content: 'Post ready.', assistantMessage: 'a3' });
        executeAgentTool
            .mockResolvedValueOnce({ status: 'ok', assetId: 'asset-1', imageUrl: 'data:image/png;base64,AAAA' })
            .mockRejectedValueOnce(new Error('IMAGE_TASK_LIMIT_REACHED'));
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, imageLimit: 1 }));

        expect(result.failures).toEqual([]);
        expect(result.partial).toBe(false);
        expect(result.retryable).toBe(false);
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.SKIPPED)).toBe(true);
    });

    it('skips an image tool before calling the runtime when the limit is already reached', async () => {
        sendToAI
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('generate_image', { prompt: 'first' })], assistantMessage: 'a1' })
            .mockResolvedValueOnce({ success: true, content: 'Nothing visual was produced.', assistantMessage: 'a2' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, imageCount: 4, imageLimit: 4 }));

        expect(executeAgentTool).not.toHaveBeenCalled();
        expect(result.failures).toEqual([]);
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.SKIPPED)).toBe(true);
    });

    it('propagates REQUEST_ABORTED instead of swallowing it', async () => {
        sendToAI.mockResolvedValueOnce({
            success: true,
            toolCalls: [toolCall('generate_image', { prompt: 'a coffee cup' })],
            assistantMessage: 'a1'
        });
        executeAgentTool.mockRejectedValueOnce(new Error(AGENTIC_ABORT_CODE));

        await expect(executeAgenticPipeline(baseOptions({ onSteps: createStepTracker().onSteps })))
            .rejects.toThrow(AGENTIC_ABORT_CODE);
    });

    it('keeps a translated detail when the tool reports an unknown one', async () => {
        sendToAI
            .mockResolvedValueOnce({ success: true, toolCalls: [toolCall('save_image', { assetId: 'missing' }, 'call_9')], assistantMessage: 'a1' })
            .mockResolvedValueOnce({ success: true, content: 'Saved what was available.', assistantMessage: 'a2' });
        executeAgentTool.mockRejectedValueOnce(new Error('UNKNOWN_AGENT_TOOL:save_image'));
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps }));

        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].code).toBe('UNKNOWN_AGENT_TOOL');
        expect(result.failures[0].message).toContain('The AI requested a tool that does not exist.');
        expect(result.failures[0].message).toContain('save_image');
        expect(result.retryable).toBe(false);
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.FAILED)).toBe(true);
    });

    it('survives a planner failure by reporting the step and rethrowing', async () => {
        localStorage.clear();
        await registerTextModel({ toolCalling: false });
        sendToAI.mockResolvedValueOnce({ success: false, error: 'AGENTIC_PLANNER_FAILED' });
        const { steps, onSteps } = createStepTracker();

        await expect(executeAgenticPipeline(baseOptions({ onSteps })))
            .rejects.toThrow('AGENTIC_PLANNER_FAILED');
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.FAILED)).toBe(true);
    });
});

describe('agentic plan execution', () => {
    beforeEach(async () => {
        sendToAI.mockReset();
        generateImage.mockReset();
        analyzeImage.mockReset();
        executeAgentTool.mockReset();
        saveImageArtifact.mockReset();
        localStorage.clear();
        await registerTextModel({ toolCalling: false });
    });

    it('marks an image step as skipped when no image model is selected', async () => {
        sendToAI
            .mockResolvedValueOnce({
                success: true,
                content: JSON.stringify([
                    { type: 'text', description: 'Write the post', prompt: 'Write a post about coffee' },
                    { type: 'image', description: 'Coffee cup', prompt: 'A coffee cup' }
                ])
            })
            .mockResolvedValue({ success: true, content: 'Post ready.' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, selectedImageModel: '' }));

        expect(result.failures).toEqual([]);
        expect(generateImage).not.toHaveBeenCalled();
        expect(steps.find((step) => step.id === 'agentic-1')).toMatchObject({
            status: AGENTIC_STEP_STATUS.SKIPPED,
            text: 'Skipped: no image model selected.'
        });
    });

    it('marks an image step as skipped when the image limit is already reached', async () => {
        sendToAI
            .mockResolvedValueOnce({
                success: true,
                content: JSON.stringify([
                    { type: 'text', description: 'Write the post', prompt: 'Write a post about coffee' },
                    { type: 'image', description: 'Coffee cup', prompt: 'A coffee cup' }
                ])
            })
            .mockResolvedValue({ success: true, content: 'Post ready.' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, imageCount: 2, imageLimit: 2 }));

        expect(result.failures).toEqual([]);
        expect(generateImage).not.toHaveBeenCalled();
        expect(steps.find((step) => step.id === 'agentic-1')).toMatchObject({
            status: AGENTIC_STEP_STATUS.SKIPPED,
            text: 'Skipped: image limit reached.'
        });
    });

    it('fails only the failing step and keeps the rest of the plan', async () => {
        saveImageArtifact.mockResolvedValue({
            asset: { id: 'asset-2', data: 'data:image/png;base64,BBBB' }
        });
        sendToAI
            .mockResolvedValueOnce({
                success: true,
                content: JSON.stringify([
                    { type: 'text', description: 'Write the post', prompt: 'Write a post about coffee' },
                    { type: 'image', description: 'Coffee cup', prompt: 'A coffee cup' },
                    { type: 'text', description: 'Write the caption', prompt: 'Write a caption' }
                ])
            })
            .mockResolvedValueOnce({ success: true, content: 'Post body.' })
            .mockResolvedValueOnce({ success: true, content: 'Caption body.' });
        generateImage.mockResolvedValueOnce({ success: false, error: 'IMAGE_GENERATION_FAILED' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps }));

        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]).toMatchObject({
            stepId: 'agentic-1',
            name: 'image',
            code: 'IMAGE_GENERATION_FAILED'
        });
        expect(result.partial).toBe(true);
        expect(result.retryable).toBe(true);
        expect(result.text).toContain('Post body.');
        expect(result.text).toContain('Caption body.');
        expect(result.text).toContain('Some steps could not be completed (1 failed).');
        expect(steps.map((step) => step.status)).toEqual(['completed', 'failed', 'completed']);
    });

    it('propagates REQUEST_ABORTED from the plan loop', async () => {
        sendToAI.mockResolvedValueOnce({
            success: true,
            content: JSON.stringify([{ type: 'text', description: 'Write the post', prompt: 'Write a post' }])
        });
        sendToAI.mockResolvedValueOnce({ success: false, error: AGENTIC_ABORT_CODE });

        await expect(executeAgenticPipeline(baseOptions({ onSteps: createStepTracker().onSteps })))
            .rejects.toThrow(AGENTIC_ABORT_CODE);
    });

    it('explains an empty run instead of returning an empty text', async () => {
        sendToAI.mockResolvedValueOnce({
            success: true,
            content: JSON.stringify([{ type: 'text', description: 'Write the post', prompt: 'Write a post' }])
        });
        sendToAI.mockResolvedValueOnce({ success: true, content: 'I cannot generate images for you.' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, prompt: 'Write a coffee post' }));

        expect(result.text.length).toBeGreaterThan(0);
        expect(steps.map((step) => step.status)).toEqual(['completed']);
    });

    it('returns a translated image-limit status from tool results without failing the run', async () => {
        sendToAI.mockResolvedValueOnce({
            success: true,
            content: JSON.stringify({ actions: [{ name: 'generate_image', arguments: { prompt: 'A coffee cup' } }] })
        });
        sendToAI.mockResolvedValueOnce({ success: true, content: 'Nothing visual was produced.' });
        const { steps, onSteps } = createStepTracker();

        const result = await executeAgenticPipeline(baseOptions({ onSteps, imageCount: 4, imageLimit: 4 }));

        expect(result.failures).toEqual([]);
        expect(steps.some((step) => step.status === AGENTIC_STEP_STATUS.SKIPPED)).toBe(true);
        expect(steps.every((step) => step.status !== AGENTIC_STEP_STATUS.WORKING)).toBe(true);
        expect(AGENTIC_IMAGE_LIMIT_STATUS).toBe('image-limit-reached');
    });
});