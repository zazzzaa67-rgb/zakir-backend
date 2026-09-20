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

function createSequentialFallbackProxy(path: string[] = []): any {
  return new Proxy(() => {}, {
    get(_target, prop: string) {
      return createSequentialFallbackProxy([...path, prop]);
    },
    async apply(_target, _thisArg, args) {
      let lastError: any = null;

      // تجربة المفاتيح بداية من 0 لكل طلب جديد
      for (let index = 0; index < geminiClients.length; index++) {
        try {
          const activeClient = geminiClients[index];
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
          lastError = error;
          console.warn(
            `⚠️ المفتاح رقم [${index + 1}] فشل: ${error?.message || JSON.stringify(error)}`
          );

          if (index < geminiClients.length - 1) {
            console.log(`🔄 جاري التجربة مع المفتاح رقم [${index + 2}]...`);
          }
        }
      }

      console.error('❌ تفاصيل الخطأ الأخير من Gemini:', lastError);
      throw new Error(lastError?.message || 'نفدت جميع مفاتيح Gemini API المتاحة!');
    },
  });
}

export const ai = createSequentialFallbackProxy() as GoogleGenAI;