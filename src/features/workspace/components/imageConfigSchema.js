/**
 * Image generation configuration schema.
 *
 * Declares every image-config field once: the default value and the i18n key of
 * its label and options. `ImageConfigPanel` renders from this schema and
 * `useWorkspacePreferences` builds the default config from it, so the panel file
 * only exports a component.
 */

export const IMAGE_CONFIG_SCHEMA = [
    {
        key: 'basic',
        collapsed: false,
        fields: [
            {
                key: 'size',
                type: 'select',
                labelKey: 'workspace.imageConfig.size',
                default: '1024x1024',
                options: [
                    { value: '1024x1024', labelKey: 'workspace.imageConfig.sizes.square1024' },
                    { value: '1792x1024', labelKey: 'workspace.imageConfig.sizes.wide1792' },
                    { value: '1024x1792', labelKey: 'workspace.imageConfig.sizes.portrait1792' },
                    { value: '768x768', labelKey: 'workspace.imageConfig.sizes.square768' },
                    { value: '1344x768', labelKey: 'workspace.imageConfig.sizes.wide1344' },
                    { value: '768x1344', labelKey: 'workspace.imageConfig.sizes.portrait1344' }
                ]
            },
            {
                key: 'quality',
                type: 'select',
                labelKey: 'workspace.imageConfig.quality',
                default: 'standard',
                options: [
                    { value: 'standard', labelKey: 'workspace.imageConfig.qualities.standard' },
                    { value: 'hd', labelKey: 'workspace.imageConfig.qualities.hd' }
                ]
            },
            {
                key: 'style',
                type: 'select',
                labelKey: 'workspace.imageConfig.style',
                default: 'vivid',
                options: [
                    { value: 'vivid', labelKey: 'workspace.imageConfig.styles.vivid' },
                    { value: 'natural', labelKey: 'workspace.imageConfig.styles.natural' }
                ]
            }
        ]
    },
    {
        key: 'creative',
        collapsed: false,
        fields: [
            {
                key: 'negativePrompt',
                type: 'textarea',
                labelKey: 'workspace.imageConfig.negativePrompt',
                placeholderKey: 'workspace.imageConfig.negativePlaceholder',
                default: ''
            },
            {
                key: 'referenceStrength',
                type: 'range',
                labelKey: 'workspace.imageConfig.referenceStrength',
                min: 0,
                max: 1,
                step: 0.1,
                default: 0.8
            }
        ]
    },
    {
        key: 'advanced',
        collapsed: true,
        fields: [
            {
                key: 'seed',
                type: 'number',
                labelKey: 'workspace.imageConfig.seed',
                placeholderKey: 'workspace.imageConfig.seedPlaceholder',
                default: ''
            },
            {
                key: 'steps',
                type: 'number',
                labelKey: 'workspace.imageConfig.steps',
                min: 1,
                max: 50,
                default: 20
            },
            {
                key: 'guidanceScale',
                type: 'number',
                labelKey: 'workspace.imageConfig.guidance',
                min: 1,
                max: 20,
                step: 0.5,
                default: 7.5
            }
        ]
    }
];

const SECTION_LABEL_KEYS = Object.freeze({
    basic: 'workspace.imageConfig.basic',
    creative: 'workspace.imageConfig.creative',
    advanced: 'workspace.imageConfig.advanced'
});

export const getSectionLabelKey = (sectionKey) => SECTION_LABEL_KEYS[sectionKey] || sectionKey;

export function getDefaultImageConfig() {
    const config = {};
    IMAGE_CONFIG_SCHEMA.forEach((section) => {
        section.fields.forEach((field) => {
            config[field.key] = field.default;
        });
    });
    return config;
}