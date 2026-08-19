"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2Icon,
  CircleGaugeIcon,
  type LucideIcon,
  KanbanIcon,
  SettingsIcon,
  SquareCheckIcon,
  UsersIcon,
} from "lucide-react";

import { OrgSwitcher } from "@/components/org-switcher";
import { SearchPalette } from "@/features/search/search-palette";
import { UserMenu } from "@/components/user-menu";
import type { Membership, Organization, OrgRole } from "@/lib/auth/session";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  /** Key inside the `nav` message namespace. */
  labelKey: "dashboard" | "contacts" | "companies" | "pipeline" | "tasks" | "settings";
  icon: LucideIcon;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: CircleGaugeIcon },
  { href: "/contacts", labelKey: "contacts", icon: UsersIcon },
  { href: "/companies", labelKey: "companies", icon: Building2Icon },
  { href: "/pipeline", labelKey: "pipeline", icon: KanbanIcon },
  { href: "/tasks", labelKey: "tasks", icon: SquareCheckIcon },
  { href: "/settings", labelKey: "settings", icon: SettingsIcon },
];

const ROLE_LABEL_KEY = {
  owner: "roleOwner",
  admin: "roleAdmin",
  member: "roleMember",
} as const satisfies Record<OrgRole, string>;

export function AppSidebar({
  organization,
  memberships,
  role,
  user,
  overdueTaskCount,
}: {
  organization: Organization;
  memberships: Membership[];
  role: OrgRole;
  user: { fullName: string | null; email: string; avatarUrl: string | null };
  /** Tasks assigned to this user, past due. Zero hides the badge entirely. */
  overdueTaskCount: number;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tMembers = useTranslations("members");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher organization={organization} memberships={memberships} />
      </SidebarHeader>

      <SidebarContent>
        {/* Hidden when collapsed to icons; ⌘K still works from anywhere. */}
        <div className="px-2 group-data-[collapsible=icon]:hidden">
          <SearchPalette />
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{t("sectionMain")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const label = t(item.labelKey);
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                const badge = item.labelKey === "tasks" ? overdueTaskCount : 0;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      // The count belongs in the tooltip too, or it disappears
                      // entirely when the sidebar is collapsed to icons.
                      tooltip={badge > 0 ? `${label} (${badge})` : label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{label}</span>
                      {badge > 0 ? (
                        <span className="ml-auto rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-destructive group-data-[collapsible=icon]:hidden">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu
          fullName={user.fullName}
          email={user.email}
          avatarUrl={user.avatarUrl}
          roleLabel={tMembers(ROLE_LABEL_KEY[role])}
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
