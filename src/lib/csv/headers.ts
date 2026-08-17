/**
 * Maps spreadsheet column headers onto contact fields.
 *
 * German synonyms are first-class, not an afterthought: the UI is English but
 * the *files* are German, because the customers are. A mapping step that only
 * recognises "First Name" makes every DACH user map ten columns by hand before
 * they can try the product.
 */

export const IMPORT_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "job_title",
  "company_name",
  "company_domain",
  "linkedin_url",
  "notes",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/**
 * Reduces a header to a comparison key: lowercase, accents stripped, all
 * punctuation and spacing removed. `"E-Mail Adresse"`, `"E‑Mail-Adresse"` and
 * `"email address"` all collapse towards the same shape.
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Keys are already normalised by `normalizeHeader`. */
const SYNONYMS: Record<string, ImportField> = {
  // ---- first name
  firstname: "first_name",
  first: "first_name",
  givenname: "first_name",
  vorname: "first_name",
  rufname: "first_name",

  // ---- last name
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  familyname: "last_name",
  nachname: "last_name",
  familienname: "last_name",
  zuname: "last_name",

  // ---- full name
  // A bare "name" is more often a whole name than a surname in real exports,
  // so it maps here and is split on import.
  name: "full_name",
  fullname: "full_name",
  vollstandigername: "full_name",
  vollername: "full_name",
  contact: "full_name",
  contactname: "full_name",
  kontakt: "full_name",
  kontaktname: "full_name",
  ansprechpartner: "full_name",

  // ---- email
  email: "email",
  emailaddress: "email",
  emailadresse: "email",
  mail: "email",
  mailadresse: "email",
  epost: "email",

  // ---- phone
  phone: "phone",
  phonenumber: "phone",
  telephone: "phone",
  tel: "phone",
  telefon: "phone",
  telefonnummer: "phone",
  telefonnr: "phone",
  mobile: "phone",
  mobilephone: "phone",
  mobil: "phone",
  handy: "phone",
  handynummer: "phone",

  // ---- job title
  jobtitle: "job_title",
  title: "job_title",
  position: "job_title",
  role: "job_title",
  jobrole: "job_title",
  funktion: "job_title",
  rolle: "job_title",
  berufsbezeichnung: "job_title",

  // ---- company
  company: "company_name",
  companyname: "company_name",
  organisation: "company_name",
  organization: "company_name",
  account: "company_name",
  firma: "company_name",
  firmenname: "company_name",
  unternehmen: "company_name",

  // ---- company domain
  domain: "company_domain",
  companydomain: "company_domain",
  website: "company_domain",
  webseite: "company_domain",
  web: "company_domain",
  url: "company_domain",
  homepage: "company_domain",
  internet: "company_domain",

  // ---- linkedin
  linkedin: "linkedin_url",
  linkedinurl: "linkedin_url",
  linkedinprofile: "linkedin_url",
  linkedinprofil: "linkedin_url",

  // ---- notes
  notes: "notes",
  note: "notes",
  comment: "notes",
  comments: "notes",
  notiz: "notes",
  notizen: "notes",
  bemerkung: "notes",
  bemerkungen: "notes",
  kommentar: "notes",
  anmerkung: "notes",
  anmerkungen: "notes",
};

/**
 * Suggests a mapping for a file's headers.
 *
 * Only the first header claiming a field wins — a spreadsheet with both
 * "Telefon" and "Mobil" should not silently overwrite one with the other. The
 * user resolves the rest in the mapping step.
 */
export function suggestMapping(headers: string[]): Record<number, ImportField | null> {
  const mapping: Record<number, ImportField | null> = {};
  const claimed = new Set<ImportField>();

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = SYNONYMS[key];

    if (field && !claimed.has(field)) {
      claimed.add(field);
      mapping[index] = field;
    } else {
      mapping[index] = null;
    }
  });

  // If the file has a full name column *and* separate first/last columns, the
  // split ones are more precise — drop the combined one.
  if (claimed.has("full_name") && (claimed.has("first_name") || claimed.has("last_name"))) {
    for (const [index, field] of Object.entries(mapping)) {
      if (field === "full_name") mapping[Number(index)] = null;
    }
  }

  return mapping;
}

/**
 * Splits a combined name into first and last.
 *
 * The last whitespace-separated token becomes the surname, everything before it
 * the given name(s). That is right for "Anna Maria Schmidt" and wrong for
 * "Anna von der Leyen" — an unavoidable ambiguity. The mapping step therefore
 * prefers separate columns whenever the file has them, and this is only the
 * fallback.
 */
export function splitFullName(value: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1] ?? null,
  };
}
