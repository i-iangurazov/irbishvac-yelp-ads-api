import { NextResponse } from "next/server";
import { z } from "zod";

import { switchActiveTenant } from "@/lib/auth/service";
import { listAccessibleTenants } from "@/lib/db/tenant-access-repository";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

const switchSchema = z.object({ tenantId: z.string().min(1) });

export async function GET() {
  try {
    const user = await requireApiPermission("tenants:switch");

    if (user instanceof NextResponse) return user;

    const tenants = await listAccessibleTenants({
      userId: user.id,
      primaryTenantId: user.primaryTenantId,
      roleCode: user.role.code,
    });

    return NextResponse.json({
      activeTenantId: user.tenantId,
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiPermission("tenants:switch");

    if (user instanceof NextResponse) return user;

    const values = switchSchema.parse(await request.json());
    const result = await switchActiveTenant(values.tenantId);

    return NextResponse.json(result, { status: result.success ? 200 : 403 });
  } catch (error) {
    return handleRouteError(error);
  }
}
