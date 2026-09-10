import { NextResponse } from "next/server";
import { beginLogin, appUrl } from "@/lib/auth";
export async function GET() {
  try {
    return NextResponse.redirect(await beginLogin());
  } catch {
    return NextResponse.redirect(
      `${appUrl()}/login?error=Sign-in%20is%20not%20configured%20or%20temporarily%20unavailable`,
    );
  }
}
