import { getNow } from "next-intl/server";

import { AppSidebar } from "@/components/app-sidebar";
import { BillingBanner } from "@/features/billing/billing-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getTaskCounts } from "@/features/tasks/queries";
import { requireSession } from "@/lib/auth/session";

/**
 * Authenticated application shell.
 *
 * This is the single place that establishes "who is the user and which
 * organization are we in", so no page below it has to ask again.
 *
 * It is a convenience boundary, not the security boundary. Row Level Security
 * is what actually keeps tenants apart — if this check were removed, pages
 * would render empty rather than leak another organization's data.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const now = await getNow();

  /*
   * The overdue badge is queried per request, not cached.
   *
   * The build plan called for a 60-second cache, but the number is specific to
   * one user in one tenant, and a cache keyed on neither is precisely the shape
   * that leaks one organization's data into another's page. It is a single
   * `count` over a partial index — cheaper than the cache lookup would be, and
   * it is never wrong by up to a minute.
   */
  const counts = await getTaskCounts(
    session.organization.id,
    session.organization.timezone,
    now,
    session.user.id,
  );

  return (
    <SidebarProvider>
      <AppSidebar
        organization={session.organization}
        memberships={session.memberships}
        role={session.role}
        user={{
          fullName: session.profile?.fullName ?? null,
          email: session.user.email ?? "",
          avatarUrl: session.profile?.avatarUrl ?? null,
        }}
        overdueTaskCount={counts.overdue}
      />
      <SidebarInset>
        <BillingBanner organizationId={session.organization.id} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
