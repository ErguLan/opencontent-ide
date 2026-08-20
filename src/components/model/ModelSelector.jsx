/**
 * ModelSelector
 * OpenContent IDE
 *
 * Shared model selector used in Landing and Workspace.
 * Lets users pick text, vision and image models from the registry.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import { getTextModelOptions, getVisionModelOptions, getImageModelOptions } from '../../services/ai';
import { ROUTES } from '../../config/constants';
import './ModelSelector.css';

function ModelSelector({
    textModel,
    visionModel,
    imageModel,
    onTextChange,
    onVisionChange,
    onImageChange,
    onSave,
    onCancel
}) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [selectedText, setSelectedText] = useState(textModel);
    const [selectedVision, setSelectedVision] = useState(visionModel);
    const [selectedImage, setSelectedImage] = useState(imageModel);
    const [textOptions, setTextOptions] = useState([]);
    const [visionOptions, setVisionOptions] = useState([]);
    const [imageOptions, setImageOptions] = useState([]);

    useEffect(() => {
        setTextOptions(getTextModelOptions());
        setVisionOptions(getVisionModelOptions());
        setImageOptions(getImageModelOptions());
    }, []);

    useEffect(() => {
        setSelectedText(textModel);
        setSelectedVision(visionModel);
        setSelectedImage(imageModel);
    }, [textModel, visionModel, imageModel]);

    const handleSave = () => {
        onTextChange?.(selectedText);
        onVisionChange?.(selectedVision);
        onImageChange?.(selectedImage);
        onSave?.(selectedText, selectedImage, selectedVision);
    };

    const handleManageModels = () => {
        onCancel?.();
        navigate(ROUTES.SETTINGS);
    };

    return (
        <div className="oc-model-selector">
            <div className="oc-model-selector-block">
                <label htmlFor="oc-text-model" className="oc-model-selector-label">
                    {t('workspace.model.textLabel')}
                </label>
                <select
                    id="oc-text-model"
                    className="oc-model-selector-select"
                    value={selectedText}
                    onChange={(e) => setSelectedText(e.target.value)}
                >
                    {textOptions.length === 0 && (
                        <option value="">{t('workspace.model.noModels')}</option>
                    )}
                    {textOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.nickname}
                        </option>
                    ))}
                </select>
                <div className="oc-model-selector-meta">
                    {selectedText && (
                        <span className="oc-model-selector-id">{selectedText}</span>
                    )}
                </div>
            </div>

            <div className="oc-model-selector-block">
                <label htmlFor="oc-vision-model" className="oc-model-selector-label">
                    {t('workspace.model.visionLabel')}
                </label>
                <select
                    id="oc-vision-model"
                    className="oc-model-selector-select"
                    value={selectedVision || ''}
                    onChange={(e) => setSelectedVision(e.target.value)}
                >
                    <option value="">{t('workspace.model.noModelSelected')}</option>
                    {visionOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.nickname}</option>
                    ))}
                </select>
                <div className="oc-model-selector-meta">
                    {selectedVision && <span className="oc-model-selector-id">{selectedVision}</span>}
                </div>
            </div>

            <div className="oc-model-selector-block">
                <label htmlFor="oc-image-model" className="oc-model-selector-label">
                    {t('workspace.model.imageLabel')}
                </label>
                <select
                    id="oc-image-model"
                    className="oc-model-selector-select"
                    value={selectedImage}
                    onChange={(e) => setSelectedImage(e.target.value)}
                >
                    {imageOptions.length === 0 && (
                        <option value="">{t('workspace.model.noModels')}</option>
                    )}
                    {imageOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.nickname}
                        </option>
                    ))}
                </select>
                <div className="oc-model-selector-meta">
                    {selectedImage && (
                        <span className="oc-model-selector-id">{selectedImage}</span>
                    )}
                </div>
            </div>

            <div className="oc-model-selector-actions">
                <Button variant="secondary" onClick={handleManageModels}>
                    {t('workspace.model.manageModels')}
                </Button>
                <div className="oc-model-selector-save-group">
                    <Button variant="secondary" onClick={onCancel}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" onClick={handleSave}>
                        {t('workspace.model.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ModelSelector;
