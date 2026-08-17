import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Authenticated application shell.
 *
 * Phase 1 adds the auth guard and org resolution here: this layout becomes the
 * single place that establishes "who is the user and which organization are we
 * in", so no page below it has to ask again.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
