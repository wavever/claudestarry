-- Shared Afterlight records. Run this migration in a new Supabase project.
-- Browser clients can only read public.stars; writes go through the Pages
-- Worker, which calls public.create_star_submission with the service role.

create schema if not exists private;

create table if not exists public.stars (
  id text primary key check (id ~ '^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  catalog_number bigint generated always as identity unique not null,
  alias text not null check (char_length(alias) between 1 and 32),
  started date,
  date date not null,
  message text not null check (char_length(message) between 1 and 180),
  created_at timestamptz not null default now(),
  constraint stars_started_before_end check (started is null or started <= date)
);

create index if not exists stars_created_at_id_idx on public.stars (created_at, id);

-- This is intentionally not in the API-visible public schema. It contains no
-- raw address, only a keyed hash used for durable abuse limits and retries.
create table if not exists private.star_submission_fingerprints (
  record_id text primary key references public.stars(id) on delete cascade,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists star_submission_fingerprints_ip_created_idx
  on private.star_submission_fingerprints (ip_hash, created_at desc);

alter table public.stars enable row level security;
alter table private.star_submission_fingerprints enable row level security;

drop policy if exists "public can read shared stars" on public.stars;
create policy "public can read shared stars"
  on public.stars for select
  using (true);

-- Explicit grants keep anon/authenticated read-only even if project defaults
-- change. The service-only RPC below runs as its definer.
revoke all on table public.stars from public, anon, authenticated;
grant select on table public.stars to anon, authenticated;
revoke all on schema private from public, anon, authenticated, service_role;
revoke all on table private.star_submission_fingerprints from public, anon, authenticated, service_role;

create or replace function public.create_star_submission(
  p_id text,
  p_alias text,
  p_started date,
  p_date date,
  p_message text,
  p_ip_hash text
)
returns table (
  id text,
  catalog_number bigint,
  alias text,
  started date,
  date date,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_star public.stars%rowtype;
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', timezone('UTC', now())) at time zone 'UTC';
  v_last timestamptz;
  v_daily_count integer;
  v_catalog_number bigint;
  v_alias text := btrim(coalesce(p_alias, ''));
  v_message text := btrim(coalesce(p_message, ''));
begin
  -- A retried browser POST gets the same record back before consuming another
  -- rate-limit slot. Locking the record ID also makes concurrent retries safe.
  if p_id is null or p_id !~ '^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if p_date is null or p_date > ((v_now at time zone 'UTC') + interval '14 hours')::date or (p_started is not null and p_started > p_date) then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if char_length(v_alias) > 32 or char_length(v_message) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;

  perform pg_advisory_xact_lock(hashtext('afterlight:id:' || p_id));
  select s.* into v_star from public.stars as s where s.id = p_id;
  if found then
    return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
      v_star.date, v_star.message, v_star.created_at;
    return;
  end if;

  -- One lock per fingerprint makes both windows concurrency safe. Hash
  -- collisions only make the limit a little stricter; they cannot bypass it.
  perform pg_advisory_xact_lock(hashtext('afterlight:ip:' || p_ip_hash));
  select s.* into v_star from public.stars as s where s.id = p_id;
  if found then
    return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
      v_star.date, v_star.message, v_star.created_at;
    return;
  end if;

  select f.created_at into v_last
    from private.star_submission_fingerprints as f
    where f.ip_hash = p_ip_hash
    order by f.created_at desc
    limit 1;
  if v_last is not null and v_last > v_now - interval '10 seconds' then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  select count(*) into v_daily_count
    from private.star_submission_fingerprints as f
    where f.ip_hash = p_ip_hash and f.created_at >= v_day_start;
  if v_daily_count >= 20 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  -- Allocate from the identity sequence before insertion, so an INSERT event
  -- already contains the final designation, with no intermediate alias.
  v_catalog_number := nextval(pg_get_serial_sequence('public.stars', 'catalog_number'));
  insert into public.stars (id, catalog_number, alias, started, date, message)
    overriding system value
    values (p_id, v_catalog_number,
      case when v_alias = '' then 'AL ' || lpad(v_catalog_number::text, greatest(6, length(v_catalog_number::text)), '0') else v_alias end,
      p_started, p_date, v_message)
    returning * into v_star;

  insert into private.star_submission_fingerprints (record_id, ip_hash)
    values (v_star.id, p_ip_hash);

  return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
    v_star.date, v_star.message, v_star.created_at;
end;
$$;

revoke all on function public.create_star_submission(text, text, date, date, text, text)
  from public, anon, authenticated;
grant execute on function public.create_star_submission(text, text, date, date, text, text)
  to service_role;

-- Supabase Realtime needs the table in its publication. The catalog check
-- keeps the statement safe to re-run in a fresh/provisioned project.
alter table public.stars replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel as pr
      join pg_publication as p on p.oid = pr.prpubid
      where p.pubname = 'supabase_realtime'
        and pr.prrelid = 'public.stars'::regclass
    ) then
    alter publication supabase_realtime add table public.stars;
  end if;
end;
$$;
