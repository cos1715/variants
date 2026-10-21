import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode, normaliseTimer, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request);
  const answeringSeconds = normaliseTimer(body?.answeringSeconds, [30, 60, 90, 120]);
  const votingSeconds = normaliseTimer(body?.votingSeconds, [15, 30, 45, 60]);
  if (!code || !answeringSeconds || !votingSeconds) return NextResponse.json({ error: "Обери допустимий час." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може змінювати таймери." }, { status: 403 });
    await db("rpc/configure_room_timers", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_answering_seconds: answeringSeconds, p_voting_seconds: votingSeconds }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Таймери можна змінити лише між раундами." }, { status: 409 }); }
}
