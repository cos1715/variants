import { NextResponse } from "next/server";
import { listPresets } from "@/lib/presets";
import { normalisePresetName, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

export async function GET() {
  try { return NextResponse.json(await listPresets()); }
  catch { return NextResponse.json({ error: "Не вдалося завантажити пресети." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const body = await readSmallJson(request);
  const name = normalisePresetName(body?.name);
  if (!name) return NextResponse.json({ error: "Назва має містити від 2 до 80 символів." }, { status: 400 });
  try {
    const rows = await db<{ id: string }[]>("presets?select=id", { method: "POST", body: JSON.stringify({ name }) });
    return NextResponse.json({ id: rows[0]?.id }, { status: 201 });
  } catch { return NextResponse.json({ error: "Не вдалося створити пресет." }, { status: 500 }); }
}
