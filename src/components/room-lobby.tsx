"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { RoomSnapshot } from "@/lib/types";
import { Brand } from "@/components/brand";
import { GameRoom } from "@/components/game-room";
import type { PresetSummary } from "@/lib/types";

const roleLabel = { host: "Ведучий", player: "Гравець", spectator: "Глядач" } as const;

export function RoomLobby({ initial }: { initial: RoomSnapshot }) {
  const router = useRouter();
  const [room, setRoom] = useState(initial);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [changingPreset, setChangingPreset] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${initial.code}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Не вдалося оновити список.");
      setRoom(await response.json());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося оновити список."); }
  }, [initial.code]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createClient(url, key);
    const channel = client.channel(`lobby:${initial.code}`).on("postgres_changes", { event: "*", schema: "public", table: "room_lobby_events", filter: `room_code=eq.${initial.code}` }, refresh).subscribe();
    channelRef.current = channel;
    return () => { channelRef.current = null; void channel.unsubscribe(); };
  }, [initial.code, refresh]);

  useEffect(() => { if (room.isHost && room.status === "lobby") void fetch("/api/presets").then((response) => response.ok ? response.json() : []).then(setPresets); }, [room.isHost, room.status]);

  async function startGame() {
    setError(""); setStarting(true);
    try { const response = await fetch(`/api/rooms/${room.code}/start`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося почати гру."); } finally { setStarting(false); }
  }
  async function changePreset(presetId: string) {
    setError(""); setChangingPreset(true);
    try { const response = await fetch(`/api/rooms/${room.code}/preset`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presetId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося змінити пресет."); } finally { setChangingPreset(false); }
  }
  async function endRoom() {
    setError(""); setEnding(true);
    try { const response = await fetch(`/api/rooms/${room.code}/end`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося завершити кімнату."); } finally { setEnding(false); }
  }
  async function leaveRoom() {
    setError(""); setLeaving(true);
    try { const response = await fetch(`/api/rooms/${room.code}/leave`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.push("/"); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося вийти з кімнати."); } finally { setLeaving(false); }
  }
  async function copyInvite() {
    const invite = `${window.location.origin}/join/${room.code}`;
    setError("");
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(invite); setCopied(true); } catch { setCopied(false); setError(`Не вдалося скопіювати посилання. Надішли друзям код кімнати: ${room.code}.`); }
  }

  const players = room.participants.filter((participant) => participant.role === "player").length;
  const spectators = room.participants.filter((participant) => participant.role === "spectator").length;
  const ended = room.status === "finished";
  const isLobby = room.status === "lobby";
  if (!isLobby && !ended) return <GameRoom initial={room} />;
  const presetName = room.preset.name;
  const headline = ended ? "Гра завершена" : isLobby ? "Збираємо компанію" : "Гру розпочато";
  const eyebrow = ended ? "КІМНАТУ ЗАВЕРШЕНО" : isLobby ? "КІМНАТА ГОТОВА" : "ГРА РОЗПОЧАЛАСЯ";
  const description = ended ? "Ведучий завершив кімнату." : room.isHost ? "Надішли запрошення друзям. Коли всі тут — починай гру." : "Ти в кімнаті. Чекай, поки ведучий запустить гру.";

  return <main className="mx-auto min-h-screen max-w-xl px-5 py-6 sm:py-10"><header className="flex items-center justify-between"><Brand /><span className="rounded-full border border-white/10 px-3 py-1 text-sm font-bold text-violet-200">Код: {room.code}</span></header><section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8"><p className="text-sm font-bold tracking-[.18em] text-violet-300">{eyebrow}</p><h1 className="mt-3 text-4xl font-black tracking-tight">{headline}</h1><p className="mt-3 leading-7 text-zinc-300">{description}</p><div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3"><span className="text-xs font-bold tracking-[.16em] text-zinc-400">ПРЕСЕТ</span><span className="ml-3 font-bold text-violet-200">{presetName}</span><span className="ml-2 text-sm text-zinc-400">{room.preset.questionCount} питань</span></div>{room.isHost && isLobby && <label className="mt-4 block text-sm text-zinc-300" htmlFor="room-preset">Змінити пресет<select id="room-preset" value={room.preset.id} disabled={changingPreset} onChange={(event) => changePreset(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white">{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} — {preset.questionCount} питань</option>)}</select></label>}{isLobby && <button onClick={copyInvite} className="mt-4 w-full rounded-2xl border border-violet-300/50 px-5 py-3 font-bold text-violet-100 hover:bg-violet-300/10">{copied ? "Скопійовано" : "Копіювати"}</button>}<div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-zinc-950/70 p-4"><span className="block text-3xl font-black text-violet-300">{players}</span><span className="text-sm text-zinc-400">гравців</span></div><div className="rounded-2xl bg-zinc-950/70 p-4"><span className="block text-3xl font-black text-cyan-300">{spectators}</span><span className="text-sm text-zinc-400">глядачів</span></div></div>{room.isHost ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{isLobby && <button onClick={startGame} disabled={starting || ending || room.preset.questionCount === 0} className="rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold hover:bg-violet-400 disabled:opacity-50">{starting ? "Починаємо…" : room.preset.questionCount === 0 ? "Додай питання до пресету" : "Почати гру"}</button>}{!ended && <button onClick={endRoom} disabled={starting || ending} className="rounded-2xl border border-rose-300/50 px-5 py-4 text-lg font-bold text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">{ending ? "Завершуємо…" : "Завершити кімнату"}</button>}</div> : <button onClick={leaveRoom} disabled={leaving} className="mt-6 w-full rounded-2xl border border-zinc-400/50 px-5 py-4 text-lg font-bold text-zinc-100 hover:bg-white/10 disabled:opacity-50">{leaving ? "Виходимо…" : "Вийти з кімнати"}</button>}</section><section className="mt-5 rounded-3xl border border-white/10 bg-zinc-950/40 p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">У кімнаті</h2><span className="text-sm text-zinc-400">{room.participants.length}</span></div><ul className="mt-4 space-y-2">{room.participants.map((participant) => <li key={participant.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"><span className="font-medium">{participant.name}</span><span className={`text-sm ${participant.role === "host" ? "text-violet-300" : participant.role === "spectator" ? "text-cyan-300" : "text-zinc-400"}`}>{roleLabel[participant.role]}</span></li>)}</ul></section>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}</main>;
}
