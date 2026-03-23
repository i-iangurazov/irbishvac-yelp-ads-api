import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/service", () => ({
  signIn: vi.fn(async () => ({ success: true }))
}));

describe("POST /api/auth/login", () => {
  it("returns success when credentials are accepted", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@yelp-console.local",
          password: "ChangeMe123!"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
