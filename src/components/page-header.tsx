import { LocaleSwitcher } from "@/components/locale-switcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

/**
 * Top bar of the authenticated shell.
 *
 * The org switcher and global search (⌘K) slot in here in Phases 1 and 7.
 */
export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-4" />
      <h1 className="truncate text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
