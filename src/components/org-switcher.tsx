"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { toast } from "sonner";

import { switchOrganization } from "@/features/organizations/actions";
import type { Membership, Organization } from "@/lib/auth/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function OrgSwitcher({
  organization,
  memberships,
}: {
  organization: Organization;
  memberships: Membership[];
}) {
  const t = useTranslations("organization");
  const tError = useTranslations("errors.action");
  const [isPending, startTransition] = useTransition();

  const initials = organization.name.slice(0, 2).toUpperCase();

  function onSelect(organizationId: string) {
    if (organizationId === organization.id) return;
    startTransition(async () => {
      const result = await switchOrganization({ organizationId });
      if (!result.ok) {
        const key = result.error.key as Parameters<typeof tError>[0];
        toast.error(tError.has(key) ? tError(key) : tError("unexpected"));
      }
    });
  }

  const trigger = (
    <SidebarMenuButton
      size="lg"
      disabled={isPending}
      aria-label={t("switchAction")}
      className="data-open:bg-sidebar-accent"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
        <span aria-hidden>{initials}</span>
      </div>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold">{organization.name}</span>
      </div>
      <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
    </SidebarMenuButton>
  );

  // A single organization is the common case; a dropdown that only ever shows
  // one entry is noise, so it collapses to a plain header.
  if (memberships.length < 2) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              <span aria-hidden>{initials}</span>
            </div>
            <span className="truncate text-sm font-semibold">{organization.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("switcherLabel")}
            </DropdownMenuLabel>
            {memberships.map((membership) => (
              <DropdownMenuItem
                key={membership.organization.id}
                onClick={() => onSelect(membership.organization.id)}
                className="justify-between gap-4"
              >
                <span className="truncate">{membership.organization.name}</span>
                {membership.organization.id === organization.id ? (
                  <CheckIcon className="size-4 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
