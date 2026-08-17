"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import type { ComboboxOption } from "@/components/combobox";
import { SortHeader } from "@/components/list/sort-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignContactOwner, deleteContacts } from "./actions";
import type { ContactListItem } from "./queries";

/**
 * Contacts table.
 *
 * Deliberately hand-rolled rather than built on TanStack Table. Sorting,
 * filtering and pagination all happen in Postgres and arrive through the URL,
 * so the library's client-side row models would be dead weight; what is left —
 * selection state and some markup — is the code below. See the Phase 2 notes in
 * the build plan for the full reasoning.
 */
export function ContactsTable({
  items,
  members,
}: {
  items: ContactListItem[];
  members: ComboboxOption[];
}) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tError = useTranslations("errors.action");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pageIds = useMemo(() => items.map((item) => item.id), [items]);

  // Selection is scoped to the visible page. "Select all" that silently spans
  // pages is how people delete 4,000 contacts by accident.
  const selectedOnPage = pageIds.filter((id) => selected.has(id));
  const allSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelected(() => (checked ? new Set(pageIds) : new Set()));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function runBulk(
    fn: () => Promise<{ ok: boolean; error?: { key: string } }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        const key = (result.error?.key ?? "unexpected") as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(successMessage);
      setSelected(new Set());
      router.refresh();
    });
  }

  const displayName = (contact: ContactListItem) => {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    return name || contact.email || t("unnamed");
  };

  return (
    <div className="space-y-3">
      {selectedOnPage.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {t("selectedCount", { count: selectedOnPage.length })}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" disabled={isPending} />}
              >
                {t("assignOwner")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("owner")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    runBulk(
                      () => assignContactOwner({ ids: selectedOnPage, ownerId: null }),
                      t("ownerAssigned"),
                    )
                  }
                >
                  {t("unassigned")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {members.map((member) => (
                  <DropdownMenuItem
                    key={member.value}
                    onClick={() =>
                      runBulk(
                        () => assignContactOwner({ ids: selectedOnPage, ownerId: member.value }),
                        t("ownerAssigned"),
                      )
                    }
                  >
                    {member.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(t("confirmBulkDelete", { count: selectedOnPage.length })))
                  return;
                runBulk(() => deleteContacts({ ids: selectedOnPage }), t("deleted"));
              }}
            >
              {tCommon("delete")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label={t("selectAll")}
                />
              </TableHead>
              <TableHead>
                <SortHeader column="name" label={t("name")} />
              </TableHead>
              <TableHead>
                <SortHeader column="email" label={t("email")} />
              </TableHead>
              <TableHead className="hidden md:table-cell">{t("company")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("phone")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("owner")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                <SortHeader column="created_at" label={t("created")} defaultDirection="desc" />
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((contact) => {
              const isSelected = selected.has(contact.id);
              return (
                <TableRow key={contact.id} data-state={isSelected ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleOne(contact.id, checked === true)}
                      aria-label={t("selectRow", { name: displayName(contact) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {displayName(contact)}
                    </Link>
                    {contact.jobTitle ? (
                      <p className="text-xs text-muted-foreground">{contact.jobTitle}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="hover:underline">
                        {contact.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.company ? (
                      <Link
                        href={`/companies/${contact.company.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {contact.company.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {contact.phone ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {contact.owner?.fullName ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {format.dateTime(new Date(contact.createdAt), { dateStyle: "medium" })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
