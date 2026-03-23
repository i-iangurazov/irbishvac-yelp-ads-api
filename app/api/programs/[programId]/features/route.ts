import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteProgramFeatureWorkflow,
  getProgramFeatureOverview,
  updateProgramFeatureWorkflow
} from "@/features/program-features/service";
import { handleRouteError, requireApiPermission } from "@/lib/utils/http";

const deleteSchema = z.object({
  featureType: z.string().min(1)
});

export async function GET(_: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("features:read");

    if (user instanceof NextResponse) {
      return user;
    }

    const { programId } = await context.params;
    const result = await getProgramFeatureOverview(user.tenantId, programId);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("features:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { programId } = await context.params;
    const result = await updateProgramFeatureWorkflow(user.tenantId, user.id, programId, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ programId: string }> }) {
  try {
    const user = await requireApiPermission("features:write");

    if (user instanceof NextResponse) {
      return user;
    }

    const { programId } = await context.params;
    const parsed = deleteSchema.parse(await request.json());
    const result = await deleteProgramFeatureWorkflow(user.tenantId, user.id, programId, parsed.featureType);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
