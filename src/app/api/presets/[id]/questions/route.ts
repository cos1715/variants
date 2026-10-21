import { NextResponse } from "next/server";
import { normaliseAnswerCount, normaliseCorrectAnswer, normaliseQuestionText, normaliseUuid, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string }> };
type LastQuestion = { sort_order: number };

export async function POST(request: Request, { params }: Context) {
  const presetId = normaliseUuid((await params).id);
  const body = await readSmallJson(request);
  const text = normaliseQuestionText(body?.text);
  const correctAnswer = normaliseCorrectAnswer(body?.correctAnswer);
  const answerCount = normaliseAnswerCount(body?.answerCount);
  if (!presetId || !text || !correctAnswer || !answerCount) return NextResponse.json({ error: "Заповни питання, відповідь і кількість відповідей." }, { status: 400 });
  try {
    const exists = await db<{ id: string }[]>(`presets?id=eq.${presetId}&select=id&limit=1`);
    if (!exists.length) return NextResponse.json({ error: "Пресет не знайдено." }, { status: 404 });
    const last = await db<LastQuestion[]>(`questions?preset_id=eq.${presetId}&select=sort_order&order=sort_order.desc&limit=1`);
    const rows = await db<{ id: string }[]>("questions?select=id", { method: "POST", body: JSON.stringify({ preset_id: presetId, text, correct_answer: correctAnswer, answer_count: answerCount, sort_order: (last[0]?.sort_order ?? -1) + 1 }) });
    return NextResponse.json({ id: rows[0]?.id }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не вдалося додати питання." }, { status: 500 }); }
}
