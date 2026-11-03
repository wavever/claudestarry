-- Allow a missing attribution to be filled once, from the original submission
-- network. Public IDs and the browser's own-ID ledger alone are not write proof.
begin;

alter table public.stars add column if not exists updated_at timestamptz not null default now();
create index if not exists stars_updated_at_id_idx on public.stars (updated_at, id);

-- Old records may predate the current date floor. Enforce it when dates are
-- inserted/changed, while allowing an owner-only update to those old records.
create or replace function private.enforce_star_supported_dates()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.date < date '2021-01-26' or (new.started is not null and new.started < date '2021-01-26') then
    raise exception using errcode = '23514', message = 'stars_supported_dates';
  end if;
  return new;
end;
$$;
drop trigger if exists stars_supported_dates on public.stars;
create trigger stars_supported_dates before insert or update of date, started on public.stars
  for each row execute function private.enforce_star_supported_dates();
alter table public.stars drop constraint if exists stars_supported_dates;

create or replace function public.add_star_owner(p_id text, p_owner_name text, p_ip_hash text)
returns table (
  id text, catalog_number bigint, alias text, started date, date date,
  message text, owner_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_star public.stars%rowtype;
  v_owner text := nullif(btrim(coalesce(p_owner_name, '')), '');
begin
  if p_id is null or p_id !~ '^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or v_owner is null or char_length(v_owner) > 32 or v_owner ~ E'[\\x01-\\x1F\\x7F]' then
    raise exception using errcode = '22023', message = 'invalid_submission';
  end if;

  perform pg_advisory_xact_lock(hashtext('afterlight:id:' || p_id));
  select s.* into v_star from public.stars s where s.id = p_id for update;
  if not found or not exists (
    select 1 from private.star_submission_fingerprints f
    where f.record_id = p_id and f.ip_hash = p_ip_hash
  ) then
    raise exception using errcode = '42501', message = 'owner_forbidden';
  end if;
  if v_star.owner_name is not null and v_star.owner_name <> v_owner then
    raise exception using errcode = '23505', message = 'owner_already_set';
  end if;
  -- Same-name retries are safe if a response was lost. A saved name can never
  -- be overwritten by this endpoint, including from the same network.
  if v_star.owner_name is null then
    update public.stars s set owner_name = v_owner, updated_at = now()
      where s.id = p_id returning s.* into v_star;
  end if;
  return query select v_star.id, v_star.catalog_number, v_star.alias, v_star.started,
    v_star.date, v_star.message, v_star.owner_name, v_star.created_at, v_star.updated_at;
end;
$$;

revoke all on function public.add_star_owner(text, text, text) from public, anon, authenticated;
grant execute on function public.add_star_owner(text, text, text) to service_role;
revoke all on function private.enforce_star_supported_dates() from public, anon, authenticated;
commit;
