-- Every auth.users row gets a public.profiles row, automatically.
--
-- Done as a trigger rather than in application code on purpose: signup can
-- happen through email/password, magic link, OAuth or an admin API call, and a
-- profile row missing for any one of those paths produces a broken account that
-- is painful to diagnose. A trigger cannot be forgotten.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text;
  v_name text;
begin
  -- Only accept a locale we actually support; anything else falls back.
  v_locale := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
  if v_locale not in ('en', 'de') then
    v_locale := 'en';
  end if;

  -- OAuth providers use 'name'; our own signup form sends 'full_name'.
  v_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.profiles (id, full_name, locale)
  values (new.id, left(v_name, 120), v_locale)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Creates the public.profiles row for a new auth.users record.';
