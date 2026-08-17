import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyDetailActions } from "@/features/companies/company-dialog";
import { getCompany } from "@/features/companies/queries";
import { listContactsForCompany } from "@/features/contacts/queries";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { requireSession } from "@/lib/auth/session";

export async function generateMetadata({
  params,
}: PageProps<"/companies/[id]">): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const company = await getCompany(session.organization.id, id);
  return company ? { title: company.name } : {};
}

export default async function CompanyDetailPage({ params }: PageProps<"/companies/[id]">) {
  const t = await getTranslations("companies");
  const tContacts = await getTranslations("contacts");
  const format = await getFormatter();
  const session = await requireSession();
  const { id } = await params;

  const company = await getCompany(session.organization.id, id);
  if (!company) notFound();

  const [contacts, members] = await Promise.all([
    listContactsForCompany(session.organization.id, company.id),
    getOrganizationMembers(session.organization.id),
  ]);

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.fullName?.trim() || tContacts("unnamed"),
  }));

  const fields: { label: string; value: React.ReactNode }[] = [
    {
      label: t("domain"),
      value: company.domain ? (
        <a
          href={`https://${company.domain}`}
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-4 hover:underline"
        >
          {company.domain}
        </a>
      ) : null,
    },
    {
      label: t("website"),
      value: company.website ? (
        <a
          href={company.website}
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-4 hover:underline"
        >
          {company.website}
        </a>
      ) : null,
    },
    { label: t("industry"), value: company.industry },
    {
      label: t("phone"),
      value: company.phone ? (
        <a href={`tel:${company.phone}`} className="underline-offset-4 hover:underline">
          {company.phone}
        </a>
      ) : null,
    },
    {
      label: t("address"),
      value:
        [
          company.addressLine1,
          [company.postalCode, company.city].filter(Boolean).join(" "),
          company.country,
        ]
          .filter(Boolean)
          .join(", ") || null,
    },
    { label: t("owner"), value: company.owner?.fullName },
  ];

  return (
    <>
      <PageHeader
        title={company.name}
        actions={<CompanyDetailActions company={company} members={memberOptions} />}
      />

      <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.label}>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {field.label}
                    </dt>
                    <dd className="mt-1 text-sm break-words">
                      {field.value ?? <span className="text-muted-foreground">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>

              {company.notes ? (
                <div className="mt-6">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("notes")}
                  </dt>
                  <dd className="mt-1 text-sm whitespace-pre-wrap">{company.notes}</dd>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("peopleTitle")}</CardTitle>
              <CardDescription>{t("peopleCount", { count: contacts.length })}</CardDescription>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noPeople")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {contacts.map((contact) => {
                    const name =
                      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
                      contact.email ||
                      tContacts("unnamed");

                    return (
                      <li key={contact.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {name}
                          </Link>
                          {contact.jobTitle ? (
                            <p className="text-xs text-muted-foreground">{contact.jobTitle}</p>
                          ) : null}
                        </div>
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="hidden text-sm text-muted-foreground hover:underline sm:block"
                          >
                            {contact.email}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("meta")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("created")}</p>
                <p>{format.dateTime(new Date(company.createdAt), { dateStyle: "long" })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("updated")}</p>
                <p>
                  {format.dateTime(new Date(company.updatedAt), {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dealsTitle")}</CardTitle>
              <CardDescription>{t("dealsComingSoon")}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </>
  );
}
