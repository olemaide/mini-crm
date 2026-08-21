# Release checklist

Walk this before every production deploy and tick it in the PR.

Automated end-to-end tests are deliberately deferred (build plan §1.4), so this
list **is** the regression net. It takes 20–30 minutes done honestly. When it
starts getting skipped — and it will — that is the signal to spend the three
hours installing Playwright, starting with item 1.

Items are marked with the phase that introduces them. Skip what does not exist yet.

---

## 1. Cross-tenant isolation — never skip · Phase 1

The one failure that ends the business rather than annoying a user.

- [ ] Sign in as user A (org A) in one browser, user B (org B) in another
- [ ] In org B's browser console, query each entity with the anon key and confirm **0 rows**:
      contacts, companies, deals, activities, tasks, import jobs, subscriptions
- [ ] Confirm `pnpm db:audit` passed in CI for this commit

## 2. Signup and onboarding · Phase 1

- [ ] Fresh signup → organization created → onboarding checklist visible
- [ ] Invitation email arrives, in the inviting organization's language
- [ ] Invited user accepts and appears in the member list with the correct role

## 3. CSV import · Phase 3

- [ ] Import the 10-row fixture → contacts appear
- [ ] Duplicate emails handled per the selected policy
- [ ] Invalid rows land in the downloadable error CSV without aborting the run
- [ ] Undo import removes exactly the created rows
- [ ] `/dev/import-fixtures` is all green — covers the CSV pipeline, the money
      parser, and the markdown/URL allow-list that guards note bodies

## 4. Pipeline · Phase 4

- [ ] Create a deal, drag it across stages
- [ ] Column totals and weighted value update correctly
- [ ] Reload shows the same board state
- [ ] Keyboard-only stage change works (Space + arrows)

## 5. Activity feed · Phase 5

- [ ] Add a note → appears in the feed immediately, at the top
- [ ] Stage change appears with the correct from/to stage names
- [ ] A German user and an English user see the same system event in their own language
- [ ] Rename a stage → past feed entries still show the **old** name
- [ ] Scroll a long feed past two pages, then delete an entry near the bottom —
      the reader stays where they were, no jump to the top
- [ ] Filter chips narrow the list; "System" hides notes and calls
- [ ] Backdate an entry and confirm it sorts under the right day header, in the
      **organization's** timezone rather than the browser's
- [ ] Edit a fresh note → no "(edited)" marker; edit one older than 24 h → marker appears
- [ ] Paste `[x](javascript:alert(1))` into a note — it renders as literal text, no link

## 6. Tasks · Phase 6

- [ ] Creating a deal in the first stage auto-creates exactly one follow-up task,
      due 09:00 on the next business day
- [ ] Creating a deal in a later stage creates none
- [ ] Completing it logs a `task_completed` activity on the deal's feed
- [ ] An overdue task renders red with the correct day count and correct plural
      in both `en` and `de`
- [ ] The checkbox removes the row immediately, and **Undo** in the toast puts it back
- [ ] Turning the rule off in Settings → Automation stops task creation
- [ ] The sidebar badge matches the Overdue tab count, and survives a collapse to icons
- [ ] Tabs, assignee and priority filters all survive a reload and the back button

## 6b. Search & filters · Phase 7

- [ ] ⌘K (and Ctrl+K) opens from any page; Escape closes it
- [ ] Typing an accented name **without** the accent finds it — `muller` → `Müller`
- [ ] A contact is findable by email prefix and by its company's name
- [ ] Arrow keys and Enter navigate to the record; recent items appear next time
- [ ] Two filters applied together narrow further than either alone, and the
      combination survives a reload and the back button
- [ ] Save a view, change the filters, restore the view — the URL comes back
- [ ] A colleague cannot see your saved views

## 7. Billing · Phase 8

- [ ] `POLAR_SERVER` matches the environment — `production` for real money
- [ ] The webhook endpoint URL points at this deployment, not the placeholder
- [ ] Polar sandbox checkout unlocks the plan within seconds of returning
- [ ] Replaying the same webhook from the Polar dashboard changes nothing:
      `billing_events` still has one row for that id, `subscriptions` unchanged
