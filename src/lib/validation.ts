import type { ParticipantRole, QuestionType } from "@/lib/types";

export function normaliseCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.replace(/\s/g, "") : "";
  return /^\d{6}$/.test(code) ? code : null;
}

export function normaliseName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 && name.length <= 24 ? name : null;
}

export function normaliseJoinRole(value: unknown): Exclude<ParticipantRole, "host"> | null {
  return value === "player" || value === "spectator" ? value : null;
}

function normaliseText(value: unknown, min: number, max: number): string | null {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.length >= min && text.length <= max ? text : null;
}

export function normalisePresetName(value: unknown): string | null { return normaliseText(value, 2, 80); }
export function normaliseQuestionText(value: unknown): string | null { return normaliseText(value, 3, 400); }
export function normaliseCorrectAnswer(value: unknown): string | null { return normaliseText(value, 1, 160); }
export function normaliseQuestionType(value: unknown): QuestionType | null { return value === "normal" || value === "special" ? value : null; }
export function normaliseUuid(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function readSmallJson(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_000) return null;
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
