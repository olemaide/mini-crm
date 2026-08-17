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
- [ ] `/dev/import-fixtures` is all green

## 4. Pipeline · Phase 4

- [ ] Create a deal, drag it across stages
- [ ] Column totals and weighted value update correctly
- [ ] Reload shows the same board state
- [ ] Keyboard-only stage change works (Space + arrows)

## 5. Activity feed · Phase 5

- [ ] Add a note → appears in the feed
- [ ] Stage change appears with the correct from/to stage names
- [ ] A German user and an English user see the same system event in their own language

## 6. Tasks · Phase 6

- [ ] Creating a deal auto-creates exactly one follow-up task
- [ ] Completing it logs a `task_completed` activity
- [ ] An overdue task renders red with the correct day count and correct plural

## 7. Billing · Phase 8

- [ ] Polar sandbox checkout unlocks the plan
- [ ] Replaying the same webhook from the Polar dashboard changes nothing
- [ ] Trial expiry drops the org to read-only with an upgrade CTA

## 8. Localization · Phase 0

- [ ] Switch `en` ⇄ `de` on the five main screens
- [ ] No missing keys, no clipped or broken labels at 1280px **and** 375px
- [ ] Dates, numbers and currency reformat (`1.234,56 €` vs `€1,234.56`)

## 9. Post-deploy · Phase 0

- [ ] `/api/health` returns 200 with `"database": "ok"`
- [ ] Uptime monitor is green
- [ ] Trigger one deliberate error and confirm the log line carries a request id
