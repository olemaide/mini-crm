"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontalIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import type { ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteContact } from "./actions";
import { EditContactDialog } from "./contact-dialog";
import type { ContactDetail } from "./queries";

export function ContactDetailActions({
  contact,
  companies,
  members,
}: {
  contact: ContactDetail;
  companies: ComboboxOption[];
  members: ComboboxOption[];
}) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteContact({ id: contact.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("deleted"));
      router.push("/contacts");
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

      <EditContactDialog
        contact={contact}
        companies={companies}
        members={members}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}
