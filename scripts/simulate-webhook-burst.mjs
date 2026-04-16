#!/usr/bin/env node

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = current.slice(2).split("=", 2);
    const nextValue = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined && nextValue && !nextValue.startsWith("--")) {
      args[key] = nextValue;
      index += 1;
      continue;
    }

    args[key] = inlineValue ?? "true";
  }

  return args;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  pnpm load:webhooks -- --url https://example.com/api/webhooks/yelp/leads --business-id <yelpBusinessId>",
      "",
      "Options:",
      "  --url                 Target webhook URL. Required.",
      "  --business-id         Yelp business ID placed into the webhook payload. Required.",
      "  --count               Number of webhook deliveries to send. Default: 25.",
      "  --concurrency         Concurrent in-flight requests. Default: 5.",
      "  --event-prefix        Prefix for generated event IDs. Default: evt_burst.",
      "  --lead-prefix         Prefix for generated lead IDs. Default: lead_burst.",
      "  --delivery-prefix     Prefix for generated delivery IDs. Default: delivery_burst.",
      "  --shared-secret       Optional x-irbis-forward-secret header for direct main-app testing.",
      "  --event-type          Yelp event type. Default: NEW_EVENT."
    ].join("\n")
  );
}

function requireString(value, flagName) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`Missing required ${flagName}.`);
}

function toPositiveInt(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }

  return parsed;
}

function buildPayload({
  businessId,
  eventType,
  eventId,
  leadId,
  occurredAt
}) {
  return {
    time: occurredAt,
    object: "business",
    data: {
      id: businessId,
      updates: [
        {
          event_type: eventType,
          event_id: eventId,
          lead_id: leadId,
          interaction_time: occurredAt
        }
      ]
    }
  };
}

async function postOne(params) {
  const startedAt = Date.now();
  const response = await fetch(params.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-yelp-delivery-id": params.deliveryId,
      ...(params.sharedSecret ? { "x-irbis-forward-secret": params.sharedSecret } : {})
    },
    body: JSON.stringify(
      buildPayload({
        businessId: params.businessId,
        eventType: params.eventType,
        eventId: params.eventId,
        leadId: params.leadId,
        occurredAt: params.occurredAt
      })
    )
  });
  const body = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    body
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true") {
    printUsage();
    return;
  }

  const url = requireString(args.url, "--url");
  const businessId = requireString(args["business-id"], "--business-id");
  const count = toPositiveInt(args.count, 25);
  const concurrency = toPositiveInt(args.concurrency, 5);
  const eventPrefix = String(args["event-prefix"] ?? "evt_burst");
  const leadPrefix = String(args["lead-prefix"] ?? "lead_burst");
  const deliveryPrefix = String(args["delivery-prefix"] ?? "delivery_burst");
  const eventType = String(args["event-type"] ?? "NEW_EVENT");
  const sharedSecret = typeof args["shared-secret"] === "string" ? args["shared-secret"] : null;

  let cursor = 0;
  const results = [];
  const startedAt = Date.now();

  async function worker() {
    while (cursor < count) {
      const current = cursor;
      cursor += 1;
      const sequence = String(current + 1).padStart(4, "0");
      const occurredAt = new Date(Date.now() + current * 1000).toISOString();

      try {
        const result = await postOne({
          url,
          businessId,
          eventType,
          eventId: `${eventPrefix}_${sequence}`,
          leadId: `${leadPrefix}_${sequence}`,
          deliveryId: `${deliveryPrefix}_${sequence}`,
          occurredAt,
          sharedSecret
        });

        results.push({
          sequence,
          ...result
        });
      } catch (error) {
        results.push({
          sequence,
          status: 0,
          ok: false,
          durationMs: 0,
          body: error instanceof Error ? error.message : "Unknown request failure"
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, () => worker()));

  const durationMs = Date.now() - startedAt;
  const successes = results.filter((result) => result.ok).length;
  const failures = results.length - successes;
  const statusCounts = results.reduce((accumulator, result) => {
    const key = String(result.status);
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  const avgDurationMs =
    results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / results.length) : 0;
  const slowest = [...results].sort((left, right) => right.durationMs - left.durationMs).slice(0, 5);

  console.log(
    JSON.stringify(
      {
        ok: failures === 0,
        url,
        businessId,
        count,
        concurrency,
        durationMs,
        successes,
        failures,
        avgDurationMs,
        statusCounts,
        slowest
      },
      null,
      2
    )
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown load simulation failure"
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
