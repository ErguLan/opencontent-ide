/**
 * Image Processor Utility
 * Handles canvas-based operations like logo overlays
 */

/**
 * Overlays a logo onto a base image
 * @param {string} baseImageUrl - URL or Base64 of the background image
 * @param {string} logoData - Base64 or URL of the logo
 * @param {Object} options - { position: 'bottom-right', size: 0.15, margin: 20 }
 * @returns {Promise<string>} - Base64 of the resulting image
 */
export const applyLogoOverlay = (baseImageUrl, logoData, options = {}) => {
    return new Promise((resolve, reject) => {
        const { position = 'bottom-right', size = 0.2, margin = 40 } = options;

        const baseImg = new Image();
        const logoImg = new Image();

        baseImg.crossOrigin = "anonymous";
        logoImg.crossOrigin = "anonymous";

        baseImg.onload = () => {
            logoImg.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = baseImg.width;
                canvas.height = baseImg.height;

                // Draw base image
                ctx.drawImage(baseImg, 0, 0);

                // Calculate logo dimensions while preserving aspect ratio
                // size is relative to the width of the base image
                const targetWidth = baseImg.width * size;
                const scale = targetWidth / logoImg.width;
                const targetHeight = logoImg.height * scale;

                let x, y;

                switch (position) {
                    case 'top-left':
                        x = margin;
                        y = margin;
                        break;
                    case 'top-right':
                        x = baseImg.width - targetWidth - margin;
                        y = margin;
                        break;
                    case 'bottom-left':
                        x = margin;
                        y = baseImg.height - targetHeight - margin;
                        break;
                    case 'bottom-right':
                    default:
                        x = baseImg.width - targetWidth - margin;
                        y = baseImg.height - targetHeight - margin;
                        break;
                }

                // Draw logo
                ctx.drawImage(logoImg, x, y, targetWidth, targetHeight);

                resolve(canvas.toDataURL('image/png'));
            };
            logoImg.onerror = () => reject(new Error("Failed to load logo image"));
            logoImg.src = logoData;
        };
        baseImg.onerror = () => reject(new Error("Failed to load base image"));
        baseImg.src = baseImageUrl;
    });
};
