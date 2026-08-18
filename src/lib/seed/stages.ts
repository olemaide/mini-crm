import type { Locale } from "@/i18n/config";

export type SeedStage = {
  name: string;
  probability: number;
  is_won?: boolean;
  is_lost?: boolean;
};

/**
 * Default pipeline stages, per locale.
 *
 * Deliberately here and not in a SQL migration. Stage names are **stored text**
 * in the organization's language (build plan §1.5 rule 3): seeded once, then
 * owned by the user. Renaming "Angebot" to "Angebot verschickt" is a user
 * action, and a later locale switch must never overwrite it.
 *
 * Keeping the catalogue in TypeScript also means adding a third language is a
 * code change rather than a migration.
 *
 * The probabilities drive the weighted pipeline value — the number that
 * actually predicts revenue, as opposed to the raw sum.
 */
const STAGE_SEEDS: Record<Locale, { pipelineName: string; stages: SeedStage[] }> = {
  en: {
    pipelineName: "Sales",
    stages: [
      { name: "Lead", probability: 10 },
      { name: "Contacted", probability: 25 },
      { name: "Qualified", probability: 50 },
      { name: "Proposal", probability: 75 },
      { name: "Won", probability: 100, is_won: true },
      { name: "Lost", probability: 0, is_lost: true },
    ],
  },
  de: {
    pipelineName: "Vertrieb",
    stages: [
      // "Lead" and "Pipeline" stay English — they are the standard terms in
      // German sales usage, and translating them reads as stilted.
      { name: "Lead", probability: 10 },
      { name: "Kontaktiert", probability: 25 },
      { name: "Qualifiziert", probability: 50 },
      { name: "Angebot", probability: 75 },
      { name: "Gewonnen", probability: 100, is_won: true },
      { name: "Verloren", probability: 0, is_lost: true },
    ],
  },
};

export function defaultPipelineSeed(locale: string) {
  return STAGE_SEEDS[locale === "de" ? "de" : "en"];
}
