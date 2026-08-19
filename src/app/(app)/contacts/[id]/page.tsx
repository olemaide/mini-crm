import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/features/activities/activity-feed";
import { getActivityFeed } from "@/features/activities/queries";
import { listCompanyOptions } from "@/features/companies/queries";
import { ContactDetailActions } from "@/features/contacts/contact-detail-actions";
import { getContact } from "@/features/contacts/queries";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { listTasksFor } from "@/features/tasks/queries";
import { TaskWidget } from "@/features/tasks/task-widget";
import { isAtLeastAdmin, requireSession } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const session = await requireSession();
  const { id } = await params;
  const contact = await getContact(session.organization.id, id);
  if (!contact) return {};

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return { title: name || contact.email || undefined };
}

export default async function ContactDetailPage({ params }: PageProps<"/contacts/[id]">) {
  const t = await getTranslations("contacts");
  const tTasks = await getTranslations("tasks");
  const format = await getFormatter();
  const session = await requireSession();
  const { id } = await params;

  const contact = await getContact(session.organization.id, id);
  // Covers both "does not exist" and "belongs to another tenant" — RLS makes
  // them indistinguishable here, which is exactly what we want.
  if (!contact) notFound();

  const [companies, members, feed, tasks] = await Promise.all([
    listCompanyOptions(session.organization.id),
    getOrganizationMembers(session.organization.id),
    getActivityFeed("contact", contact.id),
    listTasksFor(session.organization.id, { contactId: contact.id }),
  ]);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));
  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.fullName?.trim() || t("unnamed"),
  }));

  const displayName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    t("unnamed");

  const fields: { label: string; value: React.ReactNode }[] = [
    {
      label: t("email"),
      value: contact.email ? (
        <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
          {contact.email}
        </a>
      ) : null,
    },
    {
      label: t("phone"),
      value: contact.phone ? (
        <a href={`tel:${contact.phone}`} className="underline-offset-4 hover:underline">
          {contact.phone}
        </a>
      ) : null,
    },
    { label: t("jobTitle"), value: contact.jobTitle },
    {
      label: t("company"),
      value: contact.company ? (
        <Link
          href={`/companies/${contact.company.id}`}
          className="underline-offset-4 hover:underline"
        >
          {contact.company.name}
        </Link>
      ) : null,
    },
    { label: t("owner"), value: contact.owner?.fullName },
    {
      label: t("linkedin"),
      value: contact.linkedinUrl ? (
        <a
          href={contact.linkedinUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-4 hover:underline"
        >
          {contact.linkedinUrl}
        </a>
      ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={displayName}
        actions={
          <ContactDetailActions
            contact={contact}
            companies={companyOptions}
            members={memberOptions}
          />
        }
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

              {contact.notes ? (
                <div className="mt-6">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("notes")}
                  </dt>
                  <dd className="mt-1 text-sm whitespace-pre-wrap">{contact.notes}</dd>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("feedTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                subjectKind="contact"
                subjectId={contact.id}
                initialPage={feed}
                currentUserId={session.user.id}
                canModerate={isAtLeastAdmin(session.role)}
                timeZone={session.organization.timezone}
              />
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
                <p className="text-xs text-muted-foreground">{t("source")}</p>
                <Badge variant="secondary" className="mt-1">
                  {t(`source_${contact.source}`)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("created")}</p>
                <p>{format.dateTime(new Date(contact.createdAt), { dateStyle: "long" })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("updated")}</p>
                <p>
                  {format.dateTime(new Date(contact.updatedAt), {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tTasks("openTasks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskWidget
                tasks={tasks}
                members={memberOptions}
                timeZone={session.organization.timezone}
                link={{ contactId: contact.id }}
              />
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
