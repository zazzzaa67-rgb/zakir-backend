-- Add the official first-secondary Philosophy and Logic subject.
-- Source: https://studentbooks.moe.gov.eg/Books/Books-sec/

insert into public.subjects (
  id,
  title,
  grade,
  subject_code,
  grade_level,
  term,
  education_system
)
values (
  '44444444-4444-4444-8444-444444444444',
  'الفلسفة والمنطق',
  'الأول الثانوي',
  'PHILOSOPHY_LOGIC',
  1,
  1,
  'general_secondary'
)
on conflict (id) do update set
  title = excluded.title,
  grade = excluded.grade,
  subject_code = excluded.subject_code,
  grade_level = excluded.grade_level,
  term = excluded.term,
  education_system = excluded.education_system;

insert into public.subject_tracks (
  track_id,
  subject_id,
  is_required,
  selection_group,
  source_reference
)
values (
  'general_1st',
  '44444444-4444-4444-8444-444444444444',
  true,
  null,
  'MOE-PORTAL-2026-2027'
)
on conflict (track_id, subject_id) do update set
  is_required = excluded.is_required,
  selection_group = excluded.selection_group,
  source_reference = excluded.source_reference;
