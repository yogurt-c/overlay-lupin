-- Run in Supabase SQL Editor after download_events and guestbook_operators exist.
begin;

create or replace function public.operator_download_stats(days integer default 7)
returns table (platform text, clicks bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.guestbook_operators o where o.user_id = auth.uid()
  ) then
    raise exception 'Operator access required' using errcode = '42501';
  end if;
  if days is null or days not in (0, 7, 30) then
    raise exception 'Expected 0, 7 or 30 days' using errcode = '22023';
  end if;
  return query
  select e.platform::text, count(*)
  from public.download_events e
  where e.created_at <= now()
    and (days = 0 or e.created_at >= (
      (now() at time zone 'Asia/Seoul')::date - (days - 1)
    )::timestamp at time zone 'Asia/Seoul')
  group by e.platform
  order by count(*) desc, e.platform;
end;
$$;

revoke all on function public.operator_download_stats(integer) from public, anon, authenticated;
grant execute on function public.operator_download_stats(integer) to authenticated;
commit;
