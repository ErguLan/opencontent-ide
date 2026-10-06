/**
 * ImageConfigPanel — image generation settings for the workspace.
 *
 * Every label, option and placeholder comes from i18n and is declared in
 * `imageConfigSchema.js`.
 */

import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Icon, { ICONS } from '../../../components/icons/Icon';
import {
    getDefaultImageConfig,
    getSectionLabelKey,
    IMAGE_CONFIG_SCHEMA
} from './imageConfigSchema';
import './ImageConfigPanel.css';

const COLLAPSE_ROTATION = 'rotate(90deg)';

function ImageConfigPanel({ config, onChange, isVisible }) {
    const { t } = useLanguage();
    const [collapsedSections, setCollapsedSections] = useState(() => {
        const initial = {};
        IMAGE_CONFIG_SCHEMA.forEach((section) => { initial[section.key] = section.collapsed; });
        return initial;
    });

    const toggleSection = (key) => {
        setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
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
                <span className="oc-imgcfg-title">{t('workspace.imageConfig.title')}</span>
                <div className="oc-imgcfg-header-actions">
                    <button
                        type="button"
                        className="oc-imgcfg-reset-btn"
                        onClick={handleReset}
                        title={t('workspace.imageConfig.reset')}
                    >
                        {t('workspace.imageConfig.reset')}
                    </button>
                    <span className="oc-imgcfg-badge">
                        {t('workspace.imageConfig.active')}
                    </span>
                </div>
            </div>

            {IMAGE_CONFIG_SCHEMA.map((section) => (
                <div key={section.key} className="oc-imgcfg-section">
                    <button
                        type="button"
                        className="oc-imgcfg-section-header"
                        onClick={() => toggleSection(section.key)}
                        aria-expanded={!collapsedSections[section.key]}
                    >
                        <span
                            className="oc-imgcfg-chevron"
                            style={{ transform: collapsedSections[section.key] ? 'rotate(0deg)' : COLLAPSE_ROTATION }}
                            aria-hidden="true"
                        >
                            <Icon src={ICONS.ITERATE} size="xs" alt="" />
                        </span>
                        <span className="oc-imgcfg-section-label">{t(getSectionLabelKey(section.key))}</span>
                    </button>

                    {!collapsedSections[section.key] && (
                        <div className="oc-imgcfg-section-body">
                            {section.fields.map((field) => (
                                <div key={field.key} className="oc-imgcfg-field">
                                    <label className="oc-imgcfg-field-label" htmlFor={`oc-imgcfg-${field.key}`}>
                                        {t(field.labelKey)}
                                    </label>
                                    {field.type === 'select' && (
                                        <select
                                            id={`oc-imgcfg-${field.key}`}
                                            className="oc-imgcfg-select"
                                            value={config[field.key] ?? field.default}
                                            onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                        >
                                            {field.options.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {t(option.labelKey)}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {field.type === 'textarea' && (
                                        <textarea
                                            id={`oc-imgcfg-${field.key}`}
                                            className="oc-imgcfg-textarea"
                                            value={config[field.key] ?? field.default}
                                            onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                            placeholder={t(field.placeholderKey)}
                                            rows={2}
                                        />
                                    )}
                                    {field.type === 'number' && (
                                        <input
                                            id={`oc-imgcfg-${field.key}`}
                                            className="oc-imgcfg-input"
                                            type="number"
                                            value={config[field.key] ?? field.default}
                                            onChange={(event) => handleFieldChange(field.key, event.target.value)}
                                            placeholder={t(field.placeholderKey)}
                                            min={field.min}
                                            max={field.max}
                                            step={field.step || 1}
                                        />
                                    )}
                                    {field.type === 'range' && (
                                        <div className="oc-imgcfg-range-row">
                                            <input
                                                id={`oc-imgcfg-${field.key}`}
                                                className="oc-imgcfg-range"
                                                type="range"
                                                value={config[field.key] ?? field.default}
                                                onChange={(event) => handleFieldChange(field.key, parseFloat(event.target.value))}
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

export default ImageConfigPanel;