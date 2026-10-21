import { redirect, notFound } from "next/navigation";
import { RoomLobby } from "@/components/room-lobby";
import { authenticateRoomAccess, snapshotForRoom } from "@/lib/room-server";
import { normaliseCode } from "@/lib/validation";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normaliseCode((await params).code); if (!code) notFound();
  try { const access = await authenticateRoomAccess(code); if (!access) redirect(`/join/${code}`); return <RoomLobby initial={await snapshotForRoom(access.room, access.isHost, access.participant)} />; } catch { return <main className="mx-auto max-w-md p-8 text-zinc-200"><h1 className="text-2xl font-bold">Кімната тимчасово недоступна</h1><p className="mt-3 text-zinc-400">Перевір налаштування Supabase або спробуй оновити сторінку.</p></main>; }
}
