import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const prismaBinary = path.join(repoRoot, "node_modules", ".bin", "prisma");
const tsxBinary = path.join(repoRoot, "node_modules", ".bin", "tsx");
const migrationsRoot = path.join(repoRoot, "prisma", "migrations");
const adminUrl = process.env.VERIFY_POSTGRES_URL;
const keepDatabase = process.env.VERIFY_KEEP_DB === "1";
const runSeed = process.env.VERIFY_RUN_SEED === "1";
const psqlBinary = process.env.VERIFY_PSQL_BIN || "psql";

if (!adminUrl) {
  console.error("VERIFY_POSTGRES_URL is required. Example: postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable");
  process.exit(1);
}

if (!existsSync(prismaBinary)) {
  console.error(`Prisma CLI not found at ${prismaBinary}. Run pnpm install first.`);
  process.exit(1);
}

const databaseName =
  process.env.VERIFY_DATABASE_NAME ||
  `yelp_ads_console_verify_${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}`;

function toDatabaseUrl(urlString, database) {
  const url = new URL(urlString);
  url.pathname = `/${database}`;
  return url.toString();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    ...options
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function runPsql(url, args) {
  return run(psqlBinary, [url, "-v", "ON_ERROR_STOP=1", ...args]);
}

function listMigrationFiles() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationsRoot, entry.name, "migration.sql"))
    .filter((filePath) => existsSync(filePath))
    .sort();
}

const verificationUrl = toDatabaseUrl(adminUrl, databaseName);
const adminDatabaseUrl = toDatabaseUrl(adminUrl, "postgres");

console.log(`Verifying fresh migrations against ${databaseName}`);

const dropResult = runPsql(adminDatabaseUrl, ["-c", `DROP DATABASE IF EXISTS "${databaseName}";`]);

if (dropResult.status !== 0) {
  process.exit(dropResult.status ?? 1);
}

const createResult = runPsql(adminDatabaseUrl, ["-c", `CREATE DATABASE "${databaseName}";`]);

if (createResult.status !== 0) {
  process.exit(createResult.status ?? 1);
}

const sharedEnv = {
  ...process.env,
  DATABASE_URL: verificationUrl,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || "/tmp/prisma-cache"
};

let prismaSucceeded = false;
let rawSqlSucceeded = false;
let seedSucceeded = !runSeed;

try {
  const prismaResult = run(prismaBinary, ["migrate", "deploy"], {
    env: sharedEnv
  });

  prismaSucceeded = prismaResult.status === 0;

  if (!prismaSucceeded) {
    console.log("Prisma migrate deploy failed. Running raw SQL migration files to isolate whether the issue is Prisma CLI or the SQL chain itself.");

    rawSqlSucceeded = true;

    for (const migrationFile of listMigrationFiles()) {
      console.log(`Applying ${path.relative(repoRoot, migrationFile)}`);
      const sqlResult = runPsql(verificationUrl, ["-f", migrationFile]);

      if (sqlResult.status !== 0) {
        rawSqlSucceeded = false;
        break;
      }
    }
  }

  if ((prismaSucceeded || rawSqlSucceeded) && runSeed) {
    const seedResult = run(tsxBinary, ["prisma/seed.ts"], {
      env: {
        ...sharedEnv,
        SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!"
      }
    });

    seedSucceeded = seedResult.status === 0;
  }
} finally {
  if (!keepDatabase) {
    runPsql(adminDatabaseUrl, ["-c", `DROP DATABASE IF EXISTS "${databaseName}";`]);
  }
}

console.log("");
console.log("Verification summary:");
console.log(`- Prisma migrate deploy: ${prismaSucceeded ? "passed" : "failed"}`);
console.log(`- Raw SQL migration chain: ${rawSqlSucceeded ? "passed" : prismaSucceeded ? "not needed" : "failed"}`);
if (runSeed) {
  console.log(`- Seed script: ${seedSucceeded ? "passed" : "failed"}`);
}
console.log(`- Verification database: ${keepDatabase ? databaseName : `${databaseName} (dropped)`}`);

if (!prismaSucceeded || !seedSucceeded) {
  process.exit(1);
}
