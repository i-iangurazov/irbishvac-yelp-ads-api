import { describe, expect, it } from "vitest";

import {
  getNavigationForRole,
  primaryNavigation,
} from "@/components/layout/app-sidebar";

describe("app sidebar navigation", () => {
  it("includes the dedicated autoresponder module in primary navigation", () => {
    expect(primaryNavigation.map((item) => item.id)).toContain("autoresponder");
    expect(
      primaryNavigation.find((item) => item.id === "autoresponder"),
    ).toMatchObject({
      href: "/autoresponder",
      label: "Autoresponder",
    });
  });

  it("hides privileged settings from reviewer and viewer roles", () => {
    expect(
      getNavigationForRole("REVIEWER").primary.map((item) => item.id),
    ).not.toContain("settings");
    expect(
      getNavigationForRole("VIEWER").primary.map((item) => item.id),
    ).not.toContain("settings");
  });

  it("shows role-appropriate operational navigation", () => {
    const reviewer = getNavigationForRole("REVIEWER").primary.map(
      (item) => item.id,
    );
    const manager = getNavigationForRole("CLIENT_MANAGER").primary.map(
      (item) => item.id,
    );

    expect(reviewer).toEqual(
      expect.arrayContaining([
        "dashboard",
        "leads",
        "autoresponder",
        "businesses",
        "programs",
        "reporting",
        "audit",
      ]),
    );
    expect(manager).toEqual(expect.arrayContaining(["settings", "programs"]));
  });
});
