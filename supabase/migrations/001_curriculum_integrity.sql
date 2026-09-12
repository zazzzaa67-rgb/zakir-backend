-- Curriculum metadata and integrity rules for Egyptian secondary education.
-- Run this migration in the Supabase SQL editor before ingesting any PDFs.

alter table public.tracks
  add column if not exists education_system text not null default 'egyptian_baccalaureate',
  add column if not exists grade_level smallint;

alter table public.subjects
  add column if not exists subject_code text,
  add column if not exists grade_level smallint,
  add column if not exists term smallint,
  add column if not exists education_system text not null default 'egyptian_baccalaureate';

alter table public.subject_tracks
  add column if not exists is_required boolean not null default true,
  add column if not exists selection_group text,
  add column if not exists source_reference text;

alter table public.books
  add column if not exists source_url text,
  add column if not exists source_name text,
  add column if not exists term smallint,
  add column if not exists total_lessons_generated integer not null default 0;

alter table public.lessons
  add column if not exists source_order integer,
  add column if not exists generation_status text not null default 'completed';

create unique index if not exists subjects_grade_code_unique
  on public.subjects (grade_level, subject_code)
  where subject_code is not null;

create unique index if not exists books_subject_source_unique
  on public.books (subject_id, source_url)
  where source_url is not null;

create unique index if not exists lessons_book_source_order_unique
  on public.lessons (book_id, source_order)
  where source_order is not null;

create index if not exists subjects_grade_level_index
  on public.subjects (grade_level);

create index if not exists books_subject_term_index
  on public.books (subject_id, term);

create index if not exists lessons_book_order_index
  on public.lessons (book_id, source_order);

update public.tracks set grade_level = 1 where id = 'general_1st';
update public.tracks set grade_level = 2 where id in ('medicine_2nd', 'engineering_2nd', 'business_2nd', 'arts_2nd');
update public.tracks set grade_level = 3 where id in ('scientific_science_3rd', 'scientific_math_3rd', 'literary_3rd', 'business_3rd', 'arts_3rd');

update public.subjects set subject_code = 'AR', grade_level = 1, term = 1 where id = 'b4b0c16e-73bc-4fd8-af96-0e2c562edece';
update public.subjects set subject_code = 'EN1', grade_level = 1, term = 1 where id = '718fe5a4-290c-41f7-849d-4a81be4e2685';
update public.subjects set subject_code = 'MATH', grade_level = 1, term = 1 where id = '520485e6-1fe5-41ad-990b-b150be26bb1c';
update public.subjects set subject_code = 'HISTORY', grade_level = 1, term = 1 where id = '13793b78-5122-4b6e-a567-7b0e5dbeb8c3';
update public.subjects set subject_code = 'INTEGRATED_SCIENCE', grade_level = 1, term = 1 where id = 'ffb54673-70df-42a3-8744-75814ec7a999';

update public.subjects set subject_code = 'AR', grade_level = 2, term = 1 where id = '78a00e46-e014-430e-9034-3b2f7bd0cd4a';
update public.subjects set subject_code = 'EN1', grade_level = 2, term = 1 where id = 'b549eb0c-e9d8-4f23-b91e-8538629e65bc';
update public.subjects set subject_code = 'HISTORY', grade_level = 2, term = 1 where id = '108a30dd-f36a-434b-bb76-f2eeacd19477';
update public.subjects set subject_code = 'BIOLOGY', grade_level = 2, term = 1 where id = '9ec6b814-6a41-401c-969c-be0751c76e52';
update public.subjects set subject_code = 'PHYSICS', grade_level = 2, term = 1 where id = 'b81b7239-abb9-491e-804c-e158c587a477';
update public.subjects set subject_code = 'MATH', grade_level = 2, term = 1 where id = '72aa458f-eec6-4e75-a4a0-45c67719629e';
update public.subjects set subject_code = 'PROGRAMMING_AI', grade_level = 2, term = 1 where id = '09f877c5-9129-41fe-855c-b05d86ae5658';
update public.subjects set subject_code = 'GEOGRAPHY', grade_level = 2, term = 1 where id = 'ed8103dc-3a8c-4b40-868a-f8c3624ee727';
update public.subjects set subject_code = 'PSYCHOLOGY', grade_level = 2, term = 1 where id = 'e0f213a2-cc98-4012-b173-a9c6f3903333';
update public.subjects set subject_code = 'CHEMISTRY', grade_level = 2, term = 1 where id = '01bbd336-d818-4721-be65-be23f1629afd';
update public.subjects set subject_code = 'ACCOUNTING', grade_level = 2, term = 1 where id = 'a3fd11e8-36a4-4e9a-8077-aa31ccbf4bae';
update public.subjects set subject_code = 'BUSINESS', grade_level = 2, term = 1 where id = '20bfb3cc-95fa-4ccc-abce-313cf5ab81d6';

