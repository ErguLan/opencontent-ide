/**
 * useWorkspaceMedia — Media/Templates asset management
 * OpenContent IDE
 */

import { useState, useRef, useCallback } from 'react';
import {
    getAllMedia,
    saveMedia,
    deleteMedia,
    updateMediaMetadata,
    countMedia,
    fileToBase64
} from '../../../services/mediaService';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useWorkspaceMedia({ isPro, t, onNotify }) {
    const [mediaAssets, setMediaAssets] = useState([]);
    const [activeAssetIds, setActiveAssetIds] = useState([]);
    const [mediaSidebarOpen, setMediaSidebarOpen] = useState(true);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [uploadAssetRole, setUploadAssetRole] = useState('reference');
    const [attachedMedia, setAttachedMedia] = useState(null);
    const fileInputRef = useRef(null);
    const chatFileInputRef = useRef(null);

    const loadMedia = useCallback(async () => {
        try {
            const assets = await getAllMedia();
            const normalized = (assets || []).map((asset) => ({ ...asset, role: asset.role || 'reference' }));
            setMediaAssets(normalized);
            setActiveAssetIds((prev) => prev.filter((id) => normalized.some((asset) => asset.id === id)));
        } catch (err) {
            console.error('Failed to load media:', err);
        }
    }, []);

    const validateFile = useCallback((file) => {
        if (!file.type.startsWith('image/')) {
            onNotify?.(t('workspace.media.invalidTypeTitle'), t('workspace.media.invalidTypeMessage'));
            return false;
        }
        if (file.size > MAX_FILE_SIZE) {
            onNotify?.(t('workspace.media.tooLargeTitle'), t('workspace.media.tooLargeMessage', { size: (file.size / (1024 * 1024)).toFixed(1) }));
            return false;
        }
        return true;
    }, [t, onNotify]);

    const handleUploadMedia = useCallback(async (fileOrEvent) => {
        const file = fileOrEvent?.target ? fileOrEvent.target.files?.[0] : fileOrEvent;
        if (!file) return { error: 'NO_FILE' };
        if (!validateFile(file)) return { error: 'INVALID_FILE' };

        const currentCount = await countMedia();
        const limit = isPro ? 10 : 3;
        if (currentCount >= limit) {
            onNotify?.(
                t('workspace.media.limitTitle'),
                isPro ? t('workspace.media.limitPro') : t('workspace.media.limitFree')
            );
            return { error: 'LIMIT_REACHED' };
        }

        setIsUploadingMedia(true);
        try {
            const saved = await saveMedia(file, file.name, { role: uploadAssetRole });
            setMediaAssets((prev) => [...prev, { ...saved, role: uploadAssetRole }]);
            return { success: true, asset: saved };
        } catch (err) {
            console.error('Upload failed:', err);
            onNotify?.(t('workspace.media.uploadFailedTitle'), t('workspace.media.uploadFailedMessage'));
            return { error: 'UPLOAD_FAILED' };
        } finally {
            setIsUploadingMedia(false);
            if (fileOrEvent?.target) fileOrEvent.target.value = '';
        }
    }, [isPro, uploadAssetRole, validateFile, t, onNotify]);

    const handleDeleteMedia = useCallback(async (id) => {
        try {
            await deleteMedia(id);
            setMediaAssets((prev) => prev.filter((asset) => asset.id !== id));
            setActiveAssetIds((prev) => prev.filter((assetId) => assetId !== id));
            if (attachedMedia?.id === id) setAttachedMedia(null);
        } catch (err) {
            console.error('Delete media failed:', err);
            onNotify?.(t('workspace.media.deleteFailedTitle'), t('workspace.media.deleteFailedMessage'));
        }
    }, [attachedMedia, t, onNotify]);

    const toggleAssetActive = useCallback((assetId) => {
        setActiveAssetIds((prev) =>
            prev.includes(assetId)
                ? prev.filter((id) => id !== assetId)
                : [...prev, assetId]
        );
    }, []);

    const handleAssetRoleChange = useCallback(async (assetId, role) => {
        try {
            await updateMediaMetadata(assetId, { role });
            setMediaAssets((prev) => prev.map((asset) => asset.id === assetId ? { ...asset, role } : asset));
        } catch (err) {
            console.error('Asset role update failed:', err);
        }
    }, []);

    const handleAttachMediaFromChat = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!validateFile(file)) return;
        try {
            const base64 = await fileToBase64(file);
            setAttachedMedia({ id: `temp_${Date.now()}`, name: file.name, data: base64, role: 'reference' });
        } catch (err) {
            console.error('Context attach failed:', err);
        }
        if (e.target) e.target.value = '';
    }, [validateFile]);

    const handleAttachExistingAsset = useCallback((asset) => {
        setAttachedMedia({ id: asset.id, name: asset.name, data: asset.data, role: asset.role || 'reference' });
    }, []);

    const isPersistedAssetId = useCallback((id) => {
        return typeof id === 'string' && id.startsWith('asset_');
    }, []);

    const getAssetRoleLabel = useCallback((role, translate) => {
        const map = {
            template: translate('workspace.media.roleTemplate'),
            reference: translate('workspace.media.roleReference'),
            logo: translate('workspace.media.roleLogo'),
            overlay: translate('workspace.media.roleOverlay')
        };
        return map[role] || role;
    }, []);

    return {
        mediaAssets,
        activeAssetIds,
        setActiveAssetIds,
        mediaSidebarOpen,
        setMediaSidebarOpen,
        isUploadingMedia,
        uploadAssetRole,
        setUploadAssetRole,
        attachedMedia,
        setAttachedMedia,
        fileInputRef,
        chatFileInputRef,
        loadMedia,
        handleUploadMedia,
        handleDeleteMedia,
        toggleAssetActive,
        handleAssetRoleChange,
        handleAttachMediaFromChat,
        handleAttachExistingAsset,
        isPersistedAssetId,
        getAssetRoleLabel
    };
}
