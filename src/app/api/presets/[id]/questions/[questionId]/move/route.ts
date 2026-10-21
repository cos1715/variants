import { NextResponse } from "next/server";
import { normaliseUuid, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string; questionId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id, questionId } = await params;
  const presetId = normaliseUuid(id); const questionIdValue = normaliseUuid(questionId); const body = await readSmallJson(request);
  const direction = body?.direction === "up" ? -1 : body?.direction === "down" ? 1 : 0;
  if (!presetId || !questionIdValue || !direction) return NextResponse.json({ error: "Некоректний напрямок." }, { status: 400 });
  try {
    const moved = await db<boolean>("rpc/move_preset_question", { method: "POST", body: JSON.stringify({ p_preset_id: presetId, p_question_id: questionIdValue, p_direction: direction }) });
    return NextResponse.json({ moved });
  } catch { return NextResponse.json({ error: "Не вдалося змінити порядок." }, { status: 500 }); }
}
