import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const prettierBinary = path.join(repoRoot, "node_modules", ".bin", "prettier");
const shouldWrite = process.argv.includes("--write");

function gitLines(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const worktreeFiles = [
  ...gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
  ...gitLines(["ls-files", "--others", "--exclude-standard"]),
];
const committedFiles =
  worktreeFiles.length === 0
    ? gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD^", "HEAD"])
    : [];
const files = [...new Set([...worktreeFiles, ...committedFiles])].filter(
  (file) => existsSync(path.join(repoRoot, file)),
);

if (files.length === 0) {
  console.log("No changed files require formatting checks.");
  process.exit(0);
}

const result = spawnSync(
  prettierBinary,
  [shouldWrite ? "--write" : "--check", "--ignore-unknown", ...files],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
