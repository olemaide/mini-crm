import { SUBPROCESSORS } from "./subprocessors";

/**
 * The four legal documents a German SaaS provider needs before the first
 * customer: Impressum (§5 DDG, mandatory), Datenschutzerklärung (Art. 13/14
 * DSGVO), AGB, and the AV-Vertrag / DPA that every B2B buyer asks for in the
 * first sales call.
 *
 * **Why this is data in a `.ts` file rather than keys in the message catalogue.**
 * These texts are binding in German only, whatever language the interface is
 * set to. Putting them in `messages/en.json` would invite a translation that
 * then reads as an equally valid version of a contract — which is exactly the
 * ambiguity the "German is authoritative" clause exists to avoid. Same rule as
 * the pipeline stage seeds: stored text, not UI copy.
 *
 * Keeping them out of `.tsx` also keeps the no-literal-string lint rule honest.
 * It bans hardcoded JSX text because untranslated strings accumulate; these are
 * deliberately monolingual content, and marking them as data says so.
 *
 * ---
 *
 * **These are drafts.** Every `TODO:` below is a fact only the operator knows —
 * legal entity, address, register number, VAT id, managing director — and they
 * are open question #11 in the build plan. The pages render a visible warning
 * while any remains, so an unfinished Impressum cannot quietly go live: in
 * Germany a missing or wrong one is an `Abmahnung` waiting to happen.
 *
 * This is a solid starting draft, not legal advice. Have a Fachanwalt für
 * IT-Recht review it before taking money.
 */

export type LegalBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "definitions"; items: { term: string; description: string }[] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  slug: string;
  /** Key inside the `legal` message namespace, for nav labels and the tab title. */
  labelKey: "imprint" | "privacyPolicy" | "terms" | "dpa";
  /** German title, shown as the document's own heading. */
  title: string;
  /** ISO date. Shown as "Stand: …" so a reader can tell how current it is. */
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

/** Marks a value the operator still has to supply. Drives the draft warning. */
const TODO = (what: string) => `TODO: ${what}`;

const PROVIDER = {
  legalName: TODO("Firmenname inkl. Rechtsform, z. B. Mini CRM UG (haftungsbeschränkt)"),
  street: TODO("Straße und Hausnummer"),
  city: TODO("PLZ und Ort"),
  country: "Deutschland",
  managingDirector: TODO("Name des Geschäftsführers / der Geschäftsführerin"),
  register: TODO("Registergericht und HRB-Nummer"),
  vatId: TODO("Umsatzsteuer-Identifikationsnummer nach §27a UStG"),
  email: TODO("Kontakt-E-Mail-Adresse"),
  phone: TODO("Telefonnummer"),
};

const IMPRESSUM: LegalDocument = {
  slug: "impressum",
  labelKey: "imprint",
  title: "Impressum",
  updatedAt: "2026-08-21",
  intro: "Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG).",
  sections: [
    {
      heading: "Anbieter",
      blocks: [
        {
          kind: "list",
          items: [PROVIDER.legalName, PROVIDER.street, `${PROVIDER.city}, ${PROVIDER.country}`],
        },
      ],
    },
    {
      heading: "Vertreten durch",
      blocks: [{ kind: "list", items: [PROVIDER.managingDirector] }],
    },
    {
      heading: "Kontakt",
      blocks: [
        {
          kind: "definitions",
          items: [
            { term: "E-Mail", description: PROVIDER.email },
            { term: "Telefon", description: PROVIDER.phone },
          ],
        },
      ],
    },
    {
      heading: "Registereintrag",
      blocks: [{ kind: "list", items: [PROVIDER.register] }],
    },
    {
      heading: "Umsatzsteuer-ID",
      blocks: [{ kind: "list", items: [PROVIDER.vatId] }],
    },
    {
      heading: "Verantwortlich für den Inhalt",
      blocks: [
        {
          kind: "paragraph",
          text: `${PROVIDER.managingDirector}, Anschrift wie oben.`,
        },
      ],
    },
    {
      heading: "Streitschlichtung",
      blocks: [
        {
          kind: "paragraph",
          text: "Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Das Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB.",
        },
      ],
    },
  ],
};

