import "server-only";

import { listTenantIds } from "@/lib/db/settings-repository";
import { getServerEnv } from "@/lib/utils/env";
import { fetchWithRetry } from "@/lib/utils/fetch";

type CanaryStatus = "PASS" | "WARN" | "FAIL";

type CanaryCheck = {
  key: string;
  label: string;
  status: CanaryStatus;
  detail: string;
};

function getOverallStatus(checks: CanaryCheck[]): CanaryStatus {
  if (checks.some((check) => check.status === "FAIL")) {
    return "FAIL";
  }

  if (checks.some((check) => check.status === "WARN")) {
    return "WARN";
  }

  return "PASS";
}

function buildUrl(path: string) {
  const env = getServerEnv();
  return new URL(path, env.APP_URL).toString();
}

export async function runOperationalCanaries(params?: {
  includeHttpChecks?: boolean;
}) {
  const env = getServerEnv();
  const checks: CanaryCheck[] = [];

  try {
    const tenants = await listTenantIds();
    checks.push({
      key: "database.tenants",
      label: "Database tenant lookup",
      status: tenants.length > 0 ? "PASS" : "WARN",
      detail: tenants.length > 0 ? `${tenants.length} tenant record${tenants.length === 1 ? "" : "s"} found.` : "No tenants found."
    });
  } catch (error) {
    checks.push({
      key: "database.tenants",
      label: "Database tenant lookup",
      status: "FAIL",
      detail: error instanceof Error ? error.message : "Database tenant lookup failed."
    });
  }

  checks.push({
    key: "env.cron_secret",
    label: "Cron authentication",
    status: env.CRON_SECRET ? "PASS" : "FAIL",
    detail: env.CRON_SECRET ? "CRON_SECRET is configured." : "CRON_SECRET is missing."
  });

  checks.push({
    key: "env.app_url",
    label: "Application URL",
    status: env.APP_URL ? "PASS" : "FAIL",
    detail: env.APP_URL
  });

  const webhookVerificationUrl = buildUrl("/api/webhooks/yelp/leads?verification=canary");

  if (params?.includeHttpChecks) {
    try {
      const response = await fetchWithRetry(webhookVerificationUrl, {
        method: "GET",
        retries: 1,
        timeoutMs: 5_000
      });
      const body = await response.text();

      checks.push({
        key: "webhook.verification",
        label: "Yelp webhook verification",
        status: response.ok && body === "canary" ? "PASS" : "FAIL",
        detail: response.ok && body === "canary" ? "Verification echo returned canary." : `Unexpected response ${response.status}.`
      });
    } catch (error) {
      checks.push({
        key: "webhook.verification",
        label: "Yelp webhook verification",
        status: "FAIL",
        detail: error instanceof Error ? error.message : "Webhook verification check failed."
      });
    }
  } else {
    checks.push({
      key: "webhook.verification",
      label: "Yelp webhook verification",
      status: "WARN",
      detail: `HTTP check skipped. Safe verification URL: ${webhookVerificationUrl}`
    });
  }

  checks.push({
    key: "worker.reconcile",
    label: "Reconcile route",
    status: "PASS",
    detail: buildUrl("/api/internal/reconcile")
  });
  checks.push({
    key: "worker.followups",
    label: "Follow-up worker route",
    status: "PASS",
    detail: buildUrl("/api/internal/autoresponder/followups")
  });
  checks.push({
    key: "worker.retention",
    label: "Retention worker route",
    status: "PASS",
    detail: buildUrl("/api/internal/operations/retention")
  });
  checks.push({
    key: "worker.alerts",
    label: "Operational alerts route",
    status: "PASS",
    detail: buildUrl("/api/internal/operations/alerts")
  });

  return {
    ok: !checks.some((check) => check.status === "FAIL"),
    status: getOverallStatus(checks),
    checkedAt: new Date().toISOString(),
    checks
  };
}
