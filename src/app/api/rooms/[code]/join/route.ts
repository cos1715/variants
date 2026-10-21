import { NextResponse } from "next/server";
import { memberCookieName, sessionCookieOptions } from "@/lib/cookies";
import { authenticateRoomAccess, findRoom } from "@/lib/room-server";
import { makeToken, hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { normaliseCode, normaliseJoinRole, normaliseName, readSmallJson } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  const body = await readSmallJson(request);
  const name = normaliseName(body?.name);
  const role = normaliseJoinRole(body?.role);
  if (!code || !name || !role) return NextResponse.json({ error: "Перевір ім’я, роль і код кімнати." }, { status: 400 });

  try {
    const room = await findRoom(code);
    if (!room) return NextResponse.json({ error: "Кімнату з таким кодом не знайдено." }, { status: 404 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Гра вже почалась — приєднання закрито." }, { status: 409 });

    if (await authenticateRoomAccess(code)) return NextResponse.json({ code, alreadyJoined: true });

    const token = makeToken();
    await db("participants", {
      method: "POST",
      body: JSON.stringify({ room_id: room.id, name, role, session_token_hash: hashToken(token) }),
    });
    const response = NextResponse.json({ code }, { status: 201 });
    response.cookies.set(memberCookieName(code), token, sessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Не вдалося приєднатися до кімнати." }, { status: 500 });
  }
}
