import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getOrganizationMembers, getPendingInvitations } from "@/features/organizations/queries";
import { isAtLeastAdmin, requireSession, type OrgRole } from "@/lib/auth/session";
import { InviteDialog } from "./invite-dialog";
import { MemberRowActions, RevokeInvitationButton } from "./member-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("tabMembers") };
}

const ROLE_LABEL_KEY = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
} as const satisfies Record<OrgRole, string>;

export default async function MembersSettingsPage() {
  const t = await getTranslations("members");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();
  const session = await requireSession();

  const canManage = isAtLeastAdmin(session.role);
  const isOwner = session.role === "owner";

  // Invitations are admin-only by RLS, so a plain member simply gets [].
  const [members, invitations] = await Promise.all([
    getOrganizationMembers(session.organization.id),
    canManage ? getPendingInvitations(session.organization.id) : Promise.resolve([]),
  ]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage ? <InviteDialog organizationId={session.organization.id} /> : null}
      </div>

      {!canManage ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          {t("memberOnlyView")}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border">
        {members.map((member) => {
          const isSelf = member.userId === session.user.id;
          const name = member.fullName?.trim() || t("unnamed");
          const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");

          return (
            <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-8">
                {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {isSelf ? (
                    <span className="text-xs text-muted-foreground">({tCommon("you")})</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("joinedOn", {
                    date: format.dateTime(new Date(member.joinedAt), { dateStyle: "medium" }),
                  })}
                </p>
              </div>

              <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                {t(ROLE_LABEL_KEY[member.role])}
              </Badge>

              <MemberRowActions
                organizationId={session.organization.id}
                userId={member.userId}
                role={member.role}
                isSelf={isSelf}
                canManage={canManage}
                isOwner={isOwner}
              />
            </li>
          );
        })}
      </ul>

      {canManage ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t("pendingTitle")}</h3>

          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.isExpired
                        ? t("expired")
                        : t("expiresOn", {
                            date: format.dateTime(new Date(invitation.expiresAt), {
                              dateStyle: "medium",
                            }),
                          })}
                    </p>
                  </div>

                  <Badge variant="outline">{t(ROLE_LABEL_KEY[invitation.role])}</Badge>

                  <RevokeInvitationButton
                    organizationId={session.organization.id}
                    invitationId={invitation.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
