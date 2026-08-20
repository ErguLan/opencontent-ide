/**
 * ModelSelector — user-driven model selection.
 * OpenContent never auto-picks a vendor model.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../common/Button';
import { getTextModelOptions, getVisionModelOptions, getImageModelOptions } from '../../services/ai';
import { ROUTES } from '../../config/constants';
import './ModelSelector.css';

const realModels = (items) => items.filter((model) => model?.id && !model.isPlaceholder);

function ModelSelector({ textModel, visionModel, imageModel, onTextChange, onVisionChange, onImageChange, onSave, onCancel }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [selectedText, setSelectedText] = useState(textModel || '');
    const [selectedVision, setSelectedVision] = useState(visionModel || '');
    const [selectedImage, setSelectedImage] = useState(imageModel || '');
    const [textOptions, setTextOptions] = useState([]);
    const [visionOptions, setVisionOptions] = useState([]);
    const [imageOptions, setImageOptions] = useState([]);

    useEffect(() => {
        setTextOptions(realModels(getTextModelOptions()));
        setVisionOptions(realModels(getVisionModelOptions()));
        setImageOptions(realModels(getImageModelOptions()));
    }, []);

    useEffect(() => {
        setSelectedText(textModel || '');
        setSelectedVision(visionModel || '');
        setSelectedImage(imageModel || '');
    }, [textModel, visionModel, imageModel]);

    const handleSave = () => {
        onTextChange?.(selectedText || null);
        onVisionChange?.(selectedVision || null);
        onImageChange?.(selectedImage || null);
        onSave?.(selectedText || null, selectedImage || null, selectedVision || null);
    };

    const handleManageModels = () => {
        onCancel?.();
        navigate(ROUTES.SETUP);
    };

    const renderSelect = (id, label, value, setValue, options) => (
        <div className="oc-model-selector-block">
            <label htmlFor={id} className="oc-model-selector-label">{label}</label>
            <select id={id} className="oc-model-selector-select" value={value || ''} onChange={(event) => setValue(event.target.value)}>
                <option value="">{t('workspace.model.noModelSelected')}</option>
                {options.map((model) => (
                    <option key={model.id} value={model.id}>
                        {model.nickname || model.id} · {model.provider}
                    </option>
                ))}
            </select>
            <div className="oc-model-selector-meta">
                {value ? <span className="oc-model-selector-id">{value}</span> : <span>{t('workspace.model.chooseExplicitly')}</span>}
            </div>
        </div>
    );

    return (
        <div className="oc-model-selector">
            {renderSelect('oc-text-model', t('workspace.model.textLabel'), selectedText, setSelectedText, textOptions)}
            {renderSelect('oc-vision-model', t('workspace.model.visionLabel'), selectedVision, setSelectedVision, visionOptions)}
            {renderSelect('oc-image-model', t('workspace.model.imageLabel'), selectedImage, setSelectedImage, imageOptions)}

            {textOptions.length === 0 && imageOptions.length === 0 && visionOptions.length === 0 && (
                <p className="oc-model-selector-meta">{t('landing.providerRequired')}</p>
            )}

            <div className="oc-model-selector-actions">
                <Button variant="secondary" onClick={handleManageModels}>{t('workspace.model.manageModels')}</Button>
                <div className="oc-model-selector-save-group">
                    <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
                    <Button variant="primary" onClick={handleSave}>{t('workspace.model.save')}</Button>
                </div>
            </div>
        </div>
    );
}

export default ModelSelector;
