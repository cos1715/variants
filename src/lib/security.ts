import { createHash, randomBytes, randomInt } from "crypto";

export function makeToken(): string { return randomBytes(32).toString("base64url"); }
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function makeRoomCode(): string { return String(randomInt(100000, 1000000)); }
