/**
 * Every company that processes customer data on our behalf.
 *
 * This is the whole list, and keeping it that short was a design decision rather
 * than luck. Dropping Sentry, PostHog and Resend from the stack removed three
 * subprocessors to name in an AV-Vertrag and defend in a procurement review — a
 * real advantage of the lean-stack and no-transactional-email choices (build
 * plan §9, GDPR).
 *
 * One source of truth, rendered in two places: the in-app Data & privacy page
 * and the Datenschutzerklärung. A list that exists twice is a list that will
 * eventually disagree with itself, and the version a customer's lawyer reads is
 * the one that matters.
 *
 * `purpose` and `location` are German because they appear verbatim in the
 * Datenschutzerklärung and the AV-Vertrag, which are legally binding in German
 * only. This is stored legal text, not UI copy — the same rule that keeps
 * pipeline stage names out of the message catalogue.
 */

export type Subprocessor = {
  name: string;
  purpose: string;
  location: string;
  /** Where their own DPA / privacy terms live, for the AV-Vertrag annex. */
  url: string;
};

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase",
    purpose: "Datenbank, Authentifizierung und Backups",
    location: "Frankfurt am Main, Deutschland (eu-central-1)",
    url: "https://supabase.com/legal/dpa",
  },
  {
    name: "Netlify",
    purpose: "Hosting und Ausführung der Anwendung",
    location: "EU-Region; Anbieter mit Sitz in den USA, Standardvertragsklauseln",
    url: "https://www.netlify.com/dpa/",
  },
  {
    name: "Polar",
    purpose: "Zahlungsabwicklung und Rechnungsstellung (Merchant of Record)",
    location: "EU; Umsatzsteuer und Rechnungen werden von Polar abgewickelt",
    url: "https://polar.sh/legal/dpa",
  },
];
