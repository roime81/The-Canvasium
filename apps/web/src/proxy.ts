import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((request) => {
  if (process.env.CANVASIUM_DESKTOP === "1") {
    return NextResponse.next();
  }
  if (!request.auth?.user) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!login|api/auth|api/plan|_next/static|_next/image|favicon.ico).*)"],
};
