import { NextResponse } from "next/server";

import { ingestYelpLeadWebhook } from "@/features/leads/service";
import { getServerEnv } from "@/lib/utils/env";
import { handleRouteError } from "@/lib/utils/http";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verification = searchParams.get("verification");

  if (verification) {
    return NextResponse.json({
      verification
    });
  }

  return NextResponse.json({
    message: "Yelp leads webhook endpoint is ready."
  });
}

export async function POST(request: Request) {
  try {
    const expectedSecret = getServerEnv().MAIN_PLATFORM_WEBHOOK_SHARED_SECRET?.trim() ?? "";

    if (expectedSecret) {
      const forwardedSecret = request.headers.get("x-irbis-forward-secret")?.trim() ?? "";

      if (!forwardedSecret || forwardedSecret !== expectedSecret) {
        return NextResponse.json(
          {
            accepted: false,
            message: "Forwarded webhook secret is missing or invalid."
          },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const result = await ingestYelpLeadWebhook(body, Object.fromEntries(request.headers.entries()));

    return NextResponse.json({
      accepted: true,
      ...result
    }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
