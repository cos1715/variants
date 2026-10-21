import { NextResponse } from "next/server";
import { getPreset } from "@/lib/presets";
import { normalisePresetName, normaliseUuid, readSmallJson } from "@/lib/validation";
import { db } from "@/lib/supabase-server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const id = normaliseUuid((await params).id);
  if (!id) return NextResponse.json({ error: "Некоректний пресет." }, { status: 400 });
  try {
    const preset = await getPreset(id);
    return preset ? NextResponse.json(preset) : NextResponse.json({ error: "Пресет не знайдено." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Не вдалося завантажити пресет." }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: Context) {
  const id = normaliseUuid((await params).id);
  const body = await readSmallJson(request);
  const name = normalisePresetName(body?.name);
  if (!id || !name) return NextResponse.json({ error: "Некоректна назва пресету." }, { status: 400 });
  try {
    const rows = await db<{ id: string }[]>(`presets?id=eq.${id}&select=id`, { method: "PATCH", body: JSON.stringify({ name }) });
    return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Пресет не знайдено." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Не вдалося зберегти назву." }, { status: 500 }); }
}
