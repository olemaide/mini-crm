import type { Locale } from "@/i18n/config";

/**
 * "Fill with sample data" — the demo dataset (build plan §9, Launch readiness).
 *
 * A CRM on day one is a set of empty tables, and an empty Kanban board teaches
 * nobody anything. This gives a new tenant something to drag, filter and sort
 * within one click of signing up.
 *
 * In TypeScript rather than SQL, for the same reason as the pipeline stage seeds:
 * every string here becomes **stored text** in the organization's language and is
 * then owned by the user. It is never re-translated, and adding a third language
 * is a code change rather than a migration.
 *
 * The data itself is deliberately obvious fiction — Musterfirma, Beispiel AG,
 * example.com domains. Plausible-but-fake company names get mistaken for real
 * records and end up in a real sales email; nobody mistakes "Musterfirma GmbH"
 * for a lead. The email addresses are all on `example.com`, which RFC 2606
 * reserves precisely so that nothing can be delivered to them.
 */

export type DemoCompany = {
  key: string;
  name: string;
  domain: string;
  industry: string;
  city: string;
  country: string;
};

export type DemoContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyKey: string;
};

export type DemoDeal = {
  title: string;
  valueCents: number;
  companyKey: string;
  contactEmail: string;
  /** Index into the seeded stage list, so this survives renamed stages. */
  stageIndex: number;
  /** Days from today; negative is in the past. */
  expectedCloseInDays: number;
};

export type DemoTask = {
  title: string;
  /** Days from now. Negative produces one deliberately overdue task. */
  dueInDays: number;
  priority: "low" | "normal" | "high";
  contactEmail?: string;
  companyKey?: string;
};

export type DemoNote = {
  contactEmail?: string;
  companyKey?: string;
  body: string;
};

export type DemoDataset = {
  companies: DemoCompany[];
  contacts: DemoContact[];
  deals: DemoDeal[];
  tasks: DemoTask[];
  notes: DemoNote[];
};

const EN: DemoDataset = {
  companies: [
    {
      key: "muster",
      name: "Musterfirma GmbH",
      domain: "musterfirma.example.com",
      industry: "Manufacturing",
      city: "Stuttgart",
      country: "DE",
    },
    {
      key: "beispiel",
      name: "Beispiel AG",
      domain: "beispiel.example.com",
      industry: "Logistics",
      city: "Hamburg",
      country: "DE",
    },
    {
      key: "example",
      name: "Example Software BV",
      domain: "example.com",
      industry: "Software",
      city: "Amsterdam",
      country: "NL",
    },
  ],
  contacts: [
    {
      firstName: "Anna",
      lastName: "Beispiel",
      email: "anna.beispiel@musterfirma.example.com",
      phone: "+49 711 1234567",
      jobTitle: "Head of Purchasing",
      companyKey: "muster",
    },
    {
      firstName: "Bernd",
      lastName: "Muster",
      email: "bernd.muster@musterfirma.example.com",
      phone: "+49 711 1234568",
      jobTitle: "Managing Director",
      companyKey: "muster",
    },
    {
      firstName: "Clara",
      lastName: "Probst",
      email: "clara.probst@beispiel.example.com",
      phone: "+49 40 9876543",
      jobTitle: "Operations Lead",
      companyKey: "beispiel",
    },
    {
      firstName: "Dirk",
      lastName: "Vorlage",
      email: "dirk.vorlage@beispiel.example.com",
      phone: "+49 40 9876544",
      jobTitle: "CFO",
      companyKey: "beispiel",
    },
    {
      firstName: "Eva",
      lastName: "Sample",
      email: "eva.sample@example.com",
      phone: "+31 20 1112233",
      jobTitle: "CTO",
      companyKey: "example",
    },
  ],
  deals: [
    {
      title: "Musterfirma — annual licence",
      valueCents: 1_200_000,
      companyKey: "muster",
      contactEmail: "anna.beispiel@musterfirma.example.com",
      // Stage 0 is the first stage, which is what the Phase 6 automation
      // watches — so seeding here also demonstrates the auto-created follow-up.
      stageIndex: 0,
      expectedCloseInDays: 30,
    },
    {
      title: "Musterfirma — onboarding workshop",
      valueCents: 350_000,
      companyKey: "muster",
      contactEmail: "bernd.muster@musterfirma.example.com",
      stageIndex: 1,
      expectedCloseInDays: 21,
    },
    {
      title: "Beispiel AG — 25 seats",
      valueCents: 2_850_000,
      companyKey: "beispiel",
      contactEmail: "clara.probst@beispiel.example.com",
      stageIndex: 2,
      expectedCloseInDays: 14,
    },
    {
      title: "Beispiel AG — data migration",
      valueCents: 780_000,
      companyKey: "beispiel",
      contactEmail: "dirk.vorlage@beispiel.example.com",
      stageIndex: 3,
      expectedCloseInDays: 7,
    },
    {
      title: "Example Software — pilot project",
      valueCents: 450_000,
      companyKey: "example",
      contactEmail: "eva.sample@example.com",
      stageIndex: 3,
      expectedCloseInDays: 10,
    },
  ],
  tasks: [
    // One overdue on purpose: the red badge and the sidebar counter are hard to
    // believe in until you have seen them fire.
    {
      title: "Call Anna back about the licence terms",
      dueInDays: -2,
      priority: "high",
      contactEmail: "anna.beispiel@musterfirma.example.com",
    },
    {
      title: "Send the proposal to Beispiel AG",
      dueInDays: 0,
      priority: "high",
      companyKey: "beispiel",
    },
    {
      title: "Prepare the migration estimate",
      dueInDays: 3,
      priority: "normal",
      contactEmail: "dirk.vorlage@beispiel.example.com",
    },
    {
      title: "Check in after the pilot kick-off",
      dueInDays: 9,
      priority: "low",
      contactEmail: "eva.sample@example.com",
    },
  ],
  notes: [
    {
      contactEmail: "anna.beispiel@musterfirma.example.com",
      body: "Met at the trade fair. Budget is approved for **Q4**, decision sits with her and the MD.\n\n- 40 seats to start\n- wants a German invoice\n- see https://musterfirma.example.com",
    },
    {
      companyKey: "beispiel",
      body: "Currently on a competitor, contract runs to the end of the year. The `data migration` is the real blocker — not price.",
    },
  ],
};

