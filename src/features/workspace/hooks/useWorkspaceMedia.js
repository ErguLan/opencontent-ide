/**
 * useWorkspaceMedia - asset management for the workspace.
 *
 * Owns the asset library, the active asset selection, the single attachment
 * used for the next request and the upload limits enforced by the plan.
 */

import { useCallback, useState } from 'react';
import {
    countMedia,
    deleteMedia,
    fileToBase64,
    getAllMedia,
    saveMedia,
    updateMediaMetadata
} from '../../../services/mediaService';
import { trackMetric } from '../../../services/metrics';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FREE_ASSET_LIMIT = 3;
const PRO_ASSET_LIMIT = 10;

export const ASSET_ROLES = Object.freeze(['reference', 'template', 'logo', 'overlay']);

export function useWorkspaceMedia({ isPro, t, onAssetLimitReached, onError }) {
    const [mediaAssets, setMediaAssets] = useState([]);
    const [activeAssetIds, setActiveAssetIds] = useState([]);
    const [mediaSidebarOpen, setMediaSidebarOpen] = useState(true);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [uploadAssetRole, setUploadAssetRole] = useState('reference');
    const [attachedMedia, setAttachedMedia] = useState(null);

    const loadMedia = useCallback(async () => {
        try {
            const assets = await getAllMedia();
            const normalized = (assets || []).map((asset) => ({
                ...asset,
                role: asset.role || 'reference'
            }));
            setMediaAssets(normalized);
            setActiveAssetIds((prev) => prev.filter((id) => normalized.some((asset) => asset.id === id)));
        } catch (error) {
            console.error('Failed to load media', error);
        }
    }, []);

    const isPersistedAssetId = useCallback(
        (assetId) => String(assetId || '').startsWith('asset_'),
        []
    );

    const getAssetRoleLabel = useCallback((role) => {
        const map = {
            logo: t('workspace.media.roleLogo'),
            template: t('workspace.media.roleTemplate'),
            reference: t('workspace.media.roleReference'),
            overlay: t('workspace.media.roleOverlay')
        };
        return map[role] || map.reference;
    }, [t]);

    const isTooLarge = useCallback((file) => file.size > MAX_FILE_SIZE, []);

    const uploadFile = useCallback(async (file) => {
        if (!file) return false;

        if (isTooLarge(file)) {
            onError?.(t('workspace.media.tooLargeMessage', {
                size: (file.size / (1024 * 1024)).toFixed(1)
            }));
            return false;
        }

        const currentCount = await countMedia();
        const limit = isPro ? PRO_ASSET_LIMIT : FREE_ASSET_LIMIT;
        if (currentCount >= limit) {
            if (isPro) {
                onError?.(t('workspace.media.limitPro'));
            } else {
                onAssetLimitReached?.({
                    title: t('workspace.media.limitTitle'),
                    message: t('workspace.media.limitFree'),
                    reason: 'MEDIA_LIMIT'
                });
                trackMetric('paywall_shown', { reason: 'MEDIA_LIMIT', plan: 'FREE' });
            }
            return false;
        }

        setIsUploadingMedia(true);
        try {
            await saveMedia(file, file.name, { role: uploadAssetRole });
            await loadMedia();
            return true;
        } catch (error) {
            console.error('Upload failed', error);
            onError?.(t('workspace.media.uploadFailedMessage'));
            return false;
        } finally {
            setIsUploadingMedia(false);
        }
    }, [isPro, isTooLarge, loadMedia, onAssetLimitReached, onError, t, uploadAssetRole]);

    const removeMedia = useCallback(async (assetId) => {
        try {
            await deleteMedia(assetId);
            if (attachedMedia?.id === assetId) setAttachedMedia(null);
            setActiveAssetIds((prev) => prev.filter((id) => id !== assetId));
            await loadMedia();
        } catch (error) {
            console.error('Delete failed', error);
            onError?.(t('workspace.media.deleteFailedMessage'));
        }
    }, [attachedMedia, loadMedia, onError, t]);

    const attachFileAsContext = useCallback(async (file) => {
        if (!file) return;

        if (isTooLarge(file)) {
            onError?.(t('workspace.media.tooLargeMessage', {
                size: (file.size / (1024 * 1024)).toFixed(1)
            }));
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            setAttachedMedia({
                id: `temp_${Date.now()}`,
                name: file.name,
                data: base64,
                role: 'reference'
            });
        } catch (error) {
            console.error('Context attach failed', error);
            onError?.(t('workspace.media.uploadFailedMessage'));
        }
    }, [isTooLarge, onError, t]);

    const attachExistingAsset = useCallback((asset) => {
        setAttachedMedia({
            id: asset.id,
            name: asset.name,
            data: asset.data,
            role: asset.role || 'reference'
        });
    }, []);

    const toggleAssetActive = useCallback((assetId) => {
        if (!assetId) return;
        setActiveAssetIds((prev) => (prev.includes(assetId)
            ? prev.filter((id) => id !== assetId)
            : [...prev, assetId]));
    }, []);

    const changeAssetRole = useCallback(async (assetId, role) => {
        try {
            await updateMediaMetadata(assetId, { role });
            await loadMedia();
        } catch (error) {
            console.error('Asset role update failed', error);
        }
    }, [loadMedia]);

    const changeAttachedRole = useCallback(async (role) => {
        if (!attachedMedia?.id) return;
        if (isPersistedAssetId(attachedMedia.id)) {
            await changeAssetRole(attachedMedia.id, role);
        }
        setAttachedMedia((prev) => (prev ? { ...prev, role } : prev));
    }, [attachedMedia, changeAssetRole, isPersistedAssetId]);

    const toggleAttachedActive = useCallback(() => {
        if (!attachedMedia?.id || !isPersistedAssetId(attachedMedia.id)) return;
        toggleAssetActive(attachedMedia.id);
    }, [attachedMedia, isPersistedAssetId, toggleAssetActive]);

    const assetLimit = isPro ? PRO_ASSET_LIMIT : FREE_ASSET_LIMIT;

    return {
        ASSET_ROLES,
        isPro,
        mediaAssets,
        activeAssetIds,
        mediaSidebarOpen,
        setMediaSidebarOpen,
        isUploadingMedia,
        uploadAssetRole,
        setUploadAssetRole,
        attachedMedia,
        setAttachedMedia,
        assetLimit,
        loadMedia,
uploadFile,
        removeMedia,
        attachFileAsContext,
        attachExistingAsset,
        toggleAssetActive,
        changeAssetRole,
        changeAttachedRole,
        toggleAttachedActive,
        isPersistedAssetId,
        getAssetRoleLabel
    };
}
