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
