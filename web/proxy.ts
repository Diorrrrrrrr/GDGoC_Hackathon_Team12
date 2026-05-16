import { NextResponse, type NextRequest } from "next/server";

import { TOKEN_COOKIE } from "@/lib/auth/cookies";

const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
