import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthShell } from "@/components/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AcceptInvitationForm } from "./accept-invitation-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("subtitle") };
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tAuth = await getTranslations("auth");

  // Readable without a session: the RPC only needs the token, and showing the
  // organization name before sign-in is what makes the link trustworthy.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("preview_invitation", { p_token: token });
  const invitation = Array.isArray(data) ? data[0] : null;

  if (!invitation) {
    return (
      <AuthShell title={t("invalidTitle")} subtitle={t("invalidBody")}>
        <Button render={<Link href="/login" />} variant="outline" className="w-full">
          {tAuth("backToSignIn")}
        </Button>
      </AuthShell>
    );
  }

  const user = await getCurrentUser();
  const nextPath = `/invite/${encodeURIComponent(token)}`;

  if (!user) {
    return (
      <AuthShell
        title={t("title", { organization: invitation.organization_name })}
        subtitle={t("signInFirstBody")}
        footer={
          <p className="text-muted-foreground">
            {tAuth("noAccount")}{" "}
            <Link
              href={`/signup?next=${encodeURIComponent(nextPath)}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {tAuth("signUpAction")}
            </Link>
          </p>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md border bg-muted/50 px-3 py-2.5 text-sm">{invitation.email}</p>
          <Button
            render={<Link href={`/login?next=${encodeURIComponent(nextPath)}`} />}
            className="w-full"
          >
            {tAuth("signInAction")}
          </Button>
        </div>
      </AuthShell>
    );
  }

  // Signed in as somebody else. The RPC would reject this anyway, but saying so
  // up front beats letting them click Accept and get a cryptic refusal.
  const invitedEmail = invitation.email.toLowerCase();
  if ((user.email ?? "").toLowerCase() !== invitedEmail) {
    return (
      <AuthShell title={t("wrongEmailTitle")} subtitle={t("wrongEmailBody")}>
        <div className="space-y-3">
          <p className="rounded-md border bg-muted/50 px-3 py-2.5 text-sm">{invitation.email}</p>
          <SignOutButton variant="outline" className="w-full" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("title", { organization: invitation.organization_name })}
      subtitle={t("subtitle")}
    >
      <AcceptInvitationForm token={token} />
    </AuthShell>
  );
}
