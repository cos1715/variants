import { NextResponse } from "next/server";
import { authenticateRoomAccess } from "@/lib/room-server";
import { db } from "@/lib/supabase-server";
import { normaliseCode } from "@/lib/validation";

type Context = { params: Promise<{ code: string }> };

export async function POST(_: Request, { params }: Context) {
  const code = normaliseCode((await params).code);
  if (!code) return NextResponse.json({ error: "Некоректний код кімнати." }, { status: 400 });
  try {
    const access = await authenticateRoomAccess(code);
    if (!access?.isHost) return NextResponse.json({ error: "Лише ведучий може готувати питання." }, { status: 403 });
    const question = await db<unknown>("rpc/prepare_next_room_question", { method: "POST", body: JSON.stringify({ p_room_id: access.room.id }) });
    if (!question) return NextResponse.json({ error: "У пресеті більше немає питань." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Не вдалося підготувати питання." }, { status: 409 }); }
}
