import type { Metadata } from "next";
import Link from "next/link";
import { UploadIcon, UsersIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ListFilters } from "@/components/list/list-filters";
import { ListPagination } from "@/components/list/list-pagination";
import { ListSearch } from "@/components/list/list-search";
import { PageHeader } from "@/components/page-header";
import { listSavedViews } from "@/features/saved-views/queries";
import { SavedViews } from "@/features/saved-views/saved-views";
import { listCompanyOptions } from "@/features/companies/queries";
import { NewContactDialog } from "@/features/contacts/contact-dialog";
import { ContactsTable } from "@/features/contacts/contacts-table";
import { listContacts } from "@/features/contacts/queries";
import { contactSortColumns } from "@/features/contacts/schema";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { requireSession } from "@/lib/auth/session";
import { hasActiveFilters, parseListParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contacts");
  return { title: t("title") };
}

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const t = await getTranslations("contacts");
  const session = await requireSession();
  const params = parseListParams(await searchParams, contactSortColumns, "created_at");

  const [result, companies, members, savedViews] = await Promise.all([
    listContacts({ organizationId: session.organization.id, ...params }),
    listCompanyOptions(session.organization.id),
    getOrganizationMembers(session.organization.id),
    listSavedViews("contacts"),
  ]);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));
  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.fullName?.trim() || t("unnamed"),
  }));

  const filtered = hasActiveFilters(params);
  const isEmpty = result.items.length === 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button variant="outline" size="sm" render={<Link href="/contacts/import" />}>
              <UploadIcon className="size-4" />
              {t("importAction")}
            </Button>
            <NewContactDialog companies={companyOptions} members={memberOptions} />
          </>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <ListSearch placeholder={t("searchPlaceholder")} />

        <ListFilters
          owners={memberOptions}
          companies={companyOptions}
          currentUserId={session.user.id}
        />

        <SavedViews resource="contacts" views={savedViews} />

        {isEmpty ? (
          <EmptyState
            icon={UsersIcon}
            title={filtered ? t("noMatchesTitle") : t("emptyTitle")}
            body={filtered ? t("noMatchesBody") : t("emptyBody")}
          />
        ) : (
          <>
            <ContactsTable items={result.items} members={memberOptions} />
            <ListPagination
              page={result.page}
              pageSize={result.pageSize}
              pageCount={result.pageCount}
              total={result.total}
            />
          </>
        )}
      </div>
    </>
  );
}
