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

import {
  Sidebar,
  SidebarContent,
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

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            {/* Wordmark placeholder until the design pass lands a real logo. */}
            <span aria-hidden>MC</span>
          </div>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {tCommon("appName")}
          </span>
        </div>
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

      <SidebarRail />
    </Sidebar>
  );
}
