-- Per-organization automation switches.
--
-- One row per organization, always present. The lead-task trigger fails closed
-- if it is missing: no settings means no automatic task, which is the safe
-- direction to be wrong in.

create table public.automation_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  lead_task_enabled boolean not null default true,

  /*
   * Stored text, not a translation key (§1.5 rule 3).
   *
   * Seeded once in the organization's language and never re-translated. If a
   * German org's owner switches their own UI to English, their task titles
   * must not silently change — the title is their data, not our copy.
   *
   * Supports {{contact_name}}, {{company_name}} and {{deal_title}}.
   */
  lead_task_title text not null default 'Make first contact'
    check (length(btrim(lead_task_title)) between 1 and 200),

  lead_task_offset_days integer not null default 1
    check (lead_task_offset_days between 0 and 30),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger automation_settings_set_updated_at
  before update on public.automation_settings
  for each row execute function public.set_updated_at();

alter table public.automation_settings enable row level security;

create policy "members can read automation settings"
  on public.automation_settings for select to authenticated
  using (organization_id in (select public.my_organization_ids()));

-- Changing what the whole team's automation does is an admin decision.
create policy "admins can create automation settings"
  on public.automation_settings for insert to authenticated
  with check (organization_id in (select public.my_admin_organization_ids()));
create policy "admins can update automation settings"
  on public.automation_settings for update to authenticated
  using (organization_id in (select public.my_admin_organization_ids()))
  with check (organization_id in (select public.my_admin_organization_ids()));
create policy "admins can delete automation settings"
  on public.automation_settings for delete to authenticated
  using (organization_id in (select public.my_admin_organization_ids()));

-- Organizations that predate this table. The German default matches the
-- catalogue in lib/seed/tasks.ts; keep the two in step if either changes.
insert into public.automation_settings (organization_id, lead_task_title)
select o.id,
       case when o.locale = 'de' then 'Erstkontakt aufnehmen' else 'Make first contact' end
from public.organizations o
on conflict (organization_id) do nothing;

/*
 * create_organization gains the seeded task title.
 *
 * Dropped and recreated rather than `create or replace`, because a new
 * parameter makes it a different signature and Postgres would leave the old
 * four-argument version in place as an overload.
 *
 * The title arrives from the application rather than being chosen by a `case`
 * on locale here, so the seed catalogue stays in TypeScript next to the
 * pipeline stage names (lib/seed/). Adding a third language stays a TypeScript
 * change, not a migration.
 */
drop function public.create_organization(text, text, text, char);

create function public.create_organization(
  p_name text,
  p_locale text default 'en',
  p_timezone text default 'Europe/Berlin',
  p_currency char(3) default 'EUR',
  p_lead_task_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_locale text := coalesce(p_locale, 'en');
  v_timezone text := coalesce(p_timezone, 'Europe/Berlin');
  v_currency char(3) := upper(coalesce(p_currency, 'EUR'));
  v_base text;
  v_slug text;
  v_org uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'Organization name must be between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if v_locale not in ('en', 'de') then
    v_locale := 'en';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception 'Unknown timezone: %', v_timezone using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code' using errcode = '22023';
  end if;

  v_base := left(btrim(coalesce(nullif(public.slugify(v_name), ''), 'org'), '-'), 40);
  if v_base = '' then
    v_base := 'org';
  end if;
  v_slug := v_base;

  -- Retry on collision rather than pre-checking. A pre-check races with a
  -- concurrent signup picking the same company name; catching the unique
  -- violation is the only version that is actually correct.
  for i in 1..10 loop
    begin
      insert into public.organizations (name, slug, locale, timezone, currency)
      values (v_name, v_slug, v_locale, v_timezone, v_currency)
      returning id into v_org;
      exit;
    exception when unique_violation then
      v_slug := v_base || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);
    end;
  end loop;

  if v_org is null then
    raise exception 'Could not allocate a unique organization slug' using errcode = '40001';
  end if;

  -- Same transaction as the insert above: an ownerless organization is never
  -- observable, even briefly.
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_actor, 'owner');

  -- Every organization has automation settings from the moment it exists, so
  -- the lead-task trigger never has to guess.
  insert into public.automation_settings (organization_id, lead_task_title)
  values (
    v_org,
    coalesce(
      nullif(btrim(coalesce(p_lead_task_title, '')), ''),
      case when v_locale = 'de' then 'Erstkontakt aufnehmen' else 'Make first contact' end
    )
  );

  update public.profiles
     set default_organization_id = coalesce(default_organization_id, v_org)
   where id = v_actor;

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, text, char, text) from public, anon;
grant execute on function public.create_organization(text, text, text, char, text) to authenticated;
