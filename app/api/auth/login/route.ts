import { NextResponse } from "next/server";
import { z } from "zod";

import { signIn } from "@/lib/auth/service";
import {
  checkLoginRateLimit,
  clearFailedLogins,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rateLimit = checkLoginRateLimit(ipAddress, body.email);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const result = await signIn(body.email, body.password);

  if (!result.success) {
    recordFailedLogin(ipAddress, body.email);
    return NextResponse.json({ message: result.message }, { status: 401 });
  }

  clearFailedLogins(ipAddress, body.email);

  return NextResponse.json({ success: true });
}
