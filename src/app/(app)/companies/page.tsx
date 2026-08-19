import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { ListPagination } from "@/components/list/list-pagination";
import { ListSearch } from "@/components/list/list-search";
import { SortHeader } from "@/components/list/sort-header";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewCompanyDialog } from "@/features/companies/company-dialog";
import { listCompanies } from "@/features/companies/queries";
import { companySortColumns } from "@/features/companies/schema";
import { getOrganizationMembers } from "@/features/organizations/queries";
import { listSavedViews } from "@/features/saved-views/queries";
import { SavedViews } from "@/features/saved-views/saved-views";
import { requireSession } from "@/lib/auth/session";
import { hasActiveFilters, parseListParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("companies");
  return { title: t("title") };
}

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const t = await getTranslations("companies");
  const tContacts = await getTranslations("contacts");
  const format = await getFormatter();
  const session = await requireSession();
  const params = parseListParams(await searchParams, companySortColumns, "created_at");

  const [result, members, savedViews] = await Promise.all([
    listCompanies({ organizationId: session.organization.id, ...params }),
    getOrganizationMembers(session.organization.id),
    listSavedViews("companies"),
  ]);

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.fullName?.trim() || tContacts("unnamed"),
  }));

  const filtered = hasActiveFilters(params);
  const isEmpty = result.items.length === 0;

  return (
    <>
      <PageHeader title={t("title")} actions={<NewCompanyDialog members={memberOptions} />} />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <ListSearch placeholder={t("searchPlaceholder")} />

        <SavedViews resource="companies" views={savedViews} />

        {isEmpty ? (
          <EmptyState
            icon={Building2Icon}
            title={filtered ? t("noMatchesTitle") : t("emptyTitle")}
            body={filtered ? t("noMatchesBody") : t("emptyBody")}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortHeader column="name" label={t("name")} />
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">{t("domain")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("industry")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("location")}</TableHead>
                    <TableHead className="text-right">{t("contactCount")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("owner")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      <SortHeader
                        column="created_at"
                        label={t("created")}
                        defaultDirection="desc"
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {result.items.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {company.name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {company.domain ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {company.industry ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {[company.city, company.country].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {format.number(company.contactCount)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {company.owner?.fullName ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {format.dateTime(new Date(company.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
