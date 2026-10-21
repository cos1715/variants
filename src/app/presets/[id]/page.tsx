import { notFound } from "next/navigation";
import { PresetEditor } from "@/components/preset-editor";
import { getPreset } from "@/lib/presets";
import { normaliseUuid } from "@/lib/validation";
export default async function PresetPage({ params }: { params: Promise<{ id: string }> }) { const id = normaliseUuid((await params).id); if (!id) notFound(); const preset = await getPreset(id); if (!preset) notFound(); return <PresetEditor initial={preset} />; }
