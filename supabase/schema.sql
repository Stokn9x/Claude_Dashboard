-- Team Chat: Kontor. Each agent (a session, or a subagent in it) reports a
-- small live status; everyone who shares a room with its owner sees it.
-- Only the status is shared: what it does, a file name, figures. Never the
-- conversation.

create table public.agent_status (
  id            text primary key check (char_length(id) between 8 and 120),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id     text check (parent_id is null or char_length(parent_id) <= 120),
  project       text not null default '' check (char_length(project) <= 60),
  state         text not null check (state in ('working', 'reading', 'editing', 'running', 'browsing', 'waiting', 'idle')),
  detail        text not null default '' check (char_length(detail) <= 120),
  model         text not null default '' check (char_length(model) <= 60),
  tokens_out    bigint not null default 0,
  cost_usd      numeric(10, 2),
  lines_added   integer not null default 0,
  lines_removed integer not null default 0,
  five_hour     numeric(5, 1),
  seven_day     numeric(5, 1),
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index agent_status_user_idx on public.agent_status (user_id, updated_at desc);

alter table public.agent_status enable row level security;
revoke all on public.agent_status from anon, authenticated;

-- Writes my agent's status; an id that is someone else's is left alone.
create or replace function public.report_agent(a json)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;

  insert into public.agent_status as s (
    id, user_id, parent_id, project, state, detail, model, tokens_out, cost_usd,
    lines_added, lines_removed, five_hour, seven_day, updated_at
  ) values (
    a ->> 'id', auth.uid(), a ->> 'parent_id', left(coalesce(a ->> 'project', ''), 60), a ->> 'state',
    left(coalesce(a ->> 'detail', ''), 120), left(coalesce(a ->> 'model', ''), 60),
    coalesce((a ->> 'tokens_out')::bigint, 0), (a ->> 'cost_usd')::numeric,
    coalesce((a ->> 'lines_added')::integer, 0), coalesce((a ->> 'lines_removed')::integer, 0),
    (a ->> 'five_hour')::numeric, (a ->> 'seven_day')::numeric, now()
  )
  on conflict (id) do update set
    parent_id = excluded.parent_id, project = excluded.project, state = excluded.state,
    detail = excluded.detail, model = excluded.model, tokens_out = excluded.tokens_out,
    cost_usd = excluded.cost_usd, lines_added = excluded.lines_added, lines_removed = excluded.lines_removed,
    five_hour = excluded.five_hour, seven_day = excluded.seven_day, updated_at = now()
  where s.user_id = auth.uid();

  -- Keep the table small: my agents silent for a day are gone.
  delete from public.agent_status where user_id = auth.uid() and updated_at < now() - interval '1 day';
end;
$$;

create or replace function public.agent_gone(agent_id text)
returns void language sql security definer set search_path = '' as $$
  delete from public.agent_status where user_id = auth.uid() and (id = agent_id or parent_id = agent_id);
$$;

-- The office of one room: its members, each with the agents heard from in
-- the last 10 minutes. Empty unless I am in the room.
create or replace function public.office(target uuid)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object(
      'user_id', m.user_id,
      'name', m.display_name,
      'agents', coalesce((
        select json_agg(json_build_object(
            'id', s.id, 'parent_id', s.parent_id, 'project', s.project, 'state', s.state,
            'detail', s.detail, 'model', s.model, 'tokens_out', s.tokens_out, 'cost_usd', s.cost_usd,
            'lines_added', s.lines_added, 'lines_removed', s.lines_removed,
            'five_hour', s.five_hour, 'seven_day', s.seven_day,
            'started_at', s.started_at, 'updated_at', s.updated_at
          ) order by s.parent_id nulls first, s.started_at)
        from public.agent_status s
        where s.user_id = m.user_id and s.updated_at > now() - interval '10 minutes'
      ), '[]'::json)
    ) order by m.joined_at), '[]'::json)
  from public.room_members m
  where m.room_id = target and public.is_room_member(target);
$$;

revoke all on function public.report_agent(json), public.agent_gone(text), public.office(uuid) from public, anon;
grant execute on function public.report_agent(json), public.agent_gone(text), public.office(uuid) to authenticated;
-- Agent-kontor: its own offices, codes and members, beside Team Chat's rooms
-- in the same project. An agent reports into the office its owner has open,
-- and only that office's members see it.

drop function if exists public.office(uuid);

create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.office_members (
  office_id    uuid not null references public.offices (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  joined_at    timestamptz not null default now(),
  primary key (office_id, user_id)
);
create unique index office_members_name_idx on public.office_members (office_id, lower(btrim(display_name)));
create index office_members_user_idx on public.office_members (user_id);

alter table public.offices        enable row level security;
alter table public.office_members enable row level security;
revoke all on public.offices, public.office_members from anon, authenticated;

alter table public.agent_status add column office_id uuid references public.offices (id) on delete cascade;
create index agent_status_office_idx on public.agent_status (office_id, updated_at desc);

create or replace function public.is_office_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.office_members m where m.office_id = target and m.user_id = auth.uid());
$$;

