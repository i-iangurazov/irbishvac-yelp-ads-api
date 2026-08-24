import type { ReactNode } from "react";
import type { RoleCode } from "@prisma/client";

import { AppSidebar } from "@/components/layout/app-sidebar";

export function ConsoleShell({
  roleCode,
  header,
  children,
}: {
  roleCode: RoleCode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <AppSidebar roleCode={roleCode} />
        <main className="min-w-0 flex-1">
          <div className="border-b border-border/60 px-4 py-3 lg:hidden">
            <AppSidebar roleCode={roleCode} mobile />
          </div>
          {header}
          <div className="px-4 pb-10 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
