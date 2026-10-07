-- Run this entire file once in the existing project's SQL Editor.
-- Only new analytics objects are created; guestbook/download tables are untouched.
begin;

create table public.game_play_events (
  event_id uuid primary key,
  installation_id uuid not null,
  game_id text not null check (game_id ~ '^[a-z][a-z0-9_-]{0,39}$'),
  mode text not null check (mode in ('solo', 'duel', 'room')),
  app_version text not null check (length(app_version) between 1 and 64),
  platform text not null check (platform in ('darwin', 'win32', 'linux')),
  played_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index game_play_events_played_at_idx on public.game_play_events (played_at);
create index game_play_events_installation_received_idx on public.game_play_events (installation_id, received_at);
alter table public.game_play_events enable row level security;
revoke all on public.game_play_events from public, anon, authenticated;
grant select, insert on public.game_play_events to service_role;

-- Only the Edge Function's server credential can execute this function.
-- Event IDs make retries idempotent; existing records can never be overwritten.
create function public.ingest_game_plays(events jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  installation uuid;
  recent_count integer;
  inserted_count integer;
begin
  if jsonb_typeof(events) is distinct from 'array' then
    raise exception 'Expected event array';
  end if;
  if jsonb_array_length(events) not between 1 and 50 then
    raise exception 'Expected 1 to 50 events';
  end if;
  installation := (events->0->>'installation_id')::uuid;
  if installation is null or exists (
    select 1 from jsonb_array_elements(events) e
    where (e->>'installation_id')::uuid is distinct from installation
  ) then
    raise exception 'Expected one installation';
  end if;

  -- Serialize only this installation's requests. This is a basic abuse bound,
  -- not proof of user identity: a public client can generate another installation ID.
  perform pg_advisory_xact_lock(hashtextextended(installation::text, 0));
  select count(*) into recent_count from public.game_play_events
    where installation_id = installation and received_at > now() - interval '1 minute';
  if recent_count + jsonb_array_length(events) > 120 then
    raise sqlstate 'P0001' using message = 'rate_limit';
  end if;

  insert into public.game_play_events
    (event_id, installation_id, game_id, mode, app_version, platform, played_at)
  select event_id, installation_id, game_id, mode, app_version, platform, played_at
    from jsonb_to_recordset(events) as e(
      event_id uuid, installation_id uuid, game_id text, mode text,
      app_version text, platform text, played_at timestamptz
    )
    where played_at between now() - interval '7 days' and now() + interval '5 minutes'
  on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.ingest_game_plays(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_game_plays(jsonb) to service_role;

commit;
