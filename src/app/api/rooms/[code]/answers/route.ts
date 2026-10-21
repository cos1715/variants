import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode, normaliseGameAnswer, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function PUT(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code); const body = await readSmallJson(request);
  const answers = Array.isArray(body?.answers) ? body.answers.map(normaliseGameAnswer) : [];
  if (!code || !answers.length || answers.some((answer) => !answer)) return NextResponse.json({ error: "Перевір відповіді: кожна має містити до 160 символів." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access || access.participant.role !== "player") return NextResponse.json({ error: "Відповіді можуть надсилати лише гравці." }, { status: 403 });
    await db("rpc/submit_room_answers", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_participant_id: access.participant.id, p_answers: answers }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Час для відповідей уже завершився або кількість відповідей неправильна." }, { status: 409 }); }
}
