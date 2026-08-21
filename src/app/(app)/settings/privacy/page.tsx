import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { getPendingDeletion } from "@/features/organizations/queries";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";
import { SUBPROCESSORS } from "@/lib/legal/subprocessors";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { DeleteOrganization } from "./delete-organization";
import { ExportButtons } from "./export-buttons";

/**
 * Data & privacy (build plan §9, GDPR).
 *
 * Export, subprocessors and erasure on one page, because that is the set of
 * questions a German B2B buyer asks in the first sales call and the set a
 * customer needs after they have decided to leave. Splitting them across three
 * screens is how "self-serve" quietly becomes "email support".
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabPrivacy") };
}

/**
 * Mirrors `deletion_grace_days()` in SQL.
 *
 * Duplicated deliberately and in one place only: the database is the authority
 * and returns the real date after scheduling, so this constant is used purely to
 * write the sentence *before* the decision is made. Reading it over the wire
 * would be a round trip to render a number that has not changed since Phase 9.
 */
const DELETION_GRACE_DAYS = 30;

export default async function PrivacySettingsPage() {
  const t = await getTranslations("privacy");
  const tLegal = await getTranslations("legal");
  const session = await requireSession();
  const pending = await getPendingDeletion(session.organization.id);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{t("exportTitle")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("exportBody")}</p>
        </div>
        <ExportButtons disabled={!isAtLeastAdmin(session.role)} />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{t("subprocessorsTitle")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subprocessorsBody")}</p>
        </div>

        <dl className="divide-y divide-border/60 rounded-md border">
          {SUBPROCESSORS.map((subprocessor) => (
            <div key={subprocessor.name} className="grid gap-1 p-3 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm font-medium">
                <a
                  href={subprocessor.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  {subprocessor.name}
                </a>
              </dt>
              <dd className="text-sm text-muted-foreground sm:col-span-2">
                {/*
                  German, always: these strings are quoted verbatim in the
                  Datenschutzerklärung and the AV-Vertrag. See lib/legal/subprocessors.ts.
                */}
                {subprocessor.purpose} · {subprocessor.location}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-sm text-muted-foreground">
          {LEGAL_DOCUMENTS.map((document, index) => (
            <span key={document.slug}>
              {index > 0 ? <span aria-hidden> · </span> : null}
              <Link
                href={`/${document.slug}`}
                className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                {tLegal(document.labelKey)}
              </Link>
            </span>
          ))}
        </p>
      </section>

      <section className="space-y-3">
        <DeleteOrganization
          organizationId={session.organization.id}
          organizationName={session.organization.name}
          graceDays={DELETION_GRACE_DAYS}
          canDelete={session.role === "owner"}
          pendingUntil={pending?.scheduledFor ?? null}
        />
      </section>
    </div>
  );
}
