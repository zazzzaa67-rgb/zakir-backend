-- Keep generated content aligned with the curriculum selected by the student.

alter table public.books
  add column if not exists track_id text references public.tracks(id);

create index if not exists books_track_subject_index
  on public.books(track_id, subject_id);

create or replace function public.validate_lesson_book_subject()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.books
    where id = new.book_id
      and subject_id = new.subject_id
  ) then
    raise exception 'الدرس والكتاب يجب أن يكونا لنفس المادة';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_lesson_book_subject_before_insert on public.lessons;
create trigger validate_lesson_book_subject_before_insert
before insert or update of book_id, subject_id on public.lessons
for each row execute function public.validate_lesson_book_subject();

-- A book may be shared by multiple tracks through subject_tracks. Do not copy
-- books or lessons per track; filtering APIs use the curriculum relation.

-- Ensure the third-secondary tracks used by the app exist before signup.
insert into public.tracks (id, name_ar, education_system, grade_level)
values
  ('scientific_science_3rd', 'علمي علوم (الثالث الثانوي)', 'general_secondary', 3),
  ('scientific_math_3rd', 'علمي رياضة (الثالث الثانوي)', 'general_secondary', 3),
  ('literary_3rd', 'أدبي (الثالث الثانوي)', 'general_secondary', 3),
  ('business_3rd', 'مسار الأعمال (الثالث الثانوي)', 'egyptian_baccalaureate', 3),
  ('arts_3rd', 'مسار الآداب والفنون (الثالث الثانوي)', 'egyptian_baccalaureate', 3)
on conflict (id) do update set
  name_ar = excluded.name_ar,
  education_system = excluded.education_system,
  grade_level = excluded.grade_level;

insert into public.subject_tracks (track_id, subject_id, is_required, source_reference)
select 'scientific_science_3rd', id, true, 'MOE-PORTAL-2026-2027'
from public.subjects where subject_code in ('BIOLOGY_ADVANCED', 'CHEMISTRY_ADVANCED', 'PHYSICS_ADVANCED')
on conflict (track_id, subject_id) do update set is_required = excluded.is_required, source_reference = excluded.source_reference;

insert into public.subject_tracks (track_id, subject_id, is_required, source_reference)
select 'scientific_math_3rd', id, true, 'MOE-PORTAL-2026-2027'
from public.subjects where subject_code in ('MATH_ADVANCED', 'PHYSICS_ADVANCED')
on conflict (track_id, subject_id) do update set is_required = excluded.is_required, source_reference = excluded.source_reference;

insert into public.subject_tracks (track_id, subject_id, is_required, source_reference)
select 'literary_3rd', id, true, 'MOE-PORTAL-2026-2027'
from public.subjects where subject_code in ('HISTORY', 'GEOGRAPHY_ADVANCED')
on conflict (track_id, subject_id) do update set is_required = excluded.is_required, source_reference = excluded.source_reference;
