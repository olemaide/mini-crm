import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
