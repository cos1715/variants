import "server-only";
import { cookies } from "next/headers";
import { hostCookieName, memberCookieName } from "@/lib/cookies";
import { hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { getPreset } from "@/lib/presets";
import type { Participant, ParticipantRole, PublicAnswer, QuestionType, RoomSnapshot, RoomStatus } from "@/lib/types";

export type RoomRecord = { id: string; code: string; status: RoomStatus; preset_id: string; host_token_hash: string; current_question_id: string | null; phase_ends_at: string | null; answering_seconds: number; voting_seconds: number };
type MemberRecord = Participant & { session_token_hash: string };
type QuestionRecord = { id: string; text: string; type: QuestionType; correct_answer: string };
type AnswerRecord = { id: string; text: string; answer_index: number };
type PublicAnswerRow = { id: string; source: { text: string } | null };

export async function findRoom(code: string): Promise<RoomRecord | null> {
  const rows = await db<RoomRecord[]>(`rooms?code=eq.${code}&select=id,code,status,preset_id,host_token_hash,current_question_id,phase_ends_at,answering_seconds,voting_seconds&limit=1`);
  return rows[0] ?? null;
}

export async function authenticateRoomAccess(code: string): Promise<{ room: RoomRecord; isHost: boolean; participant: Participant } | null> {
  const room = await findRoom(code);
  if (!room) return null;
  const store = await cookies();
  const hostToken = store.get(hostCookieName(code))?.value;
  const memberToken = store.get(memberCookieName(code))?.value;
  const isHost = Boolean(hostToken && hashToken(hostToken) === room.host_token_hash);
  const hash = memberToken ? hashToken(memberToken) : "";
  const filter = isHost ? "role=eq.host" : `session_token_hash=eq.${hash}`;
  if (!isHost && !memberToken) return null;
  const members = await db<MemberRecord[]>(`participants?room_id=eq.${room.id}&${filter}&select=id,name,role,joined_at&limit=1`);
  return members[0] ? { room, isHost, participant: members[0] } : null;
}

export async function snapshotForRoom(room: RoomRecord, isHost: boolean, participant: Participant): Promise<RoomSnapshot> {
  const [participants, preset] = await Promise.all([
    db<Participant[]>(`participants?room_id=eq.${room.id}&select=id,name,role,joined_at&order=joined_at.asc`),
    getPreset(room.preset_id),
  ]);
  if (!preset) throw new Error("Room preset is missing");
  const question = room.current_question_id
    ? (await db<QuestionRecord[]>(`room_questions?id=eq.${room.current_question_id}&room_id=eq.${room.id}&select=id,text,type,correct_answer&limit=1`))[0] ?? null
    : null;
  const game: RoomSnapshot["game"] = {
    question: question ? { text: question.text, type: question.type } : null,
    phaseEndsAt: room.phase_ends_at,
    answeringSeconds: room.answering_seconds,
    votingSeconds: room.voting_seconds,
  };
  if (isHost && room.status === "preparing" && question) game.correctAnswer = question.correct_answer;
  if (participant.role === "player" && room.status === "answering" && question) {
    const own = await db<AnswerRecord[]>(`room_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&participant_id=eq.${participant.id}&kind=eq.player_lie&select=text,answer_index&order=answer_index.asc`);
    game.ownAnswers = own.map((answer) => answer.text);
  }
  if (isHost && room.status === "answering" && question) {
    const submitted = await db<{ participant_id: string }[]>(`room_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&kind=eq.player_lie&select=participant_id`);
    game.submittedPlayerCount = new Set(submitted.map((answer) => answer.participant_id)).size;
  }
  if (room.status === "voting" && question) {
    game.publicAnswers = await db<PublicAnswerRow[]>(`room_public_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&select=id,source:room_answers(text)&order=position.asc`).then((rows) => rows.flatMap((row): PublicAnswer[] => row.source ? [{ id: row.id, text: row.source.text }] : []));
  }
  return { code: room.code, status: room.status, preset: { id: preset.id, name: preset.name, isBuiltin: preset.isBuiltin, questionCount: preset.questionCount }, participants, isHost, role: participant.role, game };
}
