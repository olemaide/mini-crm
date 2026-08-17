"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";

import { ActionErrorMessage } from "@/components/action-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sendMagicLink, signIn } from "@/features/auth/actions";
import { magicLinkSchema, signInSchema, type SignInInput } from "@/features/auth/schema";
import type { ActionError } from "@/lib/actions";
import { AFTER_LOGIN_PATH } from "@/lib/auth/constants";

export function SignInForm({ nextPath }: { nextPath?: string }) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tField = useTranslations("errors.field");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  /** Zod messages are keys, not prose, so they can be translated here. */
  const fieldMessage = (message: string | undefined) => {
    if (!message) return null;
    const key = message as Parameters<typeof tField>[0];
    return tField.has(key) ? tField(key) : message;
  };

  function onSubmit(values: SignInInput) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // A full navigation, not router.push: the session cookie was just set
      // and every Server Component above needs to re-read it.
      router.replace(nextPath ?? AFTER_LOGIN_PATH);
      router.refresh();
    });
  }

  function onMagicLink() {
    setError(null);
    const email = form.getValues("email");
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      form.setError("email", { message: "email" });
      return;
    }
    startTransition(async () => {
      const result = await sendMagicLink(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMagicLinkSent(true);
    });
  }

  if (magicLinkSent) {
    return (
      <div className="space-y-3 rounded-md border p-4 text-sm">
        <p className="font-medium">{t("checkYourEmail")}</p>
        <p className="text-muted-foreground">{t("magicLinkSent")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <ActionErrorMessage error={error} />

      <Field>
        <FieldLabel htmlFor="email">{t("emailLabel")}</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder={t("emailPlaceholder")}
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register("email")}
        />
        <FieldError>{fieldMessage(form.formState.errors.email?.message)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="password">{t("passwordLabel")}</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register("password")}
        />
        <FieldError>{fieldMessage(form.formState.errors.password?.message)}</FieldError>
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tCommon("loading") : t("signInAction")}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onMagicLink}
        disabled={isPending}
      >
        {t("sendMagicLinkAction")}
      </Button>
    </form>
  );
}
