import "server-only";
import { db } from "@/lib/supabase-server";
import type { PresetDetails, PresetQuestion, PresetSummary } from "@/lib/types";

type PresetRow = { id: string; name: string; is_builtin: boolean; created_at: string };
type QuestionRow = { id: string; preset_id: string; text: string; correct_answer: string; answer_count: number; sort_order: number };
type CountRow = { preset_id: string };

function summary(row: PresetRow, questionCount: number): PresetSummary {
  return { id: row.id, name: row.name, isBuiltin: row.is_builtin, questionCount };
}

function question(row: QuestionRow): PresetQuestion {
  return { id: row.id, text: row.text, correctAnswer: row.correct_answer, answerCount: row.answer_count, sortOrder: row.sort_order };
}

export async function listPresets(): Promise<PresetSummary[]> {
  const [presets, questions] = await Promise.all([
    db<PresetRow[]>("presets?select=id,name,is_builtin,created_at&order=is_builtin.desc,name.asc"),
    db<CountRow[]>("questions?select=preset_id"),
  ]);
  const counts = new Map<string, number>();
  questions.forEach(({ preset_id }) => counts.set(preset_id, (counts.get(preset_id) ?? 0) + 1));
  return presets.map((preset) => summary(preset, counts.get(preset.id) ?? 0));
}

export async function getPreset(id: string): Promise<PresetDetails | null> {
  const presets = await db<PresetRow[]>(`presets?id=eq.${id}&select=id,name,is_builtin,created_at&limit=1`);
  const preset = presets[0];
  if (!preset) return null;
  const questions = await db<QuestionRow[]>(`questions?preset_id=eq.${id}&select=id,preset_id,text,correct_answer,answer_count,sort_order&order=sort_order.asc`);
  return { ...summary(preset, questions.length), questions: questions.map(question) };
}
