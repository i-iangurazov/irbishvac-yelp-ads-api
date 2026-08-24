import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  tenant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  userTenantAccess: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  listAccessibleTenants,
  resolveAccessibleTenant,
} from "@/lib/db/tenant-access-repository";

describe("tenant access repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies horizontal access for client roles before querying another tenant", async () => {
    const result = await resolveAccessibleTenant({
      userId: "client-user",
      primaryTenantId: "tenant-a",
      roleCode: "CLIENT_ADMIN",
      targetTenantId: "tenant-b",
    });

    expect(result).toBeNull();
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userTenantAccess.findUnique).not.toHaveBeenCalled();
  });

  it("gives an agency operator access only when an explicit assignment exists", async () => {
    prismaMock.userTenantAccess.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tenant: { id: "tenant-b", name: "B" } });

    const denied = await resolveAccessibleTenant({
      userId: "agency-user",
      primaryTenantId: "agency",
      roleCode: "AGENCY_OPERATOR",
      targetTenantId: "tenant-b",
    });
    const allowed = await resolveAccessibleTenant({
      userId: "agency-user",
      primaryTenantId: "agency",
      roleCode: "AGENCY_OPERATOR",
      targetTenantId: "tenant-b",
    });

    expect(denied).toBeNull();
    expect(allowed).toEqual({ id: "tenant-b", name: "B" });
    expect(prismaMock.userTenantAccess.findUnique).toHaveBeenCalledWith({
      where: {
        userId_tenantId: {
          userId: "agency-user",
          tenantId: "tenant-b",
        },
      },
      include: { tenant: true },
    });
  });

  it("allows a platform administrator to resolve any existing tenant", async () => {
    prismaMock.tenant.findUnique.mockResolvedValueOnce({
      id: "tenant-b",
      name: "B",
    });

    const result = await resolveAccessibleTenant({
      userId: "platform-user",
      primaryTenantId: "platform",
      roleCode: "PLATFORM_ADMIN",
      targetTenantId: "tenant-b",
    });

    expect(result).toEqual({ id: "tenant-b", name: "B" });
  });

  it("returns only primary and explicitly assigned tenants for an agency operator", async () => {
    prismaMock.tenant.findUnique.mockResolvedValueOnce({
      id: "agency",
      name: "Agency",
    });
    prismaMock.userTenantAccess.findMany.mockResolvedValueOnce([
      { tenant: { id: "tenant-b", name: "B" } },
      { tenant: { id: "agency", name: "Agency" } },
    ]);

    const tenants = await listAccessibleTenants({
      userId: "agency-user",
      primaryTenantId: "agency",
      roleCode: "AGENCY_OPERATOR",
    });

    expect(tenants).toEqual([
      { id: "agency", name: "Agency" },
      { id: "tenant-b", name: "B" },
    ]);
    expect(prismaMock.userTenantAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "agency-user" } }),
    );
  });
});
