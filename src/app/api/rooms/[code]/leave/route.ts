import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSessionCookieOptions, hostCookieName, memberCookieName } from "@/lib/cookies";
import { findRoom } from "@/lib/room-server";
import { hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };
type Member = { id: string; role: "host" | "player" | "spectator" };

export async function DELETE(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });

  try {
    const room = await findRoom(code);
    const store = await cookies();
    const memberToken = store.get(memberCookieName(code))?.value;
    const hostToken = store.get(hostCookieName(code))?.value;
    if (!room || !memberToken) return NextResponse.json({ error: "Доступ до кімнати втрачено." }, { status: 403 });
    if (hostToken && hashToken(hostToken) === room.host_token_hash) return NextResponse.json({ error: "Ведучий може лише завершити кімнату." }, { status: 403 });

    const members = await db<Member[]>(`participants?room_id=eq.${room.id}&session_token_hash=eq.${hashToken(memberToken)}&select=id,role&limit=1`);
    const member = members[0];
    if (!member || member.role === "host") return NextResponse.json({ error: "Вийти може лише гравець або глядач." }, { status: 403 });
    await db(`participants?id=eq.${member.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

    const response = NextResponse.json({ left: true });
    response.cookies.set(memberCookieName(code), "", clearSessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Не вдалося вийти з кімнати." }, { status: 500 });
  }
}
