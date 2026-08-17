"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";

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
import { ContactForm } from "./contact-form";
import type { ContactDetail } from "./queries";

export function NewContactDialog({
  companies,
  members,
}: {
  companies: ComboboxOption[];
  members: ComboboxOption[];
}) {
  const t = useTranslations("contacts");
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
        {/* Remounting on each open resets the form; without the key, a
            cancelled draft reappears the next time the dialog is used. */}
        <ContactForm
          key={open ? "open" : "closed"}
          companies={companies}
          members={members}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditContactDialog({
  contact,
  companies,
  members,
  open,
  onOpenChange,
}: {
  contact: ContactDetail;
  companies: ComboboxOption[];
  members: ComboboxOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("contacts");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <ContactForm
          key={contact.updatedAt}
          contact={contact}
          companies={companies}
          members={members}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
