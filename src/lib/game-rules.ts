import type { QuestionType } from "@/lib/types";

export function requiredAnswerCount(type: QuestionType): number { return type === "special" ? 3 : 1; }
export function isDeadlineOpen(deadline: string | null, now = Date.now()): boolean {
  return deadline !== null && new Date(deadline).getTime() > now;
}
