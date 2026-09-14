import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

type SupportedEmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

function isSupportedEmailOtpType(value: string | null): value is SupportedEmailOtpType {
  return value === "signup" || value === "invite" || value === "magiclink" || value === "recovery" || value === "email_change" || value === "email";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next");
  const redirectPath = next?.startsWith("/") ? next : "/dashboard";
  const successUrl = new URL(redirectPath, request.url);
  const failureUrl = new URL("/login", request.url);

  try {
    const supabase = createServerSupabaseClient();

    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      return NextResponse.redirect(successUrl);
    }

    if (tokenHash && isSupportedEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type
      });

      if (!error) {
        return NextResponse.redirect(successUrl);
      }
    }
  } catch {
    // Fall through to the login page when confirmation fails.
  }

  return NextResponse.redirect(failureUrl);
}
