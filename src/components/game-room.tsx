"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { Brand } from "@/components/brand";
import { requiredAnswerCount } from "@/lib/game-rules";
import type { RoomSnapshot } from "@/lib/types";

const answerOptions = [30, 60, 90, 120];
const votingOptions = [15, 30, 45, 60];
const phaseLabel = { preparing: "ПІДГОТОВКА", answering: "ВІДПОВІДІ", voting: "ВІДКРИТІ ВАРІАНТИ", results: "РЕЗУЛЬТАТИ", finished: "ГРУ ЗАВЕРШЕНО", lobby: "КІМНАТА" } as const;

function formatSeconds(value: number) { return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }

export function GameRoom({ initial }: { initial: RoomSnapshot }) {
  const [room, setRoom] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(Date.now());
  const [hostLie, setHostLie] = useState("");
  const [answers, setAnswers] = useState<string[]>(initial.game.ownAnswers ?? []);
  const [answeringSeconds, setAnsweringSeconds] = useState(initial.game.answeringSeconds);
  const [votingSeconds, setVotingSeconds] = useState(initial.game.votingSeconds);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${initial.code}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не вдалося оновити стан гри.");
      setRoom(data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося оновити стан гри."); }
  }, [initial.code]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createClient(url, key);
    const channel = client.channel(`game:${initial.code}`).on("postgres_changes", { event: "*", schema: "public", table: "room_game_events", filter: `room_code=eq.${initial.code}` }, refresh).subscribe();
    channelRef.current = channel;
    return () => { channelRef.current = null; void channel.unsubscribe(); };
  }, [initial.code, refresh]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    setAnsweringSeconds(room.game.answeringSeconds); setVotingSeconds(room.game.votingSeconds);
  }, [room.game.answeringSeconds, room.game.votingSeconds]);
  useEffect(() => {
    const expected = room.game.question ? requiredAnswerCount(room.game.question.type) : 1;
    if (room.status === "answering" && room.role === "player") setAnswers(room.game.ownAnswers?.length ? room.game.ownAnswers : Array.from({ length: expected }, () => ""));
  }, [room.status, room.role, room.game.question?.text, room.game.ownAnswers]);

  const remaining = room.game.phaseEndsAt ? Math.max(0, Math.ceil((new Date(room.game.phaseEndsAt).getTime() - now) / 1000)) : null;
  useEffect(() => { if (room.status === "answering" && remaining === 0) void refresh(); }, [remaining, refresh, room.status]);

  async function action(path: string, method = "POST", body?: unknown, success?: string) {
    setBusy(path); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/rooms/${room.code}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не вдалося виконати дію.");
      if (success) setNotice(success);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося виконати дію."); }
    finally { setBusy(""); }
  }

  const question = room.game.question;
  const answerCount = question ? requiredAnswerCount(question.type) : 1;
  const isHost = room.role === "host";
  const canAnswer = room.status === "answering" && room.role === "player" && remaining !== 0;

  return <main className="mx-auto min-h-screen max-w-xl px-5 py-6 sm:py-10"><header className="flex items-center justify-between"><Brand /><span className="rounded-full border border-white/10 px-3 py-1 text-sm font-bold text-violet-200">Код: {room.code}</span></header><section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8"><p className="text-sm font-bold tracking-[.18em] text-violet-300">{phaseLabel[room.status]}</p>{question ? <><h1 className="mt-3 text-2xl font-black leading-tight sm:text-3xl">{question.text}</h1>{question.type === "special" && <p className="mt-2 text-sm text-cyan-200">Спеціальний раунд: введи три відповіді.</p>}</> : <h1 className="mt-3 text-3xl font-black">Гра розпочалася</h1>}{remaining !== null && <div className="mt-5 rounded-2xl bg-zinc-950/70 px-4 py-3"><span className="text-xs font-bold tracking-[.16em] text-zinc-400">ЗАЛИШИЛОСЯ</span><span className="ml-3 text-2xl font-black text-cyan-200">{formatSeconds(remaining)}</span></div>}

  {room.status === "preparing" && (isHost ? <div className="mt-6 space-y-4">{question ? <><div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4"><span className="block text-xs font-bold tracking-[.16em] text-emerald-200">ПРАВИЛЬНА ВІДПОВІДЬ</span><strong className="mt-1 block text-lg text-emerald-100">{room.game.correctAnswer}</strong></div><label className="block text-sm text-zinc-300">Твоя неправдива відповідь<input value={hostLie} maxLength={160} onChange={(event) => setHostLie(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white" /></label><button onClick={() => action("round", "POST", { lie: hostLie }, "Раунд почався.")} disabled={busy !== "" || !hostLie.trim()} className="w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold disabled:opacity-50">Почати раунд</button></> : <button onClick={() => action("prepare", "POST", undefined, "Питання підготовлено.")} disabled={busy !== ""} className="w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold disabled:opacity-50">Підготувати наступне питання</button>}<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-300">Відповіді<select value={answeringSeconds} onChange={(event) => setAnsweringSeconds(Number(event.target.value))} className="mt-2 w-full rounded-xl bg-zinc-950 px-3 py-2 text-white">{answerOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} с</option>)}</select></label><label className="text-sm text-zinc-300">Голосування<select value={votingSeconds} onChange={(event) => setVotingSeconds(Number(event.target.value))} className="mt-2 w-full rounded-xl bg-zinc-950 px-3 py-2 text-white">{votingOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} с</option>)}</select></label></div><button onClick={() => action("timers", "PATCH", { answeringSeconds, votingSeconds }, "Налаштування часу збережено.")} disabled={busy !== ""} className="w-full rounded-2xl border border-violet-300/50 px-5 py-3 font-bold text-violet-100 disabled:opacity-50">Зберегти час</button></div> : <p className="mt-6 text-zinc-300">Ведучий готує наступне питання.</p>)}

  {room.status === "answering" && <div className="mt-6">{room.role === "player" ? <><div className="space-y-3">{Array.from({ length: answerCount }, (_, index) => <label key={index} className="block text-sm text-zinc-300">{answerCount === 1 ? "Твоя неправдива відповідь" : `Відповідь ${index + 1}`}<input value={answers[index] ?? ""} disabled={!canAnswer} maxLength={160} onChange={(event) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))} className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white disabled:opacity-50" /></label>)}</div><button onClick={() => action("answers", "PUT", { answers }, "Відповіді збережено. Їх ще можна змінити до дедлайну.")} disabled={!canAnswer || busy !== "" || answers.some((answer) => !answer.trim())} className="mt-4 w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold disabled:opacity-50">Надіслати</button></> : <p className="rounded-2xl bg-zinc-950/70 p-4 text-zinc-300">Гравці вигадують відповіді.</p>}{isHost && <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4"><p className="text-zinc-300">Відповіли гравців: <strong className="text-white">{room.game.submittedPlayerCount ?? 0}</strong></p><button onClick={() => action("close", "POST", undefined, "Відповіді відкрито.")} disabled={busy !== ""} className="mt-3 w-full rounded-xl border border-cyan-300/50 px-4 py-3 font-bold text-cyan-100 disabled:opacity-50">Завершити введення достроково</button></div>}</div>}

  {room.status === "voting" && <div className="mt-6"><p className="text-zinc-300">Усі варіанти відкрито одночасно. Голосування буде додано на наступному етапі.</p><ol className="mt-4 space-y-2">{room.game.publicAnswers?.map((answer, index) => <li key={answer.id} className="rounded-2xl bg-zinc-950/70 px-4 py-3"><span className="mr-3 text-violet-300">{index + 1}.</span>{answer.text}</li>)}</ol></div>}
  </section>{isHost && room.status !== "finished" && <button onClick={() => action("end", "POST", undefined, "Гру завершено.")} disabled={busy !== ""} className="mt-5 w-full rounded-2xl border border-rose-300/50 px-5 py-3 font-bold text-rose-100 disabled:opacity-50">Завершити гру</button>}{room.status === "finished" && <p className="mt-5 rounded-2xl bg-zinc-950/70 p-4 text-zinc-300">Гра завершена ведучим.</p>}{notice && <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}</main>;
}
