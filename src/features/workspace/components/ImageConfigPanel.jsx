import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';

const SECTIONS = [
  {
    key: 'basic',
    label: 'Image Settings',
    collapsed: false,
    fields: [
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1024 x 1024 (1:1)' },
          { value: '1792x1024', label: '1792 x 1024 (16:9)' },
          { value: '1024x1792', label: '1024 x 1792 (9:16)' },
          { value: '768x768', label: '768 x 768 (1:1)' },
          { value: '1344x768', label: '1344 x 768 (16:9)' },
          { value: '768x1344', label: '768 x 1344 (9:16)' },
        ],
        default: '1024x1024'
      },
      {
        key: 'quality',
        label: 'Quality',
        type: 'select',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'hd', label: 'HD' },
        ],
        default: 'standard'
      },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'vivid', label: 'Vivid' },
          { value: 'natural', label: 'Natural' },
        ],
        default: 'vivid'
      },
    ]
  },
  {
    key: 'creative',
    label: 'Creative Controls',
    collapsed: false,
    fields: [
      {
        key: 'negativePrompt',
        label: 'Negative Prompt',
        type: 'textarea',
        placeholder: 'Things to exclude...',
        default: ''
      },
      {
        key: 'referenceStrength',
        label: 'Ref Strength',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.8
      },
    ]
  },
  {
    key: 'advanced',
    label: 'Advanced',
    collapsed: true,
    fields: [
      {
        key: 'seed',
        label: 'Seed',
        type: 'number',
        placeholder: 'Random',
        default: ''
      },
      {
        key: 'steps',
        label: 'Steps',
        type: 'number',
        min: 1,
        max: 50,
        default: 20
      },
      {
        key: 'guidanceScale',
        label: 'Guidance',
        type: 'number',
        min: 1,
        max: 20,
        step: 0.5,
        default: 7.5
      },
    ]
  }
];

function buildDefaultConfig(sections) {
  const config = {};
  sections.forEach(section => {
    section.fields.forEach(field => {
      config[field.key] = field.default;
    });
  });
  return config;
}

export function getDefaultImageConfig() {
  return buildDefaultConfig(SECTIONS);
}

export { SECTIONS as IMAGE_CONFIG_SCHEMA };

const SECTION_LABEL_KEYS = {
  basic: 'workspace.imageConfig.basic',
  creative: 'workspace.imageConfig.creative',
  advanced: 'workspace.imageConfig.advanced'
};

const FIELD_LABEL_KEYS = {
  size: 'workspace.imageConfig.size',
  quality: 'workspace.imageConfig.quality',
  style: 'workspace.imageConfig.style',
  negativePrompt: 'workspace.imageConfig.negativePrompt',
  referenceStrength: 'workspace.imageConfig.referenceStrength',
  seed: 'workspace.imageConfig.seed',
  steps: 'workspace.imageConfig.steps',
  guidanceScale: 'workspace.imageConfig.guidance'
};

const OPTION_LABEL_KEYS = {
  '1024x1024': 'workspace.imageConfig.sizes.square1024',
  '1792x1024': 'workspace.imageConfig.sizes.wide1792',
  '1024x1792': 'workspace.imageConfig.sizes.portrait1792',
  '768x768': 'workspace.imageConfig.sizes.square768',
  '1344x768': 'workspace.imageConfig.sizes.wide1344',
  '768x1344': 'workspace.imageConfig.sizes.portrait1344',
  standard: 'workspace.imageConfig.qualities.standard',
  hd: 'workspace.imageConfig.qualities.hd',
  vivid: 'workspace.imageConfig.styles.vivid',
  natural: 'workspace.imageConfig.styles.natural'
};

export default function ImageConfigPanel({ config, onChange, isVisible }) {
  const { t } = useLanguage();
  const [collapsedSections, setCollapsedSections] = useState(
    () => {
      const initial = {};
      SECTIONS.forEach(s => { initial[s.key] = s.collapsed; });
      return initial;
    }
  );

  const toggleSection = (key) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFieldChange = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  const handleReset = () => {
    onChange(getDefaultImageConfig());
  };

  if (!isVisible) return null;

  return (
    <div className="oc-imgcfg-panel">
      <div className="oc-imgcfg-header">
        <span className="oc-imgcfg-title">Image Config</span>
        <div className="oc-imgcfg-header-actions">
          <button
            type="button"
            className="oc-imgcfg-reset-btn"
            onClick={handleReset}
            title={t('workspace.imageConfig.reset')}
          >
            {t('workspace.imageConfig.reset')}
          </button>
          <button
            type="button"
            className="oc-imgcfg-badge"
            onClick={() => {}}
            title={t('workspace.imageConfig.active')}
          >
            {t('workspace.imageConfig.active')}
          </button>
        </div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.key} className="oc-imgcfg-section">
          <button
            type="button"
            className="oc-imgcfg-section-header"
            onClick={() => toggleSection(section.key)}
          >
            <span className={`oc-imgcfg-chevron ${collapsedSections[section.key] ? 'collapsed' : ''}`}>
              &#9654;
            </span>
            <span className="oc-imgcfg-section-label">{t(SECTION_LABEL_KEYS[section.key])}</span>
          </button>

          {!collapsedSections[section.key] && (
            <div className="oc-imgcfg-section-body">
              {section.fields.map(field => (
                <div key={field.key} className="oc-imgcfg-field">
                  <label className="oc-imgcfg-field-label">{t(FIELD_LABEL_KEYS[field.key])}</label>
                  {field.type === 'select' && (
                    <select
                      className="oc-imgcfg-select"
                      value={config[field.key] ?? field.default}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    >
                      {field.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{t(OPTION_LABEL_KEYS[opt.value] || opt.label)}</option>
                      ))}
                    </select>
                  )}
                  {field.type === 'textarea' && (
                    <textarea
                      className="oc-imgcfg-textarea"
                      value={config[field.key] ?? field.default}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.key === 'negativePrompt' ? t('workspace.imageConfig.negativePlaceholder') : (field.placeholder || '')}
                      rows={2}
                    />
                  )}
                  {field.type === 'number' && (
                    <input
                      className="oc-imgcfg-input"
                      type="number"
                      value={config[field.key] ?? field.default}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.key === 'seed' ? t('workspace.imageConfig.seedPlaceholder') : (field.placeholder || '')}
                      min={field.min}
                      max={field.max}
                      step={field.step || 1}
                    />
                  )}
                  {field.type === 'range' && (
                    <div className="oc-imgcfg-range-row">
                      <input
                        className="oc-imgcfg-range"
                        type="range"
                        value={config[field.key] ?? field.default}
                        onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value))}
                        min={field.min}
                        max={field.max}
                        step={field.step || 0.1}
                      />
                      <span className="oc-imgcfg-range-value">
                        {config[field.key] ?? field.default}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
