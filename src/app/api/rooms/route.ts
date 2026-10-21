import { NextResponse } from "next/server";
import { hostCookieName, memberCookieName, sessionCookieOptions } from "@/lib/cookies";
import { makeRoomCode, makeToken, hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { normaliseName } from "@/lib/validation";
import { classicPreset } from "@/lib/presets";

type InsertedRoom = { id: string; code: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const hostName = normaliseName(body.name);
  if (!hostName) return NextResponse.json({ error: "Введи ім’я від 2 до 24 символів." }, { status: 400 });

  const hostToken = makeToken();
  const memberToken = makeToken();

  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = makeRoomCode();
      try {
        const rooms = await db<InsertedRoom[]>("rooms?select=id,code", {
          method: "POST",
          body: JSON.stringify({ code, preset_key: classicPreset.key, host_token_hash: hashToken(hostToken) }),
        });
        const room = rooms[0];
        if (!room) throw new Error("Room creation returned no room");

        await db("participants", {
          method: "POST",
          body: JSON.stringify({
            room_id: room.id,
            name: hostName,
            role: "host",
            session_token_hash: hashToken(memberToken),
          }),
        });

        const response = NextResponse.json({ code: room.code }, { status: 201 });
        response.cookies.set(hostCookieName(room.code), hostToken, sessionCookieOptions);
        response.cookies.set(memberCookieName(room.code), memberToken, sessionCookieOptions);
        return response;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("409")) throw error;
      }
    }
    return NextResponse.json({ error: "Не вдалося згенерувати код. Спробуй ще раз." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Не вдалося створити кімнату. Перевір підключення до бази." }, { status: 500 });
  }
}
