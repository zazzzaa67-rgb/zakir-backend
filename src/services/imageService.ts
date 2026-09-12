import axios from 'axios';
import { supabase } from '../config/supabase.js';
export async function generateAndSaveImage(prompt: string, fileName: string): Promise<string> {
    const fallbackUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80';

    try {
    const formattedPrompt = `${prompt}, highly detailed, educational illustration, vibrant vibrant colors, 8k resolution, clean background`;
    const encodedPrompt = encodeURIComponent(formattedPrompt);
    const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=800&height=500&seed=${Math.floor(Math.random() * 10000)}&nologo=true`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15_000,
        });
        const buffer = Buffer.from(response.data);
    const filePath = `images/${Date.now()}_${fileName}.jpg`;
        const { error } = await supabase.storage.from('images').upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
        });

    if (error) {
            console.warn('⚠️ تعذر رفع الصورة إلى bucket images، سيتم استخدام الرابط المباشر:', error.message);
        return imageUrl;
    }

        const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
    } catch (err) {
        console.warn('⚠️ تعذر توليد أو حفظ الصورة، سيتم استخدام الصورة الافتراضية:', err);
        return fallbackUrl;
    }
}