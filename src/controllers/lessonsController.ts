import { Request, Response } from 'express';
import { ai } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';
export const getLessonsBySubject = async (req: Request, res: Response) => {
    const { subject_id } = req.query;
    console.log("📥 الـ subject_id المستلم من Frontend:", subject_id); // أضف هذا السطر

    if (!subject_id) {
        return res.status(400).json({ error: 'يجب تحديد subject_id' });
    }

    const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('subject_id', String(subject_id).trim())
        .order('order_index', { ascending: true });

    console.log("📤 الدروس الراجعة من الداتابيز:", data?.length || 0); // وأضف هذا السطر

    if (error) {
        console.error("❌ خطأ الداتابيز:", error.message);
        return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
};
export const getLessonById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('lessons')
        .select('*, books(id, title, source_url, status)')
        .eq('id', id)
        .single();

    if (error) return res.status(404).json({ error: 'الدرس غير موجود' });
    res.json(data);
};

export const chatAboutLesson = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { message, history = [] } = req.body as {
            message?: string;
            history?: Array<{ role: 'user' | 'model'; text: string }>;
        };

        if (!message?.trim()) {
            res.status(400).json({ error: 'يجب إرسال سؤال الطالب' });
            return;
        }

        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select('lesson_title, content_json')
            .eq('id', id)
            .single();

        if (lessonError || !lesson) {
            res.status(404).json({ error: 'الدرس غير موجود' });
            return;
        }

        const content = lesson.content_json as Record<string, unknown>;
        const safeContent = { ...content };
        delete safeContent.exam;
        delete safeContent.homework;
        delete safeContent.quiz;

        // دمج أحدث 6 رسائل فقط لتسريع المعالجة
        const conversation = history
            .filter((item) => item && (item.role === 'user' || item.role === 'model') && item.text)
            .slice(-6)
            .map((item) => `${item.role === 'user' ? 'الطالب' : 'المعلم'}: ${item.text}`)
            .join('\n');

        // 1. إعداد الـ Headers لمنع الـ Caching ولدعم البث المباشر
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');

        // 2. طلب الـ Stream من Gemini
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.6-flash',
            contents: `محتوى الدرس:\n${JSON.stringify(safeContent)}\n\nالمحادثة السابقة:\n${conversation}\n\nسؤال الطالب:\n${message}`,
            config: {
                systemInstruction: `
أنت مدرس مصري هادئ وذكي تشرح درس الطالب كأنك في محادثة شخصية.
اشرح بالعربية المصرية البسيطة وبدون تشكيل. ابدأ من مستوى الطالب، وقسم الإجابة لخطوات.
استخدم أمثلة من محتوى الدرس فقط، واسأل سؤالا قصيرا للتأكد من الفهم عند الحاجة.
لا تعرض إجابات الامتحان أو الواجب ولا تخترع معلومات خارج محتوى الدرس.
`,
            },
        });

        // 3. إرسال الكلمات المتدفقة فور وصولها
        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
                res.write(text);
            }
        }

        res.end();
    } catch (error: any) {
        console.error('❌ خطأ في محادثة شرح الدرس:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'تعذر تشغيل مدرس AI' });
        } else {
            res.end();
        }
    }
};