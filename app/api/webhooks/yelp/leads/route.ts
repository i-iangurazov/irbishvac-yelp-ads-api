import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import {
  ingestYelpLeadWebhook,
  reconcilePendingLeadWebhooks,
} from "@/features/leads/service";
import { getServerEnv } from "@/lib/utils/env";
import { handleRouteError } from "@/lib/utils/http";
import { logError } from "@/lib/utils/logging";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verification = searchParams.get("verification");

  if (verification) {
    return new NextResponse(verification, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    message: "Yelp leads webhook endpoint is ready.",
  });
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const expectedSecret =
      env.MAIN_PLATFORM_WEBHOOK_SHARED_SECRET?.trim() ?? "";

    if (env.NODE_ENV === "production" && !expectedSecret) {
      return NextResponse.json(
        {
          accepted: false,
          message: "Webhook authentication is not configured.",
        },
        { status: 503 },
      );
    }

    if (expectedSecret) {
      const forwardedSecret =
        request.headers.get("x-irbis-forward-secret")?.trim() ?? "";
      const providedBuffer = Buffer.from(forwardedSecret);
      const expectedBuffer = Buffer.from(expectedSecret);
      const validSecret =
        providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer);

      if (!validSecret) {
        return NextResponse.json(
          {
            accepted: false,
            message: "Forwarded webhook secret is missing or invalid.",
          },
          { status: 401 },
        );
      }
    }

    const body = await request.json();
    const result = await ingestYelpLeadWebhook(
      body,
      Object.fromEntries(request.headers.entries()),
    );

    after(async () => {
      try {
        await reconcilePendingLeadWebhooks(
          Math.max(1, Math.min(result.results.length, 20)),
        );
      } catch (error) {
        logError("leads.webhook.background_reconcile_failed", {
          message:
            error instanceof Error
              ? error.message
              : "Unknown background reconcile failure",
        });
      }
    });

    return NextResponse.json(
      {
        accepted: true,
        ...result,
      },
      { status: 202 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
