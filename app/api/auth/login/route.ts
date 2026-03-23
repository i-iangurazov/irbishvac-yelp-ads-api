import { NextResponse } from "next/server";
import { z } from "zod";

import { signIn } from "@/lib/auth/service";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const result = await signIn(body.email, body.password);

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
