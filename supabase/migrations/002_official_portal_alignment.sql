-- Align the baccalaureate track mappings with the official 2026-2027 student book portal.
-- Source: https://studentbooks.moe.gov.eg/EgyptianBaccalaureate/SpecializedSubjects/

-- The official Medicine and Life Sciences page offers Mathematics or Physics.
delete from public.subject_tracks
where track_id = 'medicine_2nd'
  and selection_group = 'second_grade_specialization';

insert into public.subject_tracks (track_id, subject_id, is_required, selection_group, source_reference)
values
  ('medicine_2nd', '72aa458f-eec6-4e75-a4a0-45c67719629e', false, 'second_grade_specialization', 'MOE-PORTAL-2026-2027'),
  ('medicine_2nd', 'b81b7239-abb9-491e-804c-e158c587a477', false, 'second_grade_specialization', 'MOE-PORTAL-2026-2027')
on conflict (track_id, subject_id) do update set
  is_required = excluded.is_required,
  selection_group = excluded.selection_group,
  source_reference = excluded.source_reference;
