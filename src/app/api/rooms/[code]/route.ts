import { NextResponse } from "next/server";
import { authenticateRoomAccess, findRoom, snapshotForRoom } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function GET(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });

  try {
    const access = await authenticateRoomAccess(code);
    if (!access) return NextResponse.json({ error: "Кімната не знайдена або доступ втрачено." }, { status: 403 });
    await Promise.all([
      db("rpc/close_expired_answering_rounds", { method: "POST", body: "{}" }),
      db("rpc/close_expired_voting_rounds", { method: "POST", body: "{}" }),
    ]);
    const room = await findRoom(code);
    if (!room) return NextResponse.json({ error: "Кімната не знайдена." }, { status: 404 });
    return NextResponse.json(await snapshotForRoom(room, access.isHost, access.participant));
  } catch {
    return NextResponse.json({ error: "Не вдалося отримати стан кімнати." }, { status: 500 });
  }
}
