import "server-only";
import { cookies } from "next/headers";
import { hostCookieName, memberCookieName } from "@/lib/cookies";
import { hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import type { Participant, PresetKey, RoomSnapshot, RoomStatus } from "@/lib/types";

export type RoomRecord = { id: string; code: string; status: RoomStatus; preset_key: PresetKey; host_token_hash: string };
type MemberRecord = Participant & { session_token_hash: string };

export async function findRoom(code: string): Promise<RoomRecord | null> {
  const rows = await db<RoomRecord[]>(`rooms?code=eq.${code}&select=id,code,status,preset_key,host_token_hash&limit=1`);
  return rows[0] ?? null;
}

export async function authenticateRoomAccess(code: string): Promise<{ room: RoomRecord; isHost: boolean } | null> {
  const room = await findRoom(code);
  if (!room) return null;
  const store = await cookies();
  const hostToken = store.get(hostCookieName(code))?.value;
  const memberToken = store.get(memberCookieName(code))?.value;
  const isHost = Boolean(hostToken && hashToken(hostToken) === room.host_token_hash);
  if (isHost) return { room, isHost };
  if (!memberToken) return null;
  const hash = hashToken(memberToken);
  const members = await db<MemberRecord[]>(`participants?room_id=eq.${room.id}&session_token_hash=eq.${hash}&select=id&limit=1`);
  return members.length ? { room, isHost: false } : null;
}

export async function snapshotForRoom(room: RoomRecord, isHost: boolean): Promise<RoomSnapshot> {
  const participants = await db<Participant[]>(`participants?room_id=eq.${room.id}&select=id,name,role,joined_at&order=joined_at.asc`);
  return { code: room.code, status: room.status, presetKey: room.preset_key, participants, isHost };
}
