import { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase-middleware";

export async function middleware(request: NextRequest) {
  const isGuestOnlyRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password");
  const isPublicAuthRoute = isGuestOnlyRoute || request.nextUrl.pathname.startsWith("/reset-password");

  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/favicon.ico") ||
    request.nextUrl.pathname.startsWith("/api/auth/callback")
  ) {
    return NextResponse.next();
  }

  try {
    const { supabase, response } = updateSession(request);
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session && !isPublicAuthRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (session && isGuestOnlyRoute) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return response;
  } catch {
    if (!isPublicAuthRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
