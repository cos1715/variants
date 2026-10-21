import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseAdjustmentReason, normaliseCode, normaliseScoreDelta, normaliseUuid, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request);
  const participantId = normaliseUuid(body?.participantId); const delta = normaliseScoreDelta(body?.delta); const reason = normaliseAdjustmentReason(body?.reason);
  if (!code || !participantId || !delta || (body?.reason !== undefined && body?.reason !== null && body?.reason !== "" && reason === null)) return NextResponse.json({ error: "Перевір гравця, зміну та коментар." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може коригувати бали." }, { status: 403 });
    await db("rpc/adjust_room_score", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_participant_id: participantId, p_delta: delta, p_reason: reason }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Бали можна коригувати лише між раундами для гравця." }, { status: 409 }); }
}
