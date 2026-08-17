"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { changeMemberRole, removeMember, revokeInvitation } from "@/features/organizations/actions";
import type { ActionResult } from "@/lib/actions";
import type { OrgRole } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Shared toast handling so every member mutation reports failures the same way. */
function useMemberAction() {
  const tError = useTranslations("errors.action");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
        return;
      }
      router.refresh();
    });
  }

  return { run, isPending };
}

export function MemberRowActions({
  organizationId,
  userId,
  role,
  isSelf,
  canManage,
  isOwner,
}: {
  organizationId: string;
  userId: string;
  role: OrgRole;
  isSelf: boolean;
  /** Viewer is an admin or owner. */
  canManage: boolean;
  /** Viewer is an owner — only owners may grant or revoke ownership. */
  isOwner: boolean;
}) {
  const t = useTranslations("members");
  const { run, isPending } = useMemberAction();

  // A plain member can still leave; everything else needs admin rights.
  if (!canManage && !isSelf) return null;

  const assignableRoles: OrgRole[] = isOwner ? ["owner", "admin", "member"] : ["admin", "member"];
  const showRoleSection = canManage && !(role === "owner" && !isOwner);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={t("changeRoleAction")}
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {showRoleSection ? (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("roleLabel")}
            </DropdownMenuLabel>
            {assignableRoles.map((candidate) => (
              <DropdownMenuItem
                key={candidate}
                disabled={candidate === role}
                onClick={() =>
                  run(() => changeMemberRole({ organizationId, userId, role: candidate }))
                }
              >
                {candidate === "owner"
                  ? t("roleOwner")
                  : candidate === "admin"
                    ? t("roleAdmin")
                    : t("roleMember")}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem
          variant="destructive"
          onClick={() => run(() => removeMember({ organizationId, userId }))}
        >
          {isSelf ? t("leaveAction") : t("removeAction")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RevokeInvitationButton({
  organizationId,
  invitationId,
}: {
  organizationId: string;
  invitationId: string;
}) {
  const t = useTranslations("members");
  const { run, isPending } = useMemberAction();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => run(() => revokeInvitation({ organizationId, invitationId }))}
    >
      {t("revokeAction")}
    </Button>
  );
}