- [ ] Trial expiry drops the org to read-only with an upgrade CTA, and the
      banner appears on every page rather than only in Settings
- [ ] A non-admin member sees the plan but cannot start a checkout
- [ ] Exceeding the Starter contact limit is refused by the database — try it
      with a direct PostgREST call, not just through the form
- [ ] The pricing table reads `19,00 €` in German and `€19.00` in English

## 7b. Dashboard · Phase 9

- [ ] The four stat cards match the pipeline board: sum the column totals by hand
      once and confirm the pipeline value agrees
- [ ] Weighted value is lower than pipeline value, and changes when a deal is
      dragged to a stage with a different probability
- [ ] Overdue count matches the Overdue tab, and the sidebar badge
- [ ] "Won value" only counts deals closed in the **current** month, in the
      organization's timezone — test with a deal closed on the 1st at 00:30
- [ ] The onboarding checklist disappears once all five steps are done
- [ ] On a brand-new organization, "Fill with sample data" produces five
      companies, five contacts, five deals, four tasks (one overdue) and two
      notes — and the button is gone afterwards
- [ ] Clicking it a second time (via a stale tab) is refused, not duplicated

## 7c. Security hardening · Phase 9

- [ ] `Content-Security-Policy` is present on an app page and carries a
      `nonce-…`; every `<script>` in view-source has the **same** nonce
- [ ] Browser console is free of CSP violations on: pipeline board (drag a card),
      import wizard (run a file), ⌘K search, every dialog
- [ ] Eleven failed sign-ins for one address are refused with "too many attempts"
      and the twelfth still is; a _different_ address is unaffected
- [ ] A password-reset flood is refused after three requests in an hour
- [ ] `select * from rate_limits` contains **no** email addresses — only hashes
- [ ] `pnpm db:audit` and the `rls-audit` CI job are both green (the job now
      bootstraps a Supabase-shaped schema first; before Phase 9 it never ran)
- [ ] Leaked-password protection is **on** in Supabase Auth
- [ ] Custom SMTP is configured in Supabase Auth — the built-in sender is
      rate-limited and not for production (§1.6, launch blocker)
- [ ] `get_advisors` reports no ERROR-level security or performance lints

## 7d. GDPR / DSGVO · Phase 9

- [ ] Settings → Data & privacy: the JSON export downloads and its `counts`
      match what the UI shows; `memberEmails` is populated
- [ ] Each CSV export opens in Excel with umlauts intact
- [ ] A note beginning `=cmd|' /C calc'!A0` exports as a **text** cell, not a
      formula
- [ ] A member (not admin) sees "only owners and admins can export"
- [ ] Deleting an organization requires retyping its name; a near-miss is refused
- [ ] After scheduling, the red banner appears on **every** page, and Cancel
      restores the workspace with nothing lost
- [ ] An admin cannot set `deletion_scheduled_for` via a direct PostgREST PATCH
- [ ] `select * from organizations where deletion_scheduled_for is not null`
      is empty before going live
- [ ] `purge_due_organizations()` and `prune_rate_limits()` are scheduled —
      pg_cron is not installed by the migrations on purpose (it would break the
      CI audit), so this is a one-time dashboard step:
      `select cron.schedule('purge-deleted-orgs', '0 4 * * *', $$select public.purge_due_organizations()$$);`
- [ ] `/impressum`, `/datenschutz`, `/agb`, `/av-vertrag` all load, and **none**
      of them still shows the red draft warning
- [ ] The legal footer is reachable from the landing page and every auth screen

## 8. Localization · Phase 0

- [ ] Switch `en` ⇄ `de` on the five main screens
- [ ] No missing keys, no clipped or broken labels at 1280px **and** 375px
- [ ] Dates, numbers and currency reformat (`1.234,56 €` vs `€1,234.56`)

## 9. Post-deploy · Phase 0

- [ ] `/api/health` returns 200 with `"database": "ok"`
- [ ] Uptime monitor is green
- [ ] Trigger one deliberate error and confirm the log line carries a request id
