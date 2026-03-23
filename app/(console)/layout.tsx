import { ConsoleShell } from "@/components/layout/console-shell";
import { LogoutButton } from "@/components/layout/logout-button";
import { requireUser } from "@/lib/auth/service";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <ConsoleShell
      header={
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <div className="text-sm text-muted-foreground">{user.tenant.name}</div>
            <div className="font-medium">
              {user.name} · {user.role.code}
            </div>
          </div>
          <LogoutButton />
        </div>
      }
    >
      {children}
    </ConsoleShell>
  );
}
