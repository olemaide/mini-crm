/**
 * The seed title for the lead follow-up task.
 *
 * Lives in TypeScript, next to the pipeline stage seeds, for the same reason:
 * this is *stored text* in the organization's language, not UI copy. It is
 * written once when the organization is created and never re-translated — a
 * user switching their own interface to English must not rewrite a German
 * team's task titles.
 *
 * Keep in step with the fallback inside `create_organization`, which covers the
 * case where the application does not supply one.
 */
const LEAD_TASK_TITLES: Record<string, string> = {
  en: "Make first contact",
  de: "Erstkontakt aufnehmen",
};

export function defaultLeadTaskTitle(locale: string): string {
  return LEAD_TASK_TITLES[locale] ?? LEAD_TASK_TITLES.en!;
}
