import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

export const getSubjectsByTrack = async (req: Request, res: Response) => {
    const { track_id } = req.query;
    if (!track_id) {
    return res.status(400).json({ error: 'يجب تحديد track_id' });
    }
        const { data, error } = await supabase
    .from('subject_tracks')
        .select('subject_id, is_required, selection_group, subjects(id, title, grade, grade_level, subject_code, education_system, books(id, title, status, source_url, term, total_lessons_generated))')
    .eq('track_id', track_id as string);
    if (error) return res.status(500).json({ error: error.message });
        let subjects = (data ?? []).map((item: any) => ({
            ...(Array.isArray(item.subjects) ? item.subjects[0] : item.subjects),
            is_required: item.is_required,
            selection_group: item.selection_group,
        })).filter((subject: any) => subject.id);

        // Older databases may contain tracks but no subject_tracks rows yet.
        // Keep the curriculum usable by showing subjects with completed books.
        if (subjects.length === 0) {
            const { data: completedBooks, error: booksError } = await supabase
                .from('books')
                .select('id, subject_id, title, status, source_url, term, total_lessons_generated')
                .eq('status', 'completed');
            if (booksError) return res.status(500).json({ error: booksError.message });

            const subjectIds = [...new Set((completedBooks ?? []).map((book: any) => book.subject_id))];
            if (subjectIds.length > 0) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('subjects')
                    .select('id, title, grade, grade_level, subject_code, education_system')
                    .in('id', subjectIds);
                if (fallbackError) return res.status(500).json({ error: fallbackError.message });
                subjects = (fallbackData ?? []).map((subject: any) => ({
                    ...subject,
                    books: (completedBooks ?? []).filter((book: any) => book.subject_id === subject.id),
                })).filter((subject: any) => subject.books.length > 0);
            }
        }
    res.json(subjects);
};