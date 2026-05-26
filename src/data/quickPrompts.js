/**
 * Quick Prompt Suggestions — Template starters
 * OpenContent IDE
 * 
 * Shows animated prompt suggestions when workspace is empty.
 * Suggestions are organized by category with visual cards.
 */

const QUICK_PROMPTS = {
    en: [
        { emoji: '📱', label: 'Instagram Post', prompt: 'Create a professional Instagram post about [topic]. Include hashtags, a catchy caption, and suggest the best time to post.' },
        { emoji: '🐦', label: 'Twitter Thread', prompt: 'Write a viral Twitter/X thread (5 tweets) about [topic]. Hook the reader in tweet 1, deliver value, end with a CTA.' },
        { emoji: '📧', label: 'Email Campaign', prompt: 'Write a marketing email with subject line, preview text, body, and CTA button text for [product/service].' },
        { emoji: '📝', label: 'Blog Intro', prompt: 'Write a compelling blog post introduction about [topic] that hooks the reader in the first sentence.' },
        { emoji: '🎯', label: 'Ad Copy', prompt: 'Create 3 variations of ad copy for [product]. Include headline, description, and call-to-action for each.' },
        { emoji: '🎨', label: 'Brand Tagline', prompt: 'Generate 5 catchy taglines for a [type] brand that is [adjective] and targets [audience].' },
        { emoji: '📊', label: 'LinkedIn Post', prompt: 'Write a professional LinkedIn post about [achievement/insight]. Use storytelling, add value, include relevant hashtags.' },
        { emoji: '🎬', label: 'YouTube Script', prompt: 'Write a YouTube video script intro (first 30 seconds) about [topic] that hooks viewers immediately.' },
        { emoji: '💡', label: 'Product Description', prompt: 'Write a compelling product description for [product] highlighting 3 key benefits and a strong CTA.' },
        { emoji: '🚀', label: 'Launch Announcement', prompt: 'Write a product launch announcement for [product]. Create excitement, highlight the main feature, include a launch-day offer.' }
    ],
    es: [
        { emoji: '📱', label: 'Post de Instagram', prompt: 'Crea un post profesional de Instagram sobre [tema]. Incluye hashtags, caption llamativo y sugiere el mejor horario.' },
        { emoji: '🐦', label: 'Hilo de Twitter', prompt: 'Escribe un hilo viral de Twitter/X (5 tweets) sobre [tema]. Engancha en el tweet 1, entrega valor, termina con CTA.' },
        { emoji: '📧', label: 'Email Marketing', prompt: 'Escribe un email de marketing con asunto, preview, cuerpo y botón CTA para [producto/servicio].' },
        { emoji: '📝', label: 'Intro de Blog', prompt: 'Escribe una introducción de blog post sobre [tema] que enganche al lector desde la primera oración.' },
        { emoji: '🎯', label: 'Copy de Anuncio', prompt: 'Crea 3 variaciones de copy publicitario para [producto]. Incluye título, descripción y CTA.' },
        { emoji: '🎨', label: 'Tagline de Marca', prompt: 'Genera 5 taglines para una marca de [tipo] que es [adjetivo] y va dirigida a [audiencia].' },
        { emoji: '📊', label: 'Post LinkedIn', prompt: 'Escribe un post profesional de LinkedIn sobre [logro/insight]. Usa storytelling y hashtags relevantes.' },
        { emoji: '🎬', label: 'Script YouTube', prompt: 'Escribe un guión de intro de YouTube (primeros 30s) sobre [tema] que enganche inmediatamente.' },
        { emoji: '💡', label: 'Descripción Producto', prompt: 'Escribe una descripción de producto para [producto] con 3 beneficios clave y CTA fuerte.' },
        { emoji: '🚀', label: 'Lanzamiento', prompt: 'Escribe un anuncio de lanzamiento para [producto]. Crea emoción, destaca la feature principal.' }
    ]
};

/**
 * Get random subset of prompts
 * @param {string} lang - 'en' or 'es'
 * @param {number} count - how many to return
 * @returns {Array}
 */
export function getQuickPrompts(lang = 'en', count = 3) {
    const prompts = QUICK_PROMPTS[lang] || QUICK_PROMPTS.en;
    const shuffled = [...prompts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Get all prompts for the full template browser
 */
export function getAllPrompts(lang = 'en') {
    return QUICK_PROMPTS[lang] || QUICK_PROMPTS.en;
}

export default QUICK_PROMPTS;
