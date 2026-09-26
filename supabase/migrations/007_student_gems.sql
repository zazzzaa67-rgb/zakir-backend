alter table public.student_profiles
  add column if not exists gems integer not null default 0 check (gems >= 0);

create or replace function public.buy_student_gem(p_student_id uuid)
returns table (coins integer, gems integer)
language sql
security definer
set search_path = public
as $$
  update public.student_profiles
  set coins = student_profiles.coins - 20,
      gems = student_profiles.gems + 1
  where student_profiles.id = p_student_id
    and student_profiles.coins >= 20
  returning student_profiles.coins, student_profiles.gems;
$$;

revoke all on function public.buy_student_gem(uuid) from public, anon, authenticated;
grant execute on function public.buy_student_gem(uuid) to service_role;
