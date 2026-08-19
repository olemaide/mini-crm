/*
 * billing_grace_days() was the one function in the schema without a pinned
 * search_path, flagged by the security advisor.
 *
 * It returns a constant and references nothing, so nothing was exploitable —
 * but "every function pins its search_path" is only a useful rule if it has no
 * exceptions to argue about.
 */
create or replace function public.billing_grace_days()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$ select 7 $$;
