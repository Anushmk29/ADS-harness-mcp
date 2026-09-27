import { NextRequest, NextResponse } from "next/server";

function hasUnexpiredSession(request: NextRequest): boolean {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return false;

  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return false;
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    ) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const authenticated = hasUnexpiredSession(request);
  const loginUrl = new URL("/login", request.url);

  if (!authenticated && request.nextUrl.pathname !== "/login") {
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (authenticated && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!backend|_next/static|_next/image|favicon.ico).*)"],
};
