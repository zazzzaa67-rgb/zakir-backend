import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

export const getSubjectsByTrack = async (req: Request, res: Response) => {
    const trackId = typeof req.query.track_id === 'string' ? req.query.track_id.trim() : '';
    if (!trackId) {
      return res.status(400).json({ error: 'يجب تحديد المسار الدراسي' });
    }

    const { data: track, error: trackLookupError } = await supabase
      .from('tracks')
      .select('id')
      .eq('id', trackId)
      .maybeSingle();
    if (trackLookupError) return res.status(500).json({ error: trackLookupError.message });
    if (!track) return res.status(404).json({ error: 'المسار الدراسي غير معروف' });

    if (trackId === 'business_3rd' || trackId === 'arts_3rd') {
      return res.status(404).json({ error: 'This third-grade track is not available.' });
    }
    const allowedThirdGradeSubjectIds: Record<string, string[]> = {
      scientific_science_3rd: [
        '074f5e5f-f975-4ee9-813a-ac732cccc613', '761786d3-f7ac-4355-88ea-16a2a9cc7590',
        'cdfd5d7a-89c0-4951-8b96-46602b91cb4c', '7b529a48-7f35-4521-bd58-1579231ea094',
        'd9cad980-5680-406e-ac9e-553c78113dcd',
      ],
      scientific_math_3rd: [
        '074f5e5f-f975-4ee9-813a-ac732cccc613', '761786d3-f7ac-4355-88ea-16a2a9cc7590',
        'ff869c6d-1613-4f6e-9258-ab5edebf1896', 'd9cad980-5680-406e-ac9e-553c78113dcd',
      ],
      literary_3rd: [
        '074f5e5f-f975-4ee9-813a-ac732cccc613', '761786d3-f7ac-4355-88ea-16a2a9cc7590',
        'c08f64f9-7579-4ec5-bbf7-96004c9b4653', '43a01cfa-6de2-4646-a8ae-39022ef6e87a',
      ],
    };

    const { data: trackRows, error: mappingError } = await supabase
        .from('subject_tracks')
        .select('subject_id, is_required, selection_group')
        .eq('track_id', trackId);
    if (mappingError) return res.status(500).json({ error: mappingError.message });

    const subjectIds = [...new Set((trackRows ?? []).map((row: any) => row.subject_id))];
    if (subjectIds.length === 0) {
      return res.status(409).json({ error: `لا توجد مواد مرتبطة بالمسار ${trackId}. طبّق migration 008 في مشروع Supabase المستخدم من الموقع.` });
    }
    let subjects: any[] = [];

    if (subjectIds.length > 0) {
        const [{ data: subjectRows, error: subjectsError }, { data: bookRows, error: booksError }] = await Promise.all([
            supabase
                .from('subjects')
                .select('id, title, grade, grade_level, subject_code, education_system')
                .in('id', subjectIds),
            supabase
                .from('books')
                .select('id, subject_id, title, status, source_url, term, total_lessons_generated, track_id')
                .in('subject_id', subjectIds)
                .or(`track_id.is.null,track_id.eq.${trackId}`),
        ]);
        if (subjectsError) return res.status(500).json({ error: subjectsError.message });
        if (booksError) return res.status(500).json({ error: booksError.message });

        const visibleSubjectRows = allowedThirdGradeSubjectIds[trackId]
          ? (subjectRows ?? []).filter((subject: any) => allowedThirdGradeSubjectIds[trackId].includes(subject.id))
          : subjectRows ?? [];
        subjects = visibleSubjectRows.map((subject: any) => {
            const mapping = (trackRows ?? []).find((row: any) => row.subject_id === subject.id);
            return {
                ...subject,
                is_required: mapping?.is_required,
                selection_group: mapping?.selection_group,
                books: (bookRows ?? []).filter((book: any) => book.subject_id === subject.id),
            };
        });
    }

    if (subjects.length === 0) {
        return res.status(409).json({ error: `روابط مواد المسار ${trackId} غير مكتملة في قاعدة البيانات.` });
    }
    res.json(subjects);
};
