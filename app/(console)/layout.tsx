import { ConsoleShell } from "@/components/layout/console-shell";
import { LogoutButton } from "@/components/layout/logout-button";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { requireUser } from "@/lib/auth/service";
import { listAccessibleTenants } from "@/lib/db/tenant-access-repository";
import { hasPermission } from "@/lib/permissions";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const canSwitchTenant = hasPermission(user.role.code, "tenants:switch");
  const tenants = canSwitchTenant
    ? await listAccessibleTenants({
        userId: user.id,
        primaryTenantId: user.primaryTenantId,
        roleCode: user.role.code,
      })
    : [];

  return (
    <ConsoleShell
      roleCode={user.role.code}
      header={
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">
              {user.tenant.name}
            </div>
            <div className="truncate text-sm font-medium">
              {user.name} · {user.role.code}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canSwitchTenant && tenants.length > 1 ? (
              <TenantSwitcher
                activeTenantId={user.tenantId}
                tenants={tenants.map((tenant) => ({
                  id: tenant.id,
                  name: tenant.name,
                  slug: tenant.slug,
                }))}
              />
            ) : null}
            <LogoutButton />
          </div>
        </div>
      }
    >
      {children}
    </ConsoleShell>
  );
}
