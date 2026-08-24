import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("Claude-only reply runtime", () => {
  it("contains no OpenAI or GPT implementation in the autoresponder path", () => {
    const files = [
      ...sourceFiles(join(process.cwd(), "features", "autoresponder")),
      ...sourceFiles(join(process.cwd(), "app", "api", "leads")),
      join(process.cwd(), "lib", "utils", "env.ts"),
    ];
    const runtimeSource = files
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(runtimeSource).not.toContain("openai");
    expect(runtimeSource).not.toMatch(/\bgpt(?:-|\b)/);
    expect(runtimeSource).toContain("anthropic");
    expect(runtimeSource).toContain("claude");
  });
});
