import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode, normaliseUuid, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request); const answerId = normaliseUuid(body?.answerId);
  if (!code || !answerId) return NextResponse.json({ error: "Обери варіант відповіді." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access || access.participant.role !== "player") return NextResponse.json({ error: "Голосувати можуть лише гравці." }, { status: 403 });
    await db("rpc/submit_room_vote", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_participant_id: access.participant.id, p_public_answer_id: answerId }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Голос не збережено: голосування завершено, варіант недоступний або ти вже голосував." }, { status: 409 }); }
}
