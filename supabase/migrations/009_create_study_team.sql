-- Create a team, add its owner, and charge the 20 coin fee atomically.
create or replace function public.create_study_team(p_student_id uuid, p_name text)
returns table (id uuid, name text, gender text, owner_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.student_profiles%rowtype;
  new_team public.study_teams%rowtype;
begin
  select * into profile
  from public.student_profiles
  where student_profiles.id = p_student_id
  for update;

  if not found then raise exception 'Student profile not found'; end if;
  if profile.points < 300 then raise exception 'At least 300 points are required'; end if;
  if profile.coins < 20 then raise exception 'At least 20 coins are required'; end if;
  if exists (select 1 from public.study_team_members where student_id = p_student_id) then
    raise exception 'Student already belongs to a team';
  end if;

  insert into public.study_teams (name, gender, owner_id)
  values (trim(p_name), profile.gender, p_student_id)
  returning * into new_team;

  insert into public.study_team_members (team_id, student_id)
  values (new_team.id, p_student_id);

  update public.student_profiles
  set coins = coins - 20
  where student_profiles.id = p_student_id;

  return query select new_team.id, new_team.name, new_team.gender, new_team.owner_id, new_team.created_at;
end;
$$;

revoke all on function public.create_study_team(uuid, text) from public, anon, authenticated;
grant execute on function public.create_study_team(uuid, text) to service_role;
