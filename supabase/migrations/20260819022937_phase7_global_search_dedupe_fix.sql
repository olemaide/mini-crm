/*
 * Superseded — intentionally a no-op. See 20260819022305 for why these are
 * empty rather than carrying a function body the next migration overwrites.
 *
 * What this one fixed, and why the fix survives in the final version:
 *
 * The first global_search() de-duplicated its union with
 *   `select kind, id, max(score), min(label), min(sublabel), min(extra)`
 * which failed outright — Postgres has no `min(jsonb)` — and would have been
 * wrong even with one, because it mixes columns from different matching rows.
 * A contact matching both on its own name and on its employer's would get one
 * row's score and another row's label.
 *
 * `distinct on (kind, id) ... order by kind, id, score desc` keeps the single
 * best-scoring row intact, which is what the roll-up actually needs. That is
 * the form carried into 20260819023216.
 */
select 1;