const DATENSCHUTZ: LegalDocument = {
  slug: "datenschutz",
  labelKey: "privacyPolicy",
  title: "Datenschutzerklärung",
  updatedAt: "2026-08-21",
  intro:
    "Diese Erklärung beschreibt, welche personenbezogenen Daten wir beim Betrieb von Mini CRM verarbeiten, zu welchem Zweck und auf welcher Rechtsgrundlage.",
  sections: [
    {
      heading: "1. Verantwortlicher",
      blocks: [
        {
          kind: "list",
          items: [
            PROVIDER.legalName,
            PROVIDER.street,
            `${PROVIDER.city}, ${PROVIDER.country}`,
            PROVIDER.email,
          ],
        },
      ],
    },
    {
      heading: "2. Zwei Rollen, die nicht verwechselt werden dürfen",
      blocks: [
        {
          kind: "paragraph",
          text: "Für die Daten, die wir zum Betrieb unseres eigenen Angebots verarbeiten — Ihr Konto, Ihre Rechnungen, Server-Logs — sind wir Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO.",
        },
        {
          kind: "paragraph",
          text: "Für die Inhalte, die Sie in Mini CRM einstellen — Ihre Kontakte, Firmen, Deals, Notizen und Aufgaben — sind wir ausschließlich Auftragsverarbeiter nach Art. 28 DSGVO. Verantwortlicher bleiben Sie. Grundlage dafür ist der Auftragsverarbeitungsvertrag (AV-Vertrag), der Bestandteil des Vertrags ist.",
        },
      ],
    },
    {
      heading: "3. Kontodaten",
      blocks: [
        {
          kind: "paragraph",
          text: "Bei der Registrierung verarbeiten wir Ihre E-Mail-Adresse, Ihren Namen und ein von uns nur als Hash gespeichertes Passwort. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Die Daten werden gelöscht, wenn Sie Ihr Konto oder Ihre Organisation löschen.",
        },
      ],
    },
    {
      heading: "4. Cookies",
      blocks: [
        {
          kind: "paragraph",
          text: "Wir setzen ausschließlich technisch notwendige Cookies: das Sitzungs-Cookie der Authentifizierung, die aktive Organisation und die gewählte Sprache. Es gibt keine Analyse-, Marketing- oder Drittanbieter-Cookies, kein Tracking und keine Einwilligungspflicht nach § 25 Abs. 1 TDDDG — und deshalb auch kein Cookie-Banner.",
        },
      ],
    },
    {
      heading: "5. Server-Logs",
      blocks: [
        {
          kind: "paragraph",
          text: "Bei jedem Zugriff werden technische Daten protokolliert (Zeitpunkt, angeforderte Ressource, Statuscode, eine Request-ID). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist der sichere und nachvollziehbare Betrieb. Personenbezogene Felder wie E-Mail-Adressen und Telefonnummern werden vor dem Schreiben aus den Log-Einträgen entfernt.",
        },
      ],
    },
    {
      heading: "6. Auftragsverarbeiter",
      blocks: [
        {
          kind: "paragraph",
          text: "Wir setzen die folgenden Dienstleister ein. Mit allen bestehen Verträge nach Art. 28 DSGVO. Weitere Auftragsverarbeiter gibt es nicht.",
        },
        {
          kind: "definitions",
          items: SUBPROCESSORS.map((subprocessor) => ({
            term: subprocessor.name,
            description: `${subprocessor.purpose} — ${subprocessor.location}`,
          })),
        },
      ],
    },
    {
      heading: "7. Speicherort",
      blocks: [
        {
          kind: "paragraph",
          text: "Die Datenbank und alle Backups liegen in Frankfurt am Main (eu-central-1). Eine Übermittlung in ein Drittland findet nur im Rahmen des Hostings der Anwendung statt und ist durch Standardvertragsklauseln abgesichert.",
        },
      ],
    },
    {
      heading: "8. Speicherdauer",
      blocks: [
        {
          kind: "paragraph",
          text: "Inhaltsdaten speichern wir für die Dauer des Vertrags. Nach einer Löschanforderung wird die Organisation mit allen Inhalten innerhalb von 30 Tagen endgültig entfernt; die Frist besteht ausschließlich, damit eine versehentliche Löschung noch rückgängig gemacht werden kann. Backups laufen innerhalb desselben Zeitraums aus. Rechnungsdaten bewahren wir nach § 147 AO und § 257 HGB zehn Jahre auf.",
        },
      ],
    },
    {
      heading: "9. Ihre Rechte",
      blocks: [
        {
          kind: "list",
          items: [
            "Auskunft über die zu Ihrer Person gespeicherten Daten (Art. 15 DSGVO)",
            "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
            "Löschung (Art. 17 DSGVO) — in der Anwendung unter Einstellungen → Daten & Datenschutz",
            "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
            "Datenübertragbarkeit (Art. 20 DSGVO) — als vollständiger JSON- oder CSV-Export, jederzeit selbst auslösbar",
            "Widerspruch gegen eine Verarbeitung auf Grundlage berechtigter Interessen (Art. 21 DSGVO)",
            "Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)",
          ],
        },
      ],
    },
    {
      heading: "10. Keine automatisierte Entscheidungsfindung",
      blocks: [
        {
          kind: "paragraph",
          text: "Eine automatisierte Entscheidungsfindung oder ein Profiling nach Art. 22 DSGVO findet nicht statt.",
        },
      ],
    },
  ],
};

