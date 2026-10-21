import { NextResponse } from "next/server";
import { authenticateRoomAccess, snapshotForRoom } from "@/lib/room-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function GET(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });

  try {
    const access = await authenticateRoomAccess(code);
    if (!access) return NextResponse.json({ error: "Кімната не знайдена або доступ втрачено." }, { status: 403 });
    return NextResponse.json(await snapshotForRoom(access.room, access.isHost));
  } catch {
    return NextResponse.json({ error: "Не вдалося отримати стан кімнати." }, { status: 500 });
  }
}
