-- Ensure every selectable track has its expected subjects.
-- This is additive and safe to re-run; it does not remove existing mappings.
-- Requires the subject codes and grade levels from migrations 001-005.

with expected(track_id, grade_level, subject_code, is_required, selection_group) as (
  values
    ('general_1st', 1, 'AR', true, null),
    ('general_1st', 1, 'EN1', true, null),
    ('general_1st', 1, 'MATH', true, null),
    ('general_1st', 1, 'HISTORY', true, null),
    ('general_1st', 1, 'INTEGRATED_SCIENCE', true, null),
    ('general_1st', 1, 'PHILOSOPHY_LOGIC', true, null),

    ('medicine_2nd', 2, 'AR', true, null),
    ('medicine_2nd', 2, 'EN1', true, null),
    ('medicine_2nd', 2, 'HISTORY', true, null),
    ('medicine_2nd', 2, 'MATH', false, 'second_grade_specialization'),
    ('medicine_2nd', 2, 'PHYSICS', false, 'second_grade_specialization'),
    ('engineering_2nd', 2, 'AR', true, null),
    ('engineering_2nd', 2, 'EN1', true, null),
    ('engineering_2nd', 2, 'HISTORY', true, null),
    ('engineering_2nd', 2, 'CHEMISTRY', false, 'second_grade_specialization'),
    ('engineering_2nd', 2, 'PROGRAMMING_AI', false, 'second_grade_specialization'),
    ('business_2nd', 2, 'AR', true, null),
    ('business_2nd', 2, 'EN1', true, null),
    ('business_2nd', 2, 'HISTORY', true, null),
    ('business_2nd', 2, 'ACCOUNTING', false, 'second_grade_specialization'),
    ('business_2nd', 2, 'BUSINESS', false, 'second_grade_specialization'),
    ('arts_2nd', 2, 'AR', true, null),
    ('arts_2nd', 2, 'EN1', true, null),
    ('arts_2nd', 2, 'HISTORY', true, null),
    ('arts_2nd', 2, 'PSYCHOLOGY', false, 'second_grade_specialization'),
    ('arts_2nd', 2, 'EN2', false, 'second_grade_specialization'),

    ('scientific_science_3rd', 3, 'AR', true, null),
    ('scientific_science_3rd', 3, 'EN1', true, null),
    ('scientific_science_3rd', 3, 'BIOLOGY_ADVANCED', true, null),
    ('scientific_science_3rd', 3, 'CHEMISTRY_ADVANCED', true, null),
    ('scientific_science_3rd', 3, 'PHYSICS_ADVANCED', true, null),
    ('scientific_math_3rd', 3, 'AR', true, null),
    ('scientific_math_3rd', 3, 'EN1', true, null),
    ('scientific_math_3rd', 3, 'MATH_ADVANCED', true, null),
    ('scientific_math_3rd', 3, 'PHYSICS_ADVANCED', true, null),
    ('literary_3rd', 3, 'AR', true, null),
    ('literary_3rd', 3, 'EN1', true, null),
    ('literary_3rd', 3, 'HISTORY', true, null),
    ('literary_3rd', 3, 'GEOGRAPHY_ADVANCED', true, null)
)
insert into public.subject_tracks (track_id, subject_id, is_required, selection_group, source_reference)
select e.track_id, s.id, e.is_required, e.selection_group, 'APP-TRACK-MAP-2026'
from expected e
join public.subjects s
  on s.grade_level = e.grade_level
 and s.subject_code = e.subject_code
on conflict (track_id, subject_id) do update set
  is_required = excluded.is_required,
  selection_group = excluded.selection_group,
  source_reference = excluded.source_reference;