create or replace function public.create_office(office_name text, my_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  o public.offices;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.offices (name, invite_code, created_by)
    values (btrim(office_name), public.new_invite_code(), auth.uid()) returning * into o;
  insert into public.office_members (office_id, user_id, display_name) values (o.id, auth.uid(), btrim(my_name));
  return json_build_object('id', o.id, 'name', o.name, 'invite_code', o.invite_code);
end;
$$;

create or replace function public.join_office(code text, my_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  o public.offices;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into o from public.offices where invite_code = upper(btrim(code));
  if o.id is null then raise exception 'unknown_code' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.office_members where office_id = o.id and user_id = auth.uid()) then
    begin
      insert into public.office_members (office_id, user_id, display_name) values (o.id, auth.uid(), btrim(my_name));
    exception when unique_violation then
      raise exception 'name_taken' using errcode = '23505';
    end;
  end if;
  return json_build_object('id', o.id, 'name', o.name, 'invite_code', o.invite_code);
end;
$$;

create or replace function public.set_office_name(my_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.office_members set display_name = btrim(my_name) where user_id = auth.uid();
exception when unique_violation then
  raise exception 'name_taken' using errcode = '23505';
end;
$$;

create or replace function public.leave_office(target uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.agent_status where user_id = auth.uid() and office_id = target;
  delete from public.office_members where office_id = target and user_id = auth.uid();
$$;

create or replace function public.my_offices()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'invite_code', o.invite_code,
      'members', (select count(*) from public.office_members x where x.office_id = o.id)) order by o.created_at), '[]'::json)
  from public.office_members me join public.offices o on o.id = me.office_id
  where me.user_id = auth.uid();
$$;

-- An agent reports into an office its owner is a member of; anything else is ignored.
create or replace function public.report_agent(a json)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target uuid := (a ->> 'office_id')::uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if target is null or not public.is_office_member(target) then return; end if;

  insert into public.agent_status as s (
    id, user_id, office_id, parent_id, project, state, detail, model, tokens_out, cost_usd,
    lines_added, lines_removed, five_hour, seven_day, updated_at
  ) values (
    a ->> 'id', auth.uid(), target, a ->> 'parent_id', left(coalesce(a ->> 'project', ''), 60), a ->> 'state',
    left(coalesce(a ->> 'detail', ''), 120), left(coalesce(a ->> 'model', ''), 60),
    coalesce((a ->> 'tokens_out')::bigint, 0), (a ->> 'cost_usd')::numeric,
    coalesce((a ->> 'lines_added')::integer, 0), coalesce((a ->> 'lines_removed')::integer, 0),
    (a ->> 'five_hour')::numeric, (a ->> 'seven_day')::numeric, now()
  )
  on conflict (id) do update set
    office_id = excluded.office_id, parent_id = excluded.parent_id, project = excluded.project,
    state = excluded.state, detail = excluded.detail, model = excluded.model, tokens_out = excluded.tokens_out,
    cost_usd = excluded.cost_usd, lines_added = excluded.lines_added, lines_removed = excluded.lines_removed,
    five_hour = excluded.five_hour, seven_day = excluded.seven_day, updated_at = now()
  where s.user_id = auth.uid();

  delete from public.agent_status where user_id = auth.uid() and updated_at < now() - interval '1 day';
end;
$$;

-- One office: its members, each with the agents heard from in the last 10 minutes.
create or replace function public.office_view(target uuid)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object(
      'user_id', m.user_id,
      'name', m.display_name,
      'agents', coalesce((
        select json_agg(json_build_object(
            'id', s.id, 'parent_id', s.parent_id, 'project', s.project, 'state', s.state,
            'detail', s.detail, 'model', s.model, 'tokens_out', s.tokens_out, 'cost_usd', s.cost_usd,
            'lines_added', s.lines_added, 'lines_removed', s.lines_removed,
            'five_hour', s.five_hour, 'seven_day', s.seven_day,
            'started_at', s.started_at, 'updated_at', s.updated_at
          ) order by s.parent_id nulls first, s.started_at)
        from public.agent_status s
        where s.user_id = m.user_id and s.office_id = target and s.updated_at > now() - interval '10 minutes'
      ), '[]'::json)
    ) order by m.joined_at), '[]'::json)
  from public.office_members m
  where m.office_id = target and public.is_office_member(target);
$$;

revoke all on function public.is_office_member(uuid), public.create_office(text, text), public.join_office(text, text),
  public.set_office_name(text), public.leave_office(uuid), public.my_offices(), public.office_view(uuid) from public, anon;
grant execute on function public.is_office_member(uuid), public.create_office(text, text), public.join_office(text, text),
  public.set_office_name(text), public.leave_office(uuid), public.my_offices(), public.office_view(uuid) to authenticated;
revoke all on function public.report_agent(json) from public, anon;
grant execute on function public.report_agent(json) to authenticated;
