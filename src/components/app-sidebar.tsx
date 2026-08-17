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
}: {
  organization: Organization;
  memberships: Membership[];
  role: OrgRole;
  user: { fullName: string | null; email: string; avatarUrl: string | null };
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
        <SidebarGroup>
          <SidebarGroupLabel>{t("sectionMain")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const label = t(item.labelKey);
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{label}</span>
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
