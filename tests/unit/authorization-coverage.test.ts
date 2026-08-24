import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function walk(directory: string, fileName: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    return statSync(path).isDirectory()
      ? walk(path, fileName)
      : entry === fileName
        ? [path]
        : [];
  });
}

describe("server authorization coverage", () => {
  it("keeps every protected API route behind a server-side guard", () => {
    const publicRoutes = new Set([
      "app/api/auth/login/route.ts",
      "app/api/auth/logout/route.ts",
    ]);
    const routeFiles = walk(join(repositoryRoot, "app/api"), "route.ts");
    const missingGuards = routeFiles
      .filter((path) => !publicRoutes.has(relative(repositoryRoot, path)))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const hasSessionGuard = source.includes("requireApiPermission(");
        const hasCronGuard = source.includes("requireCronAuthorization(");
        const hasWebhookGuard =
          source.includes("MAIN_PLATFORM_WEBHOOK_SHARED_SECRET") &&
          source.includes("timingSafeEqual(");

        return !hasSessionGuard && !hasCronGuard && !hasWebhookGuard;
      })
      .map((path) => relative(repositoryRoot, path));

    expect(missingGuards).toEqual([]);
  });

  it("keeps every console page behind permission authorization or a safe redirect", () => {
    const pageFiles = walk(join(repositoryRoot, "app/(console)"), "page.tsx");
    const missingGuards = pageFiles
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return (
          !source.includes("requirePermission(") &&
          !source.includes("redirect(")
        );
      })
      .map((path) => relative(repositoryRoot, path));

    expect(missingGuards).toEqual([]);
  });
});