const AGB: LegalDocument = {
  slug: "agb",
  labelKey: "terms",
  title: "Allgemeine Geschäftsbedingungen",
  updatedAt: "2026-08-21",
  intro:
    "Diese Bedingungen gelten für die Nutzung von Mini CRM. Das Angebot richtet sich ausschließlich an Unternehmer im Sinne des § 14 BGB; ein Verbrauchervertrag kommt nicht zustande.",
  sections: [
    {
      heading: "1. Vertragsgegenstand",
      blocks: [
        {
          kind: "paragraph",
          text: "Wir stellen Mini CRM als Software-as-a-Service über das Internet bereit. Der Vertrag umfasst die Nutzung der Anwendung im vereinbarten Umfang, nicht die Überlassung der Software selbst.",
        },
      ],
    },
    {
      heading: "2. Vertragsschluss und Testphase",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Vertrag kommt mit der Registrierung zustande. Die Testphase ist kostenlos und endet automatisch; sie muss nicht gekündigt werden. Nach Ablauf bleibt der Arbeitsbereich lesbar, bis ein Tarif gewählt wird — Daten werden nicht gelöscht.",
        },
      ],
    },
    {
      heading: "3. Preise und Zahlung",
      blocks: [
        {
          kind: "paragraph",
          text: "Es gelten die zum Zeitpunkt der Bestellung im Tarifvergleich angegebenen Preise, jeweils pro Nutzer und Abrechnungszeitraum, zuzüglich der gesetzlichen Umsatzsteuer. Die Abwicklung erfolgt über unseren Zahlungsdienstleister Polar als Merchant of Record, der auch die Rechnung stellt.",
        },
      ],
    },
    {
      heading: "4. Laufzeit und Kündigung",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Vertrag verlängert sich um den jeweils gewählten Abrechnungszeitraum und kann bis zum Ende des laufenden Zeitraums gekündigt werden. Bereits bezahlte Zeiträume bleiben nutzbar.",
        },
      ],
    },
    {
      heading: "5. Verfügbarkeit",
      blocks: [
        {
          kind: "paragraph",
          text: TODO(
            "Zugesagte Verfügbarkeit festlegen, z. B. 99,5 % im Monatsmittel, ausgenommen angekündigte Wartungsfenster",
          ),
        },
      ],
    },
    {
      heading: "6. Pflichten des Kunden",
      blocks: [
        {
          kind: "list",
          items: [
            "Zugangsdaten sind geheim zu halten und nicht an Dritte weiterzugeben.",
            "Für die Rechtmäßigkeit der eingestellten personenbezogenen Daten ist der Kunde als Verantwortlicher zuständig — insbesondere für eine Rechtsgrundlage der Verarbeitung seiner Kontaktdaten.",
            "Die Anwendung darf nicht für unerlaubte Werbung oder rechtswidrige Inhalte genutzt werden.",
          ],
        },
      ],
    },
    {
      heading: "7. Datenexport und Löschung",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Kunde kann seine Daten jederzeit selbst vollständig als JSON oder CSV exportieren. Nach Vertragsende bleibt der Export 30 Tage möglich; danach werden die Daten endgültig gelöscht.",
        },
      ],
    },
    {
      heading: "8. Haftung",
      blocks: [
        {
          kind: "paragraph",
          text: "Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden, höchstens auf die im letzten Vertragsjahr gezahlte Vergütung. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.",
        },
      ],
    },
    {
      heading: "9. Änderungen dieser Bedingungen",
      blocks: [
        {
          kind: "paragraph",
          text: "Änderungen teilen wir mindestens sechs Wochen vor Wirksamwerden per E-Mail mit. Widerspricht der Kunde nicht bis zum Wirksamwerden, gelten die Änderungen als angenommen; auf das Widerspruchsrecht weisen wir in der Mitteilung hin.",
        },
      ],
    },
    {
      heading: "10. Schlussbestimmungen",
      blocks: [
        {
          kind: "paragraph",
          text: "Es gilt deutsches Recht. Gerichtsstand ist der Sitz des Anbieters, soweit der Kunde Kaufmann ist. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.",
        },
      ],
    },
  ],
};