update public.subjects set subject_code = 'BIOLOGY_ADVANCED', grade_level = 3, term = 1 where id = 'cdfd5d7a-89c0-4951-8b96-46602b91cb4c';
update public.subjects set subject_code = 'CHEMISTRY_ADVANCED', grade_level = 3, term = 1 where id = '7b529a48-7f35-4521-bd58-1579231ea094';
update public.subjects set subject_code = 'PHYSICS_ADVANCED', grade_level = 3, term = 1 where id = 'd9cad980-5680-406e-ac9e-553c78113dcd';
update public.subjects set subject_code = 'AR', grade_level = 3, term = 1 where id = '074f5e5f-f975-4ee9-813a-ac732cccc613';
update public.subjects set subject_code = 'EN1', grade_level = 3, term = 1 where id = '761786d3-f7ac-4355-88ea-16a2a9cc7590';
update public.subjects set subject_code = 'MATH_ADVANCED', grade_level = 3, term = 1 where id = 'ff869c6d-1613-4f6e-9258-ab5edebf1896';
update public.subjects set subject_code = 'HISTORY', grade_level = 3, term = 1 where id = 'c08f64f9-7579-4ec5-bbf7-96004c9b4653';
update public.subjects set subject_code = 'GEOGRAPHY_ADVANCED', grade_level = 3, term = 1 where id = '43a01cfa-6de2-4646-a8ae-39022ef6e87a';
update public.subjects set subject_code = 'STATISTICS', grade_level = 3, term = 1 where id = '93515fea-6f90-4f66-89ab-3a8d665732c2';

insert into public.subjects (id, title, grade, subject_code, grade_level, term, education_system)
values
  ('11111111-1111-4111-8111-111111111111', 'اللغة الأجنبية الثانية', 'الثاني الثانوي', 'EN2', 2, 1, 'egyptian_baccalaureate'),
  ('22222222-2222-4222-8222-222222222222', 'الاقتصاد', 'الثالث الثانوي', 'ECONOMICS_ADVANCED', 3, 1, 'egyptian_baccalaureate'),
  ('33333333-3333-4333-8333-333333333333', 'الرياضيات', 'الثالث الثانوي', 'MATH_BUSINESS', 3, 1, 'egyptian_baccalaureate')
on conflict (id) do update set
  title = excluded.title,
  grade = excluded.grade,
  subject_code = excluded.subject_code,
  grade_level = excluded.grade_level,
  term = excluded.term,
  education_system = excluded.education_system;

insert into public.tracks (id, name_ar, education_system, grade_level)
values
  ('business_3rd', 'مسار الأعمال (تالتة ثانوي بكالوريا)', 'egyptian_baccalaureate', 3),
  ('arts_3rd', 'مسار الآداب والفنون (تالتة ثانوي بكالوريا)', 'egyptian_baccalaureate', 3)
on conflict (id) do update set
  name_ar = excluded.name_ar,
  education_system = excluded.education_system,
  grade_level = excluded.grade_level;

-- Rebuild only the baccalaureate mappings so optional subjects are explicit.
delete from public.subject_tracks
where track_id in ('medicine_2nd', 'engineering_2nd', 'business_2nd', 'arts_2nd', 'scientific_science_3rd', 'scientific_math_3rd', 'business_3rd', 'arts_3rd');

