import { NextResponse } from "next/server";
import { clearSessionCookieOptions, memberCookieName } from "@/lib/cookies";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function DELETE(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });

  try {
    const access = await authenticateRoomAccess(code);
    if (!access || access.isHost) return NextResponse.json({ error: "Вийти може лише гравець або глядач." }, { status: 403 });
    const left = await db<boolean>("rpc/leave_room_participant", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id, p_participant_id: access.participant.id }) });
    if (!left) return NextResponse.json({ error: "Учасника вже немає в кімнаті." }, { status: 409 });

    const response = NextResponse.json({ left: true });
    response.cookies.set(memberCookieName(code), "", clearSessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Не вдалося вийти з кімнати." }, { status: 500 });
  }
}
