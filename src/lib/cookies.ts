import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

const options: Partial<ResponseCookie> = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

export const memberCookieName = (code: string) => `variants-member-${code}`;
export const hostCookieName = (code: string) => `variants-host-${code}`;
export const sessionCookieOptions = options;
export const clearSessionCookieOptions: Partial<ResponseCookie> = { ...options, maxAge: 0 };
