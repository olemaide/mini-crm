"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import type { ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteCompany } from "./actions";
import { CompanyForm } from "./company-form";
import type { CompanyDetail } from "./queries";

export function NewCompanyDialog({ members }: { members: ComboboxOption[] }) {
  const t = useTranslations("companies");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon className="size-4" />
            {t("action")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newSubtitle")}</DialogDescription>
        </DialogHeader>
        <CompanyForm
          key={open ? "open" : "closed"}
          members={members}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CompanyDetailActions({
  company,
  members,
}: {
  company: CompanyDetail;
  members: ComboboxOption[];
}) {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    // Contacts survive: the composite FK is ON DELETE SET NULL (company_id).
    // The confirmation says so, because "delete company" reads like it might
    // take the people with it.
    if (!window.confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteCompany({ id: company.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("deleted"));
      router.push("/companies");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <PencilIcon className="size-4" />
        {tCommon("edit")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" disabled={isPending} aria-label={tCommon("edit")} />
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            {tCommon("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <CompanyForm
            key={company.updatedAt}
            company={company}
            members={members}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
