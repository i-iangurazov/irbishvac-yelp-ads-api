import { NextResponse } from "next/server";

import { ingestYelpLeadWebhook } from "@/features/leads/service";
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
    const body = await request.json();
    const result = await ingestYelpLeadWebhook(body, Object.fromEntries(request.headers.entries()));

    return NextResponse.json({
      received: true,
      ...result
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
