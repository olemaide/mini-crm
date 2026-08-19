/*
 * Superseded — intentionally a no-op.
 *
 * This migration created the first version of public.global_search(), which
 * matched against `search_key(...)` expressions computed on the fly. It was
 * replaced twice within the same phase:
 *
 *   20260819022937_phase7_global_search_dedupe_fix    — GROUP BY -> DISTINCT ON
 *   20260819023216_phase7_global_search_stored_columns — expressions -> columns
 *
 * The version number is kept because it is recorded in the remote migration
 * history, and the file is kept empty of SQL because replaying a function body
 * that the next two migrations overwrite would only add dead code to the tree.
 * `create or replace` means the end state is identical either way.
 *
 * Why it was replaced is worth knowing, and is recorded on those two files:
 * the first version could not run at all (no `min(jsonb)`), and the second was
 * four times over the latency budget at 50,000 contacts.
 */
select 1;
