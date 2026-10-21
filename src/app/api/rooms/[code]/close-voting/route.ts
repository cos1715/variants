import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може завершити голосування." }, { status: 403 });
    await db("rpc/close_voting_round", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_force: true }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Голосування вже завершено або недоступне." }, { status: 409 }); }
}