const DE: DemoDataset = {
  companies: EN.companies.map((company) => ({
    ...company,
    industry:
      company.industry === "Manufacturing"
        ? "Maschinenbau"
        : company.industry === "Logistics"
          ? "Logistik"
          : "Software",
  })),
  contacts: EN.contacts.map((contact) => ({
    ...contact,
    jobTitle:
      contact.jobTitle === "Head of Purchasing"
        ? "Leiterin Einkauf"
        : contact.jobTitle === "Managing Director"
          ? "Geschäftsführer"
          : contact.jobTitle === "Operations Lead"
            ? "Leiterin Betrieb"
            : contact.jobTitle,
  })),
  deals: [
    { ...EN.deals[0]!, title: "Musterfirma — Jahreslizenz" },
    { ...EN.deals[1]!, title: "Musterfirma — Onboarding-Workshop" },
    { ...EN.deals[2]!, title: "Beispiel AG — 25 Lizenzen" },
    { ...EN.deals[3]!, title: "Beispiel AG — Datenmigration" },
    { ...EN.deals[4]!, title: "Example Software — Pilotprojekt" },
  ],
  tasks: [
    { ...EN.tasks[0]!, title: "Anna zu den Lizenzbedingungen zurückrufen" },
    { ...EN.tasks[1]!, title: "Angebot an Beispiel AG senden" },
    { ...EN.tasks[2]!, title: "Aufwandsschätzung für die Migration erstellen" },
    { ...EN.tasks[3]!, title: "Nach dem Pilot-Kick-off nachfassen" },
  ],
  notes: [
    {
      ...EN.notes[0]!,
      body: "Auf der Messe kennengelernt. Budget für **Q4** ist freigegeben, Entscheidung liegt bei ihr und der Geschäftsführung.\n\n- Start mit 40 Lizenzen\n- möchte eine deutsche Rechnung\n- siehe https://musterfirma.example.com",
    },
    {
      ...EN.notes[1]!,
      body: "Aktuell beim Wettbewerber, Vertrag läuft bis Jahresende. Der eigentliche Blocker ist die `Datenmigration` — nicht der Preis.",
    },
  ],
};

const DATASETS: Record<Locale, DemoDataset> = { en: EN, de: DE };

export function demoDataset(locale: string): DemoDataset {
  return DATASETS[locale === "de" ? "de" : "en"];
}
