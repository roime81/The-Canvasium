import { auth } from "@/auth";

export default auth((request) => {
  const isLoggedIn = Boolean(request.auth?.user);
  const isLogin = request.nextUrl.pathname === "/login";

  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL("/login", request.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api/auth|api/plan|_next/static|_next/image|favicon.ico).*)"],
};
