import { describe, expect, it } from "vitest";

import {
  canAssignRole,
  getAssignableRoleCodes,
} from "@/features/settings/roles";
import { hasPermission } from "@/lib/permissions";

describe("production role matrix", () => {
  it("gives platform administrators cross-tenant and billing authority", () => {
    expect(hasPermission("PLATFORM_ADMIN", "tenants:manage")).toBe(true);
    expect(hasPermission("PLATFORM_ADMIN", "tenants:switch")).toBe(true);
    expect(hasPermission("PLATFORM_ADMIN", "billing:manage")).toBe(true);
    expect(hasPermission("PLATFORM_ADMIN", "diagnostics:read")).toBe(true);
  });

  it("limits agency operators to assigned-client operations", () => {
    expect(hasPermission("AGENCY_OPERATOR", "tenants:switch")).toBe(true);
    expect(hasPermission("AGENCY_OPERATOR", "programs:write")).toBe(true);
    expect(hasPermission("AGENCY_OPERATOR", "autoresponder:manage")).toBe(true);
    expect(hasPermission("AGENCY_OPERATOR", "tenants:manage")).toBe(false);
    expect(hasPermission("AGENCY_OPERATOR", "billing:manage")).toBe(false);
    expect(hasPermission("AGENCY_OPERATOR", "users:manage")).toBe(false);
  });

  it("allows client administrators to manage their tenant without platform powers", () => {
    expect(hasPermission("CLIENT_ADMIN", "users:manage")).toBe(true);
    expect(hasPermission("CLIENT_ADMIN", "credentials:manage")).toBe(true);
    expect(hasPermission("CLIENT_ADMIN", "businesses:delete")).toBe(true);
    expect(hasPermission("CLIENT_ADMIN", "tenants:switch")).toBe(false);
    expect(hasPermission("CLIENT_ADMIN", "billing:manage")).toBe(false);
    expect(hasPermission("CLIENT_ADMIN", "diagnostics:read")).toBe(false);
  });

  it("prevents client managers from user, credential, billing, and destructive access", () => {
    expect(hasPermission("CLIENT_MANAGER", "programs:write")).toBe(true);
    expect(hasPermission("CLIENT_MANAGER", "autoresponder:manage")).toBe(true);
    expect(hasPermission("CLIENT_MANAGER", "users:manage")).toBe(false);
    expect(hasPermission("CLIENT_MANAGER", "credentials:manage")).toBe(false);
    expect(hasPermission("CLIENT_MANAGER", "businesses:delete")).toBe(false);
    expect(hasPermission("CLIENT_MANAGER", "billing:manage")).toBe(false);
  });

  it("limits reviewers and viewers to their intended operations", () => {
    expect(hasPermission("REVIEWER", "replies:review")).toBe(true);
    expect(hasPermission("REVIEWER", "programs:write")).toBe(false);
    expect(hasPermission("REVIEWER", "leads:sync")).toBe(false);
    expect(hasPermission("VIEWER", "reports:read")).toBe(true);
    expect(hasPermission("VIEWER", "replies:review")).toBe(false);
    expect(hasPermission("VIEWER", "autoresponder:manage")).toBe(false);
  });
});

describe("role assignment policy", () => {
  it("allows platform administrators to assign production roles", () => {
    expect(getAssignableRoleCodes("PLATFORM_ADMIN")).toEqual([
      "PLATFORM_ADMIN",
      "AGENCY_OPERATOR",
      "CLIENT_ADMIN",
      "CLIENT_MANAGER",
      "REVIEWER",
      "VIEWER",
    ]);
  });

  it("prevents a client administrator from escalating to platform or agency roles", () => {
    expect(canAssignRole("CLIENT_ADMIN", "CLIENT_ADMIN")).toBe(true);
    expect(canAssignRole("CLIENT_ADMIN", "CLIENT_MANAGER")).toBe(true);
    expect(canAssignRole("CLIENT_ADMIN", "REVIEWER")).toBe(true);
    expect(canAssignRole("CLIENT_ADMIN", "VIEWER")).toBe(true);
    expect(canAssignRole("CLIENT_ADMIN", "PLATFORM_ADMIN")).toBe(false);
    expect(canAssignRole("CLIENT_ADMIN", "AGENCY_OPERATOR")).toBe(false);
    expect(canAssignRole("CLIENT_ADMIN", "ADMIN")).toBe(false);
  });

  it("does not allow non-user-management roles to assign any role", () => {
    expect(getAssignableRoleCodes("AGENCY_OPERATOR")).toEqual([]);
    expect(getAssignableRoleCodes("CLIENT_MANAGER")).toEqual([]);
    expect(getAssignableRoleCodes("REVIEWER")).toEqual([]);
    expect(getAssignableRoleCodes("VIEWER")).toEqual([]);
  });
});
