-- Account owners are optional, public attribution. Existing records stay
-- readable with a NULL owner_name, and the existing six-argument RPC remains
-- available while an older Worker is still deployed.
begin;

alter table public.stars add column if not exists owner_name text;
alter table public.stars drop constraint if exists stars_owner_name_check;
alter table public.stars add constraint stars_owner_name_check
  check (owner_name is null or char_length(owner_name) between 1 and 32);

-- This is deliberately a new seven-argument overload, rather than replacing
-- the six-argument function from the earlier migrations. An old Worker can
-- continue to create owner-less records during a rolling deployment; the new
-- Worker calls this overload by its p_owner_name parameter.
create or replace function public.create_star_submission(
  p_id text,
  p_alias text,
  p_started date,
  p_date date,
  p_message text,
  p_owner_name text,
  p_ip_hash text
)
returns table (
  id text,
  catalog_number bigint,
  alias text,
  started date,
  date date,
  message text,
  owner_name text,
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
  v_owner_name text := nullif(btrim(coalesce(p_owner_name, '')), '');
begin
  -- A retried browser POST gets the same record back before consuming another
  -- rate-limit slot. Locking the record ID also makes concurrent retries safe.
  if p_id is null or p_id !~ '^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if p_date is null or p_date < date '2021-01-26' or (p_started is not null and p_started < date '2021-01-26') or p_date > ((v_now at time zone 'UTC') + interval '14 hours')::date or (p_started is not null and p_started > p_date) then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;
  if char_length(v_alias) > 32 or char_length(v_message) > 180 or char_length(v_owner_name) > 32 or v_owner_name ~ E'[\\x01-\\x1F\\x7F]' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;

  perform pg_advisory_xact_lock(hashtext('afterlight:id:' || p_id));
  select s.* into v_star from public.stars as s where s.id = p_id;
  if found then
    return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
      v_star.date, v_star.message, v_star.owner_name, v_star.created_at;
    return;
  end if;

  -- One lock per fingerprint makes both windows concurrency safe. Hash
  -- collisions only make the limit a little stricter; they cannot bypass it.
  perform pg_advisory_xact_lock(hashtext('afterlight:ip:' || p_ip_hash));
  select s.* into v_star from public.stars as s where s.id = p_id;
  if found then
    return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
      v_star.date, v_star.message, v_star.owner_name, v_star.created_at;
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
  insert into public.stars (id, catalog_number, alias, started, date, message, owner_name)
    overriding system value
    values (p_id, v_catalog_number,
      case when v_alias = '' then 'AL ' || lpad(v_catalog_number::text, greatest(6, length(v_catalog_number::text)), '0') else v_alias end,
      p_started, p_date, v_message, v_owner_name)
    returning * into v_star;

  insert into private.star_submission_fingerprints (record_id, ip_hash)
    values (v_star.id, p_ip_hash);

  return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
    v_star.date, v_star.message, v_star.owner_name, v_star.created_at;
end;
$$;

revoke all on function public.create_star_submission(text, text, date, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_star_submission(text, text, date, date, text, text, text)
  to service_role;

commit;
