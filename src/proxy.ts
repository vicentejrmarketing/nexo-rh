import { NextResponse, type NextRequest } from "next/server";

// Barreira rápida: sem cookie de sessão, áreas internas vão para o login.
// A validação real da sessão e das permissões acontece no servidor, em cada página e ação.
const PUBLIC_PREFIXES = ["/login", "/trabalhe-conosco", "/api/webhooks", "/api/inngest", "/api/health"];
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-nexo_session" : "nexo_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!request.cookies.has(COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
