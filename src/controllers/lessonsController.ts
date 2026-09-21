import { Request, Response } from 'express';
import { ai } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';

export const getLessonsBySubject = async (req: Request, res: Response) => {
    const { subject_id, track_id } = req.query;
    if (!subject_id) {
    return res.status(400).json({ error: 'يجب تحديد subject_id' });
    }
        if (track_id) {
            const { data: subjectTrack, error: trackError } = await supabase
                .from('subject_tracks')
                .select('subject_id')
                .eq('track_id', track_id as string)
                .eq('subject_id', subject_id as string)
                .maybeSingle();
            if (trackError) return res.status(500).json({ error: trackError.message });
            if (!subjectTrack) {
                const { data: fallbackSubject, error: fallbackError } = await supabase
                    .from('subjects')
                    .select('id, books!inner(id, status)')
                    .eq('id', subject_id as string)
                    .eq('books.status', 'completed')
                    .maybeSingle();
                if (fallbackError) return res.status(500).json({ error: fallbackError.message });
                if (!fallbackSubject) return res.status(404).json({ error: 'المادة غير موجودة في هذا المسار' });
            }
        }

        const { data, error } = await supabase
    .from('lessons')
        .select('id, subject_id, book_id, unit_title, chapter_name, lesson_title, difficulty, duration_minutes, points_reward, coins_cost, order_index, generation_status, created_at, books(title, status, source_url)')
    .eq('subject_id', subject_id as string)
    .order('order_index', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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

        const conversation = history
            .filter((item) => item && (item.role === 'user' || item.role === 'model') && item.text)
            .slice(-6) // تقليل عدد الرسائل المرفقة لتسريع المعالجة
            .map((item) => `${item.role === 'user' ? 'الطالب' : 'المعلم'}: ${item.text}`)
            .join('\n');

        // 1. إعداد الـ Headers لدعم إرسال الرد المباشر (Stream)
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // 2. استخدام الموديل السريع الرسمي gemini-1.5-flash ومعالجة الـ Stream
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-1.5-flash', // 👈 تم تعديل الاسم إلى الموديل الرسمي السريع
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

        // 3. إرسال الكلمات للفرونت إند أولاً بأول
        for await (const chunk of responseStream) {
            if (chunk.text) {
                res.write(chunk.text);
            }
        }

        res.end();
    } catch (error: any) {
        console.error('❌ خطأ في محادثة شرح الدرس:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'تعذر تشغيل مدرس AI' });
        }
    }
};