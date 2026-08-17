"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, UserPlusIcon } from "lucide-react";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteMember } from "@/features/organizations/actions";
import { inviteMemberSchema, type InviteMemberInput } from "@/features/organizations/schema";
import type { ActionError } from "@/lib/actions";

export function InviteDialog({ organizationId }: { organizationId: string }) {
  const t = useTranslations("members");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const [issued, setIssued] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { organizationId, email: "", role: "member" },
  });

  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: InviteMemberInput) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The token is returned exactly once — only its hash is stored — so the
      // link is built here and shown until the admin dismisses the dialog.
      setIssued({
        link: `${window.location.origin}/invite/${result.data.token}`,
        email: values.email,
      });
      router.refresh();
    });
  }

  async function onCopy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the input is selectable as a fallback.
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setIssued(null);
      setError(null);
      setCopied(false);
      form.reset({ organizationId, email: "", role: "member" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlusIcon className="size-4" />
            {t("inviteAction")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("linkReady")}</DialogTitle>
              <DialogDescription>{t("linkExplainer", { email: issued.email })}</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={issued.link} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={onCopy} aria-label={tCommon("copy")}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("close")}
            </Button>
          </>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t("inviteTitle")}</DialogTitle>
              <DialogDescription>{t("inviteSubtitle")}</DialogDescription>
            </DialogHeader>

            <ActionErrorMessage error={error} />

            <Field>
              <FieldLabel htmlFor="invite-email">{t("emailLabel")}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                aria-invalid={Boolean(form.formState.errors.email)}
                {...form.register("email")}
              />
              <FieldError>{fieldMessage(form.formState.errors.email?.message)}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="invite-role">{t("roleLabel")}</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        value && field.onChange(value as "admin" | "member")
                      }
                    >
                      <SelectTrigger id="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">{t("roleMember")}</SelectItem>
                        <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {field.value === "admin" ? t("roleAdminHint") : t("roleMemberHint")}
                    </FieldDescription>
                  </>
                )}
              />
            </Field>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? tCommon("loading") : t("createInviteAction")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
