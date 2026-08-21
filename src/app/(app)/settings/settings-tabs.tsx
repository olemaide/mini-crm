"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Link-based tabs rather than a client-side Tabs component: each settings
 * section is its own route, so it is bookmarkable and its data is fetched on
 * the server without a loading flash.
 *
 * Labels are passed in from the server layout so this stays a thin client
 * component and the translation lookup happens once.
 */
const TABS = [
  { href: "/settings", key: "profile" },
  { href: "/settings/organization", key: "organization" },
  { href: "/settings/members", key: "members" },
  { href: "/settings/automation", key: "automation" },
  { href: "/settings/billing", key: "billing" },
  { href: "/settings/privacy", key: "privacy" },
] as const;

export function SettingsTabs({
  labels,
}: {
  labels: Record<
    "profile" | "organization" | "members" | "automation" | "billing" | "privacy",
    string
  >;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        // Exact match for the index tab, prefix match for the others.
        const isActive =
          tab.href === "/settings" ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
