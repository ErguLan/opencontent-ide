/**
 * useWorkspaceMedia — Media/Templates asset management
 * OpenContent IDE
 */
import { useState, useRef, useCallback } from 'react';
import {
    getAllMedia,
    saveMedia,
    deleteMedia,
    getMediaById
} from '../../../services/mediaService';

export function useWorkspaceMedia(currentProjectId, isPro) {
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
            const all = await getAllMedia(currentProjectId);
            setMediaAssets(all || []);
        } catch (err) {
            console.error('Failed to load media:', err);
        }
    }, [currentProjectId]);

    const handleUploadMedia = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        if (!isPro && mediaAssets.length + files.length > 3) {
            return { error: 'LIMIT_REACHED' };
        }

        setIsUploadingMedia(true);
        try {
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });

                const asset = {
                    name: file.name,
                    type: file.type,
                    role: uploadAssetRole,
                    dataUrl,
                    projectId: currentProjectId,
                    createdAt: new Date().toISOString()
                };

                const saved = await saveMedia(asset);
                setMediaAssets(prev => [...prev, saved]);
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsUploadingMedia(false);
            if (e.target) e.target.value = '';
        }
        return { success: true };
    }, [currentProjectId, isPro, mediaAssets.length, uploadAssetRole]);

    const handleDeleteMedia = useCallback(async (id) => {
        try {
            await deleteMedia(id);
            setMediaAssets(prev => prev.filter(a => a.id !== id));
            setActiveAssetIds(prev => prev.filter(aid => aid !== id));
            if (attachedMedia?.id === id) setAttachedMedia(null);
        } catch (err) {
            console.error('Delete media failed:', err);
        }
    }, [attachedMedia]);

    const toggleAssetActive = useCallback((assetId) => {
        setActiveAssetIds(prev =>
            prev.includes(assetId)
                ? prev.filter(id => id !== assetId)
                : [...prev, assetId]
        );
    }, []);

    const handleAssetRoleChange = useCallback(async (assetId, role) => {
        setMediaAssets(prev => prev.map(a => a.id === assetId ? { ...a, role } : a));
    }, []);

    const handleAttachMediaFromChat = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        const dataUrl = await new Promise(resolve => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
        setAttachedMedia({ name: file.name, dataUrl, type: file.type, id: `temp_${Date.now()}` });
        if (e.target) e.target.value = '';
    }, []);

    const isPersistedAssetId = useCallback((id) => {
        return typeof id === 'string' && !id.startsWith('temp_');
    }, []);

    const getAssetRoleLabel = useCallback((role) => {
        const map = {
            template: 'Template',
            reference: 'Reference',
            logo: 'Logo',
            overlay: 'Overlay'
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
        isPersistedAssetId,
        getAssetRoleLabel
    };
}
