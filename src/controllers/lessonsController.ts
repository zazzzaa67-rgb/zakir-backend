import { Request, Response } from 'express';
import { ai } from '../config/gemini.js';
import { supabase } from '../config/supabase.js';
export const getLessonsBySubject = async (req: Request, res: Response) => {
    const { subject_id } = req.query;
    const trackId = typeof req.query.track_id === 'string' ? req.query.track_id.trim() : '';
    console.log("📥 الـ subject_id المستلم من Frontend:", subject_id); // أضف هذا السطر

    if (!subject_id || typeof subject_id !== 'string' || !trackId) {
        return res.status(400).json({ error: 'يجب تحديد المادة والمسار الدراسي' });
    }

    const { data: mapping, error: mappingError } = await supabase
        .from('subject_tracks')
        .select('subject_id')
        .eq('track_id', trackId)
        .eq('subject_id', subject_id.trim())
        .maybeSingle();
    if (mappingError) return res.status(500).json({ error: mappingError.message });
    if (!mapping) return res.status(404).json({ error: 'المادة دي مش ضمن المسار الدراسي المحدد' });

    const { data: books, error: booksError } = await supabase
        .from('books')
        .select('id')
        .eq('subject_id', subject_id.trim())
        .or(`track_id.is.null,track_id.eq.${trackId}`);
    if (booksError) return res.status(500).json({ error: booksError.message });
    const bookIds = (books ?? []).map((book: { id: string }) => book.id);
    if (bookIds.length === 0) return res.json([]);

    const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('subject_id', subject_id.trim())
        .in('book_id', bookIds)
        .order('order_index', { ascending: true });

    console.log("📤 الدروس الراجعة من الداتابيز:", data?.length || 0); // وأضف هذا السطر

    if (error) {
        console.error("❌ خطأ الداتابيز:", error.message);
        return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
};
export const getPublicSampleLessons = async (_req: Request, res: Response) => {
    try {
        const { data: subjects, error: subjectsError } = await supabase
            .from('subjects').select('id, title, grade_level').in('grade_level', [1, 2, 3]);
        if (subjectsError) return res.status(500).json({ error: subjectsError.message });
        const subjectIds = (subjects ?? []).map((subject: any) => subject.id);
        if (!subjectIds.length) return res.json([]);
        const { data: books, error: booksError } = await supabase
            .from('books').select('id, title, subject_id, status').in('subject_id', subjectIds);
        if (booksError) return res.status(500).json({ error: booksError.message });
        const readyBooks = (books ?? []).filter((book: any) => !book.status || ['completed', 'ready', 'processed'].includes(String(book.status).toLowerCase()));
        const samplesByGrade = await Promise.all([1, 2, 3].map(async (gradeLevel) => {
            const gradeSubjects = (subjects ?? []).filter((subject: any) => subject.grade_level === gradeLevel);
            const subjectIdsForGrade = new Set(gradeSubjects.map((subject: any) => subject.id));
            const gradeBooks = readyBooks.filter((book: any) => subjectIdsForGrade.has(book.subject_id));
            if (!gradeBooks.length) return null;
            const { data: lessons, error: lessonsError } = await supabase.from('lessons').select('*')
                .in('subject_id', [...subjectIdsForGrade]).in('book_id', gradeBooks.map((book: any) => book.id))
                .not('content_json', 'is', null).order('order_index', { ascending: true }).limit(1);
            if (lessonsError) throw lessonsError;
            const lesson = lessons?.[0];
            if (!lesson) return null;
            const subject = gradeSubjects.find((item: any) => item.id === lesson.subject_id);
            const book = gradeBooks.find((item: any) => item.id === lesson.book_id);
            return { ...lesson, grade_level: gradeLevel, subject_title: subject?.title ?? '', book_title: book?.title ?? '' };
        }));
        const samples = samplesByGrade.filter(Boolean);
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return res.json(samples);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Unable to load public sample lessons' });
    }
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