const AVV: LegalDocument = {
  slug: "av-vertrag",
  labelKey: "dpa",
  title: "Vertrag über die Verarbeitung personenbezogener Daten im Auftrag",
  updatedAt: "2026-08-21",
  intro:
    "Dieser Vertrag nach Art. 28 DSGVO ist Bestandteil des Hauptvertrags und gilt mit der Nutzung von Mini CRM als geschlossen. Er kann zusätzlich unterschrieben werden; eine unterschriftsreife Fassung stellen wir auf Anfrage bereit.",
  sections: [
    {
      heading: "1. Gegenstand und Rollen",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Kunde ist Verantwortlicher, der Anbieter Auftragsverarbeiter. Gegenstand ist die Verarbeitung der Daten, die der Kunde in Mini CRM einstellt, zum Zweck der Bereitstellung der vertraglich vereinbarten Leistung — und zu keinem anderen.",
        },
      ],
    },
    {
      heading: "2. Art der Daten und Kreis der Betroffenen",
      blocks: [
        {
          kind: "definitions",
          items: [
            {
              term: "Datenarten",
              description:
                "Stammdaten (Name, Firma, Position), Kontaktdaten (E-Mail, Telefon), Vertriebsdaten (Deals, Werte, Phasen), Kommunikationsinhalte (Notizen, protokollierte Anrufe und E-Mails), Aufgabendaten.",
            },
            {
              term: "Betroffene",
              description:
                "Interessenten, Kunden und Ansprechpartner des Kunden sowie die Beschäftigten des Kunden, die die Anwendung nutzen.",
            },
          ],
        },
      ],
    },
    {
      heading: "3. Weisungsbindung",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Anbieter verarbeitet die Daten ausschließlich auf dokumentierte Weisung des Kunden. Hält der Anbieter eine Weisung für rechtswidrig, teilt er dies mit und darf die Ausführung aussetzen.",
        },
      ],
    },
    {
      heading: "4. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)",
      blocks: [
        {
          kind: "list",
          items: [
            "Mandantentrennung auf Datenbankebene durch Row Level Security; jede Tabelle mit Kundendaten führt eine Organisations-ID und ist durch Richtlinien isoliert.",
            "Verschlüsselung im Transit (TLS) und im Ruhezustand (Festplattenverschlüsselung des Datenbankanbieters).",
            "Passwörter werden ausschließlich als Hash gespeichert; neue Passwörter werden gegen bekannte Leaks geprüft.",
            "Rollen- und Rechtekonzept je Organisation (Inhaber, Administrator, Mitglied).",
            "Protokollierung von Zugriffen mit Request-ID, wobei personenbezogene Felder aus den Logs entfernt werden.",
            "Ratenbegrenzung auf Anmeldung, Import, Suche und Webhooks.",
            "Tägliche Backups mit Point-in-Time-Recovery; Wiederherstellung wird regelmäßig geprüft.",
            "Automatisierte Prüfung der Mandantentrennung bei jedem Deployment.",
          ],
        },
      ],
    },
    {
      heading: "5. Unterauftragsverarbeiter",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Kunde genehmigt die folgenden Unterauftragsverarbeiter. Eine Änderung teilen wir mindestens vier Wochen vorher mit; der Kunde kann in dieser Frist widersprechen und den Vertrag außerordentlich kündigen.",
        },
        {
          kind: "definitions",
          items: SUBPROCESSORS.map((subprocessor) => ({
            term: subprocessor.name,
            description: `${subprocessor.purpose} — ${subprocessor.location}`,
          })),
        },
      ],
    },
    {
      heading: "6. Unterstützung des Verantwortlichen",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Anbieter unterstützt den Kunden bei Betroffenenanfragen, bei Datenschutz-Folgenabschätzungen und bei Meldepflichten nach Art. 33 und 34 DSGVO. Auskunft und Übertragbarkeit kann der Kunde jederzeit selbst über den Export in der Anwendung erfüllen.",
        },
      ],
    },
    {
      heading: "7. Meldung von Verletzungen",
      blocks: [
        {
          kind: "paragraph",
          text: "Eine Verletzung des Schutzes personenbezogener Daten melden wir dem Kunden unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnis, mit allen zur Erfüllung seiner Meldepflicht erforderlichen Angaben.",
        },
      ],
    },
    {
      heading: "8. Löschung und Rückgabe",
      blocks: [
        {
          kind: "paragraph",
          text: "Nach Beendigung des Vertrags löschen wir alle Inhaltsdaten innerhalb von 30 Tagen. Der Kunde kann vorher jederzeit einen vollständigen Export erstellen. Eine Aufbewahrung erfolgt nur, soweit gesetzliche Pflichten dies verlangen.",
        },
      ],
    },
    {
      heading: "9. Kontrollrechte",
      blocks: [
        {
          kind: "paragraph",
          text: "Der Kunde kann die Einhaltung dieses Vertrags überprüfen. Wir stellen dazu die vorhandenen Nachweise und Berichte unserer Unterauftragsverarbeiter bereit; Vor-Ort-Prüfungen sind nach Ankündigung und ohne Beeinträchtigung des Betriebs möglich.",
        },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [IMPRESSUM, DATENSCHUTZ, AGB, AVV];

export function legalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}

/**
 * True when the document still contains an unfilled operator detail.
 *
 * Drives the visible draft warning. Checked at render time rather than tracked
 * by hand, so removing the last TODO removes the banner and nothing has to be
 * remembered.
 */
export function hasUnfilledDetails(document: LegalDocument): boolean {
  const texts: string[] = [document.intro];

  for (const section of document.sections) {
    texts.push(section.heading);
    for (const block of section.blocks) {
      if (block.kind === "paragraph") texts.push(block.text);
      if (block.kind === "list") texts.push(...block.items);
      if (block.kind === "definitions") {
        for (const item of block.items) texts.push(item.term, item.description);
      }
    }
  }

  return texts.some((text) => text.includes("TODO:"));
}
