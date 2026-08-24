import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const migrationsRoot = path.join(repoRoot, "prisma", "migrations");
const adminUrl = process.env.VERIFY_POSTGRES_URL;
const keepDatabase = process.env.VERIFY_KEEP_DB === "1";
const psqlBinary = process.env.VERIFY_PSQL_BIN || "psql";
const upgradeBoundary = "20260824120000_claude_autoresponder_models";

if (!adminUrl) {
  console.error(
    "VERIFY_POSTGRES_URL is required. Example: postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable",
  );
  process.exit(1);
}

const databaseName =
  process.env.VERIFY_UPGRADE_DATABASE_NAME ||
  `yelp_ads_console_upgrade_${new Date()
    .toISOString()
    .replaceAll(/[-:.TZ]/g, "")
    .slice(0, 14)}`;

function toDatabaseUrl(urlString, database) {
  const url = new URL(urlString);
  url.pathname = `/${database}`;
  return url.toString();
}

function runPsql(url, args, { printOutput = true } = {}) {
  const result = spawnSync(
    psqlBinary,
    [url, "-v", "ON_ERROR_STOP=1", ...args],
    {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    },
  );

  if (printOutput && result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function listMigrations() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(migrationsRoot, entry.name, "migration.sql"),
    }))
    .filter((migration) => existsSync(migration.filePath))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function applyMigrations(url, migrations) {
  for (const migration of migrations) {
    console.log(`Applying ${migration.name}`);
    const result = runPsql(url, ["-f", migration.filePath], {
      printOutput: false,
    });

    if (result.status !== 0) {
      throw new Error(`Migration ${migration.name} failed`);
    }
  }
}

function assertQuery(url, label, sql, expected) {
  const result = runPsql(url, ["-At", "-c", sql], { printOutput: false });

  if (result.status !== 0) {
    throw new Error(`${label}: query failed`);
  }

  const actual = result.stdout.trim();
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }

  console.log(`Verified ${label}`);
}

const migrations = listMigrations();
const boundaryIndex = migrations.findIndex(
  (migration) => migration.name === upgradeBoundary,
);

if (boundaryIndex < 0) {
  console.error(`Upgrade boundary ${upgradeBoundary} was not found`);
  process.exit(1);
}

const legacyMigrations = migrations.slice(0, boundaryIndex);
const upgradeMigrations = migrations.slice(boundaryIndex);
const verificationUrl = toDatabaseUrl(adminUrl, databaseName);
const adminDatabaseUrl = toDatabaseUrl(adminUrl, "postgres");

console.log(`Verifying an existing database upgrade against ${databaseName}`);

const dropResult = runPsql(adminDatabaseUrl, [
  "-c",
  `DROP DATABASE IF EXISTS "${databaseName}";`,
]);
if (dropResult.status !== 0) process.exit(dropResult.status ?? 1);

const createResult = runPsql(adminDatabaseUrl, [
  "-c",
  `CREATE DATABASE "${databaseName}";`,
]);
if (createResult.status !== 0) process.exit(createResult.status ?? 1);

let passed = false;

try {
  applyMigrations(verificationUrl, legacyMigrations);

  const fixtureSql = `
    INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
    VALUES ('upgrade_tenant', 'Upgrade Fixture', 'upgrade-fixture', CURRENT_TIMESTAMP);

    INSERT INTO "Role" ("id", "code", "name", "description", "permissionsJson", "updatedAt")
    VALUES ('upgrade_admin_role', 'ADMIN', 'Legacy Admin', 'Upgrade fixture', '["*"]'::jsonb, CURRENT_TIMESTAMP);

    INSERT INTO "User" ("id", "tenantId", "roleId", "email", "name", "passwordHash", "updatedAt")
    VALUES ('upgrade_user', 'upgrade_tenant', 'upgrade_admin_role', 'upgrade@example.invalid', 'Upgrade User', 'not-a-real-hash', CURRENT_TIMESTAMP);

    INSERT INTO "Business" ("id", "tenantId", "name", "encryptedYelpBusinessId", "updatedAt")
    VALUES ('upgrade_business', 'upgrade_tenant', 'Upgrade Business', 'synthetic-encrypted-id', CURRENT_TIMESTAMP);

    INSERT INTO "LeadAutomationBusinessOverride"
      ("id", "tenantId", "businessId", "aiModel", "updatedAt")
    VALUES
      ('upgrade_override', 'upgrade_tenant', 'upgrade_business', 'gpt-5.2', CURRENT_TIMESTAMP);

    INSERT INTO "SystemSetting" ("id", "tenantId", "key", "valueJson", "updatedAt")
    VALUES (
      'upgrade_setting',
      'upgrade_tenant',
      'leadAutoresponder',
      '{"aiModel":"gpt-5.2","isEnabled":true}'::jsonb,
      CURRENT_TIMESTAMP
    );
  `;

  const fixtureResult = runPsql(verificationUrl, ["-c", fixtureSql], {
    printOutput: false,
  });
  if (fixtureResult.status !== 0) {
    throw new Error("Legacy fixture creation failed");
  }

  applyMigrations(verificationUrl, upgradeMigrations);

  assertQuery(
    verificationUrl,
    "business Claude model migration",
    `SELECT "aiModel" FROM "LeadAutomationBusinessOverride" WHERE "id" = 'upgrade_override';`,
    "claude-opus-4-6",
  );
  assertQuery(
    verificationUrl,
    "tenant Claude model migration",
    `SELECT "valueJson"->>'aiModel' FROM "SystemSetting" WHERE "id" = 'upgrade_setting';`,
    "claude-opus-4-6",
  );
  assertQuery(
    verificationUrl,
    "legacy administrator role migration",
    `SELECT r."code"::text FROM "User" u JOIN "Role" r ON r."id" = u."roleId" WHERE u."id" = 'upgrade_user';`,
    "PLATFORM_ADMIN",
  );
  assertQuery(
    verificationUrl,
    "AI usage ledger table",
    `SELECT to_regclass('public."AiGenerationUsage"') IS NOT NULL;`,
    "t",
  );
  assertQuery(
    verificationUrl,
    "cross-tenant assignment table",
    `SELECT to_regclass('public."UserTenantAccess"') IS NOT NULL;`,
    "t",
  );

  passed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (!keepDatabase) {
    runPsql(adminDatabaseUrl, [
      "-c",
      `DROP DATABASE IF EXISTS "${databaseName}";`,
    ]);
  }
}

console.log("");
console.log("Upgrade verification summary:");
console.log(`- Legacy migrations applied: ${legacyMigrations.length}`);
console.log(`- Upgrade migrations applied: ${upgradeMigrations.length}`);
console.log(`- Data transformations: ${passed ? "passed" : "failed"}`);
console.log(
  `- Verification database: ${keepDatabase ? databaseName : `${databaseName} (dropped)`}`,
);

if (!passed) process.exit(1);
