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
import { deleteDeal } from "./actions";
import { DealForm, type DealContactOption } from "./deal-form";
import type { DealDetail, StageOption } from "./queries";

type SharedProps = {
  pipelineId: string;
  stages: StageOption[];
  contacts: DealContactOption[];
  companies: ComboboxOption[];
  members: ComboboxOption[];
  currency: string;
};

export function NewDealDialog(props: SharedProps) {
  const t = useTranslations("pipeline");
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
        <DealForm key={open ? "open" : "closed"} {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function DealDetailActions({ deal, ...props }: SharedProps & { deal: DealDetail }) {
  const t = useTranslations("pipeline");
  const tCommon = useTranslations("common");
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteDeal({ id: deal.id });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      toast.success(t("deleted"));
      router.push("/pipeline");
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
          <DealForm key={deal.updatedAt} deal={deal} {...props} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
