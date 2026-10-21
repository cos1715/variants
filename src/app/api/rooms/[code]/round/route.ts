import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode, normaliseGameAnswer, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request); const lie = normaliseGameAnswer(body?.lie);
  if (!code || !lie) return NextResponse.json({ error: "Введи відповідь до 160 символів." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може почати раунд." }, { status: 403 });
    await db("rpc/start_answering_round", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_host_lie: lie }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Раунд не готовий до запуску." }, { status: 409 }); }
}