insert into public.subject_tracks (track_id, subject_id, is_required, selection_group, source_reference)
values
  ('medicine_2nd', '78a00e46-e014-430e-9034-3b2f7bd0cd4a', true, null, 'MOE-2026-08-17'),
  ('medicine_2nd', 'b549eb0c-e9d8-4f23-b91e-8538629e65bc', true, null, 'MOE-2026-08-17'),
  ('medicine_2nd', '108a30dd-f36a-434b-bb76-f2eeacd19477', true, null, 'MOE-2026-08-17'),
  ('medicine_2nd', 'b81b7239-abb9-491e-804c-e158c587a477', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('medicine_2nd', '01bbd336-d818-4721-be65-be23f1629afd', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('engineering_2nd', '78a00e46-e014-430e-9034-3b2f7bd0cd4a', true, null, 'MOE-2026-08-17'),
  ('engineering_2nd', 'b549eb0c-e9d8-4f23-b91e-8538629e65bc', true, null, 'MOE-2026-08-17'),
  ('engineering_2nd', '108a30dd-f36a-434b-bb76-f2eeacd19477', true, null, 'MOE-2026-08-17'),
  ('engineering_2nd', '01bbd336-d818-4721-be65-be23f1629afd', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('engineering_2nd', '09f877c5-9129-41fe-855c-b05d86ae5658', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('business_2nd', '78a00e46-e014-430e-9034-3b2f7bd0cd4a', true, null, 'MOE-2026-08-17'),
  ('business_2nd', 'b549eb0c-e9d8-4f23-b91e-8538629e65bc', true, null, 'MOE-2026-08-17'),
  ('business_2nd', '108a30dd-f36a-434b-bb76-f2eeacd19477', true, null, 'MOE-2026-08-17'),
  ('business_2nd', 'a3fd11e8-36a4-4e9a-8077-aa31ccbf4bae', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('business_2nd', '20bfb3cc-95fa-4ccc-abce-313cf5ab81d6', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('arts_2nd', '78a00e46-e014-430e-9034-3b2f7bd0cd4a', true, null, 'MOE-2026-08-17'),
  ('arts_2nd', 'b549eb0c-e9d8-4f23-b91e-8538629e65bc', true, null, 'MOE-2026-08-17'),
  ('arts_2nd', '108a30dd-f36a-434b-bb76-f2eeacd19477', true, null, 'MOE-2026-08-17'),
  ('arts_2nd', 'e0f213a2-cc98-4012-b173-a9c6f3903333', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('arts_2nd', '11111111-1111-4111-8111-111111111111', false, 'second_grade_specialization', 'MOE-2026-08-17'),
  ('scientific_science_3rd', 'cdfd5d7a-89c0-4951-8b96-46602b91cb4c', true, null, 'MOE-2026-08-17'),
  ('scientific_science_3rd', '7b529a48-7f35-4521-bd58-1579231ea094', true, null, 'MOE-2026-08-17'),
  ('scientific_math_3rd', 'ff869c6d-1613-4f6e-9258-ab5edebf1896', true, null, 'MOE-2026-08-17'),
  ('scientific_math_3rd', 'd9cad980-5680-406e-ac9e-553c78113dcd', true, null, 'MOE-2026-08-17'),
  ('business_3rd', '22222222-2222-4222-8222-222222222222', true, null, 'MOE-2026-08-17'),
  ('business_3rd', '33333333-3333-4333-8333-333333333333', true, null, 'MOE-2026-08-17'),
  ('arts_3rd', '43a01cfa-6de2-4646-a8ae-39022ef6e87a', true, null, 'MOE-2026-08-17'),
  ('arts_3rd', '93515fea-6f90-4f66-89ab-3a8d665732c2', true, null, 'MOE-2026-08-17');

-- Keep the existing general-secondary literary track separate from baccalaureate mappings.
update public.tracks
set education_system = 'general_secondary'
where id = 'literary_3rd';

update public.subject_tracks
set source_reference = coalesce(source_reference, 'legacy-seed')
where source_reference is null;
