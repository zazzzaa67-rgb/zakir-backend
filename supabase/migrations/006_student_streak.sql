-- Persist streak progress updated by the student exam-result endpoint.
alter table public.student_profiles
  add column if not exists streak integer not null default 0 check (streak >= 0),
  add column if not exists last_active_date timestamptz;
