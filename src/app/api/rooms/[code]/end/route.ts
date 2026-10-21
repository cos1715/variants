import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hostCookieName } from "@/lib/cookies";
import { findRoom } from "@/lib/room-server";
import { hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });

  try {
    const room = await findRoom(code);
    const token = (await cookies()).get(hostCookieName(code))?.value;
    if (!room || !token || hashToken(token) !== room.host_token_hash) return NextResponse.json({ error: "Лише ведучий може завершити кімнату." }, { status: 403 });
    if (room.status === "finished") return NextResponse.json({ status: "finished" });
    await db(`rooms?id=eq.${room.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "finished", phase_ends_at: null }) });
    return NextResponse.json({ status: "finished" });
  } catch {
    return NextResponse.json({ error: "Не вдалося завершити кімнату." }, { status: 500 });
  }
}
