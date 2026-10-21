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
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може показати результати." }, { status: 403 });
    await db("rpc/show_room_results", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Результати можна показати лише після завершення голосування." }, { status: 409 }); }
}
