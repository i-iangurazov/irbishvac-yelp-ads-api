import { NextResponse } from "next/server";

import { runBusinessYelpWebhookSubscriptionAction } from "@/features/businesses/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

export async function POST(request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const user = await requireApiPermission("businesses:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { businessId } = await context.params;
    const body = await request.json();
    const result = await runBusinessYelpWebhookSubscriptionAction(user.tenantId, user.id, businessId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
