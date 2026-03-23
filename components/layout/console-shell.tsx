import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";

export function ConsoleShell({
  header,
  children
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="min-w-0 flex-1">
          {header}
          <div className="px-6 pb-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
