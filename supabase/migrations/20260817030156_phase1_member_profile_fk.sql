-- Direct foreign key from membership to profile.
--
-- Both columns already reference auth.users(id), but PostgREST infers embedded
-- selects from foreign keys between the two tables being joined — a shared
-- parent is not enough. Without this, `select(...profiles(...))` fails with
-- "could not find the relation", and the members list would need a second
-- round trip plus a manual join in JavaScript.
--
-- The constraint is also true by construction: handle_new_user() creates a
-- profile for every auth.users row before any membership can exist.

alter table public.organization_members
  add constraint organization_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
