-- Student accounts, curriculum selection, study teams, and invitations.
-- The backend uses Supabase Auth and the service role for these endpoints.

create table if not exists public.student_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  gender text not null check (gender in ('boy', 'girl')),
  grade_level smallint not null check (grade_level in (1, 2, 3)),
  track_id text references public.tracks(id),
  points integer not null default 0 check (points >= 0),
  coins integer not null default 0 check (coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((grade_level = 1 and track_id = 'general_1st') or grade_level in (2, 3))
);

create table if not exists public.study_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 40),
  gender text not null check (gender in ('boy', 'girl')),
  owner_id uuid not null unique references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.study_team_members (
  team_id uuid not null references public.study_teams(id) on delete cascade,
  student_id uuid not null unique references public.student_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, student_id)
);

create table if not exists public.study_team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.study_teams(id) on delete cascade,
  inviter_id uuid not null references public.student_profiles(id) on delete cascade,
  invitee_id uuid not null references public.student_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);

create unique index if not exists one_pending_team_invitation
  on public.study_team_invitations (team_id, invitee_id)
  where status = 'pending';

create index if not exists team_members_team_index on public.study_team_members(team_id);
create index if not exists invitations_invitee_index on public.study_team_invitations(invitee_id, status);

create or replace function public.validate_team_member()
returns trigger
language plpgsql
as $$
declare
  team_gender text;
  member_count integer;
  student_points integer;
  student_coins integer;
begin
  select gender into team_gender from public.study_teams where id = new.team_id;
  if team_gender is null then raise exception 'الفريق غير موجود'; end if;

  select count(*) into member_count from public.study_team_members where team_id = new.team_id;
  if member_count >= 6 then raise exception 'الفريق مكتمل، الحد الأقصى 6 طلاب'; end if;

  select points, coins into student_points, student_coins from public.student_profiles where id = new.student_id;
  if student_points is null then raise exception 'ملف الطالب غير موجود'; end if;
  if student_points < 300 then raise exception 'يجب أن يمتلك الطالب 300 نقطة على الأقل'; end if;
  if student_coins < 20 then raise exception 'يجب أن يمتلك الطالب 20 عملة على الأقل'; end if;

  if exists (select 1 from public.study_team_members where student_id = new.student_id) then
    raise exception 'الطالب موجود بالفعل في فريق';
  end if;

  if exists (select 1 from public.student_profiles where id = new.student_id and gender <> team_gender) then
    raise exception 'لا يمكن الانضمام إلى فريق من جنس مختلف';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_team_member_before_insert on public.study_team_members;
create trigger validate_team_member_before_insert
before insert on public.study_team_members
for each row execute function public.validate_team_member();

create or replace function public.validate_team_owner()
returns trigger
language plpgsql
as $$
declare
  student_points integer;
  student_coins integer;
begin
  select points, coins into student_points, student_coins from public.student_profiles where id = new.owner_id;
  if student_points < 300 then raise exception 'يجب أن يمتلك الطالب 300 نقطة على الأقل لإنشاء فريق'; end if;
  if student_coins < 20 then raise exception 'يجب أن يمتلك الطالب 20 عملة على الأقل لإنشاء فريق'; end if;
  if exists (select 1 from public.study_team_members where student_id = new.owner_id) then
    raise exception 'لا يمكن إنشاء فريق أثناء وجود الطالب في فريق آخر';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_team_owner_before_insert on public.study_teams;
create trigger validate_team_owner_before_insert
before insert on public.study_teams
for each row execute function public.validate_team_owner();

alter table public.student_profiles enable row level security;
alter table public.study_teams enable row level security;
alter table public.study_team_members enable row level security;
alter table public.study_team_invitations enable row level security;
