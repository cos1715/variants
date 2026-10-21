"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { RoomSnapshot } from "@/lib/types";
import { Brand } from "@/components/brand";

const roleLabel = { host: "Ведучий", player: "Гравець", spectator: "Глядач" } as const;

export function LobbyClient({ initial }: { initial: RoomSnapshot }) {
  const [room, setRoom] = useState(initial); const [error, setError] = useState(""); const [starting, setStarting] = useState(false); const channelRef = useRef<RealtimeChannel | null>(null);
  const refresh = useCallback(async () => { try { const response = await fetch(`/api/rooms/${initial.code}`, { cache: "no-store" }); if (!response.ok) throw new Error("Не вдалося оновити список."); setRoom(await response.json()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося оновити список."); } }, [initial.code]);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createClient(url, key);
    const channel = client.channel(`lobby:${initial.code}`).on("postgres_changes", { event: "*", schema: "public", table: "room_lobby_events", filter: `room_code=eq.${initial.code}` }, refresh).subscribe();
    channelRef.current = channel;
    return () => { channelRef.current = null; void channel.unsubscribe(); };
  }, [initial.code, refresh]);
  async function startGame() { setError(""); setStarting(true); try { const response = await fetch(`/api/rooms/${room.code}/start`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося почати гру."); } finally { setStarting(false); } }
  const players = room.participants.filter((participant) => participant.role === "player").length; const spectators = room.participants.filter((participant) => participant.role === "spectator").length;
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-6 sm:py-10"><header className="flex items-center justify-between"><Brand /><span className="rounded-full border border-white/10 px-3 py-1 text-sm font-bold text-violet-200">Код: {room.code}</span></header><section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8"><p className="text-sm font-bold tracking-[.18em] text-violet-300">{room.status === "lobby" ? "КІМНАТА ГОТОВА" : "ГРА ПОЧИНАЄТЬСЯ"}</p><h1 className="mt-3 text-4xl font-black tracking-tight">{room.status === "lobby" ? "Збираємо компанію" : "Обираємо перше питання"}</h1><p className="mt-3 leading-7 text-zinc-300">{room.isHost ? "Надішли код друзям. Коли всі тут — починай гру." : "Ти в кімнаті. Чекай, поки ведучий запустить гру."}</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-zinc-950/70 p-4"><span className="block text-3xl font-black text-violet-300">{players}</span><span className="text-sm text-zinc-400">гравців</span></div><div className="rounded-2xl bg-zinc-950/70 p-4"><span className="block text-3xl font-black text-cyan-300">{spectators}</span><span className="text-sm text-zinc-400">глядачів</span></div></div>{room.status === "lobby" && room.isHost && <button onClick={startGame} disabled={starting} className="mt-6 w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold hover:bg-violet-400 disabled:opacity-50">{starting ? "Починаємо…" : "Почати гру"}</button>}</section><section className="mt-5 rounded-3xl border border-white/10 bg-zinc-950/40 p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">У кімнаті</h2><span className="text-sm text-zinc-400">{room.participants.length}</span></div><ul className="mt-4 space-y-2">{room.participants.map((participant) => <li key={participant.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"><span className="font-medium">{participant.name}</span><span className={`text-sm ${participant.role === "host" ? "text-violet-300" : participant.role === "spectator" ? "text-cyan-300" : "text-zinc-400"}`}>{roleLabel[participant.role]}</span></li>)}</ul></section>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}</main>;
}
