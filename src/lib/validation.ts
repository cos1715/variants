import type { ParticipantRole } from "@/lib/types";

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
