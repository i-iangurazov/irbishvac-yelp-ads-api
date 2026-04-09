import { describe, expect, it } from "vitest";

import { primaryNavigation } from "@/components/layout/app-sidebar";

describe("app sidebar navigation", () => {
  it("includes the dedicated autoresponder module in primary navigation", () => {
    expect(primaryNavigation.map((item) => item.id)).toContain("autoresponder");
    expect(primaryNavigation.find((item) => item.id === "autoresponder")).toMatchObject({
      href: "/autoresponder",
      label: "Autoresponder"
    });
  });
});
