import { NextResponse } from "next/server";

import { signOut } from "@/lib/auth/service";

export async function POST() {
  await signOut();
  return NextResponse.json({ success: true });
}
