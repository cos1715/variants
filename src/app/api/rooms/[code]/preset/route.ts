import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hostCookieName } from "@/lib/cookies";
import { findRoom } from "@/lib/room-server";
import { hashToken } from "@/lib/security";
import { normaliseCode, normaliseUuid, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

type Context = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request); const presetId = normaliseUuid(body?.presetId);
  if (!code || !presetId) return NextResponse.json({ error: "Некоректний пресет." }, { status: 400 });
  try {
    const room = await findRoom(code); const token = (await cookies()).get(hostCookieName(code))?.value;
    if (!room || !token || hashToken(token) !== room.host_token_hash) return NextResponse.json({ error: "Лише ведучий може змінити пресет." }, { status: 403 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Після старту пресет змінити не можна." }, { status: 409 });
    const presets = await db<{ id: string }[]>(`presets?id=eq.${presetId}&select=id&limit=1`);
    if (!presets.length) return NextResponse.json({ error: "Пресет не знайдено." }, { status: 404 });
    await db(`rooms?id=eq.${room.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ preset_id: presetId }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Не вдалося змінити пресет." }, { status: 500 }); }
}
