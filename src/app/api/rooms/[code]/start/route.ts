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
    if (!room || !token || hashToken(token) !== room.host_token_hash) return NextResponse.json({ error: "Лише ведучий може почати гру." }, { status: 403 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Гру вже розпочато." }, { status: 409 });
    const result = await db<string>("rpc/start_room_with_snapshot", { method: "POST", body: JSON.stringify({ p_room_id: room.id }) });
    if (result === "empty") return NextResponse.json({ error: "Пресет не містить питань." }, { status: 409 });
    if (result !== "started") return NextResponse.json({ error: "Гру вже розпочато." }, { status: 409 });
    return NextResponse.json({ status: "preparing" });
  } catch { return NextResponse.json({ error: "Не вдалося почати гру." }, { status: 500 }); }
}
