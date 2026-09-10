import { NextRequest, NextResponse } from "next/server";
import { finishLogin, appUrl } from "@/lib/auth";
export async function GET(request: NextRequest) {
  try {
    await finishLogin(request.nextUrl);
    return NextResponse.redirect(`${appUrl()}/`);
  } catch {
    return NextResponse.redirect(
      `${appUrl()}/login?error=Sign-in%20could%20not%20be%20verified.%20Please%20try%20again.`,
    );
  }
}
