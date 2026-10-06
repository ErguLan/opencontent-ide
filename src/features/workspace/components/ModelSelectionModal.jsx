/**
 * ModelSelectionModal - explicit model choice for text, vision and image.
 *
 * Each capability is independent and the unselected entry is always available.
 * Saving writes only what the user picked; it never fills a gap automatically.
 */

import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import Icon, { ICONS } from '../../../components/icons/Icon';

const NO_MODELS_MARKER = 'workspace.model.noModels';

function ModelField({ id, label, options, value, onChange, getLabel, getBlurb, t }) {
    const hasOptions = options.length > 0;

    return (
        <div className="model-selector-block">
            <label htmlFor={id}>{label}</label>
            <select id={id} value={value || ''} onChange={(event) => onChange(event.target.value)}>
                <option value="">{t('workspace.model.noModelSelected')}</option>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>{getLabel(option)}</option>
                ))}
            </select>
            <div className="model-blurb">
                {!hasOptions
                    ? t(NO_MODELS_MARKER)
                    : getBlurb(value)}
            </div>
        </div>
    );
}

function ModelSelectionModal({
    isOpen,
    onClose,
    onSave,
    models,
    t
}) {
    const {
        textModelOptions,
        imageModelOptions,
        visionModelOptions,
        textModel,
        imageModel,
        visionModel,
        setTextModel,
        setImageModel,
        setVisionModel,
        getTextModelLabel,
        getTextModelBlurb,
        getImageModelBlurb,
        getVisionModelBlurb
    } = models;

    const registered = textModelOptions.length - 1 + imageModelOptions.length - 1 + visionModelOptions.length - 1;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('workspace.model.title')}
            className="modal-model"
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" onClick={onSave}>{t('workspace.model.save')}</Button>
                </>
            )}
        >
            <p className="oc-model-hint">
                <Icon src={ICONS.INFO} size="xs" alt="" />
                {t('workspace.model.chooseExplicitly')}
            </p>

            <ModelField
                id="workspace-text-model"
                label={t('workspace.model.textLabel')}
                options={textModelOptions}
                value={textModel}
                onChange={setTextModel}
                getLabel={getTextModelLabel}
                getBlurb={getTextModelBlurb}
                t={t}
            />

            <ModelField
                id="workspace-image-model"
                label={t('workspace.model.imageLabel')}
                options={imageModelOptions}
                value={imageModel}
                onChange={setImageModel}
                getLabel={(option) => option.nickname || option.id}
                getBlurb={getImageModelBlurb}
                t={t}
            />

            <ModelField
                id="workspace-vision-model"
                label={t('workspace.model.visionLabel')}
                options={visionModelOptions}
                value={visionModel}
                onChange={setVisionModel}
                getLabel={(option) => option.nickname || option.id}
                getBlurb={getVisionModelBlurb}
                t={t}
            />

            <p className="oc-model-count">{t('workspace.model.registryCount', { count: registered })}</p>
        </Modal>
    );
}

export default ModelSelectionModal;