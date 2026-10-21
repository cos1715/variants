import { NextResponse } from "next/server";
import { normaliseAnswerCount, normaliseCorrectAnswer, normaliseQuestionText, normaliseUuid, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string; questionId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id, questionId } = await params;
  const presetId = normaliseUuid(id); const question = normaliseUuid(questionId); const body = await readSmallJson(request);
  const text = normaliseQuestionText(body?.text); const correctAnswer = normaliseCorrectAnswer(body?.correctAnswer); const answerCount = normaliseAnswerCount(body?.answerCount);
  if (!presetId || !question || !text || !correctAnswer || !answerCount) return NextResponse.json({ error: "Некоректні дані питання." }, { status: 400 });
  try {
    const rows = await db<{ id: string }[]>(`questions?id=eq.${question}&preset_id=eq.${presetId}&select=id`, { method: "PATCH", body: JSON.stringify({ text, correct_answer: correctAnswer, answer_count: answerCount }) });
    return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Питання не знайдено." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Не вдалося зберегти питання." }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: Context) {
  const { id, questionId } = await params;
  const presetId = normaliseUuid(id); const question = normaliseUuid(questionId);
  if (!presetId || !question) return NextResponse.json({ error: "Некоректне питання." }, { status: 400 });
  try {
    const deleted = await db<boolean>("rpc/delete_preset_question", { method: "POST", body: JSON.stringify({ p_preset_id: presetId, p_question_id: question }) });
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Питання не знайдено." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Не вдалося видалити питання." }, { status: 500 }); }
}
