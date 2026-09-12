import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();
const geminiApiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
].filter((key): key is string => Boolean(key));

const uniqueGeminiApiKeys = [...new Set(geminiApiKeys)];

if (uniqueGeminiApiKeys.length === 0) {
    throw new Error('Missing Gemini API keys in .env file.');
}

export const geminiClients = uniqueGeminiApiKeys.map((apiKey) => new GoogleGenAI({ apiKey }));

// مؤشر المفتاح الحالي (يبدأ دائمًا من المفتاح الأول 0)
let currentClientIndex = 0;

function createSequentialFallbackProxy(path: string[] = []): any {
    return new Proxy(() => {}, {
        get(_target, prop: string) {
            return createSequentialFallbackProxy([...path, prop]);
        },
        async apply(_target, _thisArg, args) {
            while (currentClientIndex < geminiClients.length) {
                try {
                    const activeClient = geminiClients[currentClientIndex];
                    let targetProp: any = activeClient;
                    let parent: any = null;

                    for (const segment of path) {
                        parent = targetProp;
                        targetProp = targetProp[segment];
                    }

                    if (typeof targetProp === 'function') {
                        return await targetProp.apply(parent, args);
                    }
                    return targetProp;
                } catch (error: any) {
                    console.warn(
                        `⚠️ المفتاح رقم [${currentClientIndex + 1}] انتهى رصيده أو حدث خطأ: ${error?.message || error}`
                    );
                    
                    // التحول للمفتاح التالي
                    currentClientIndex++;

                    if (currentClientIndex >= geminiClients.length) {
                        throw new Error('❌ نفدت جميع مفاتيح Gemini API المتاحة!');
                    }

                    console.log(`🔄 تم التبديل تلقائياً إلى المفتاح رقم [${currentClientIndex + 1}] وإعادة المحاولة...`);
                }
            }
        }
    });
}
export const ai = createSequentialFallbackProxy() as GoogleGenAI;