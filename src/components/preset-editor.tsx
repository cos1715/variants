"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PresetDetails, PresetQuestion } from "@/lib/types";

type Draft = Omit<PresetQuestion, "id" | "sortOrder"> & { id?: string; sortOrder?: number };
const emptyQuestion = (): Draft => ({ text: "", correctAnswer: "", answerCount: 1 });

export function PresetEditor({ initial }: { initial?: PresetDetails }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [questions, setQuestions] = useState<Draft[]>(initial?.questions ?? [emptyQuestion()]);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const update = (index: number, key: "text" | "correctAnswer" | "answerCount", value: string | number) => setQuestions((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const remove = (index: number) => setQuestions((items) => items.filter((_, itemIndex) => itemIndex !== index));
  const move = (index: number, direction: -1 | 1) => setQuestions((items) => { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  async function request(url: string, init: RequestInit) { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; }
  async function save() {
    setError(""); setSaving(true);
    try {
      let presetId = initial?.id;
      if (!presetId) { const created = await request("/api/presets", { method: "POST", body: JSON.stringify({ name }) }); presetId = created.id; }
      else await request(`/api/presets/${presetId}`, { method: "PATCH", body: JSON.stringify({ name }) });
      for (const question of questions) {
        const payload = JSON.stringify({ text: question.text, correctAnswer: question.correctAnswer, answerCount: question.answerCount });
        if (question.id) await request(`/api/presets/${presetId}/questions/${question.id}`, { method: "PATCH", body: payload });
        else await request(`/api/presets/${presetId}/questions`, { method: "POST", body: payload });
      }
      router.push(`/presets/${presetId}`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося зберегти пресет."); } finally { setSaving(false); }
  }
  async function deleteQuestion(index: number) {
    const question = questions[index];
    if (!confirm("Видалити це питання?")) return;
    try { if (initial && question.id) await request(`/api/presets/${initial.id}/questions/${question.id}`, { method: "DELETE" }); remove(index); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося видалити питання."); }
  }
  async function persistMove(index: number, direction: -1 | 1) {
    const question = questions[index]; move(index, direction);
    if (!initial || !question.id) return;
    try { await request(`/api/presets/${initial.id}/questions/${question.id}/move`, { method: "POST", body: JSON.stringify({ direction: direction === -1 ? "up" : "down" }) }); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося змінити порядок."); router.refresh(); }
  }
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-6 sm:py-10"><a href="/presets" className="text-sm text-violet-200 underline underline-offset-4">← Бібліотека пресетів</a><h1 className="mt-6 text-4xl font-black">{initial ? "Редагувати пресет" : "Новий пресет"}</h1><label className="mt-7 block text-sm font-bold text-zinc-200" htmlFor="preset-name">Назва</label><input id="preset-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3" placeholder="Наприклад, Кіно" /><section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Питання</h2><button type="button" onClick={() => setQuestions((items) => [...items, emptyQuestion()])} className="rounded-xl border border-violet-300/50 px-3 py-2 text-sm font-bold text-violet-100">Додати питання</button></div><div className="mt-4 space-y-4">{questions.map((question, index) => <article key={question.id ?? `new-${index}`} className="rounded-3xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between"><span className="font-bold text-violet-200">Питання {index + 1}</span><div className="flex gap-2"><button type="button" onClick={() => persistMove(index, -1)} disabled={index === 0} className="rounded-lg border border-white/10 px-2 py-1 disabled:opacity-30">Вгору</button><button type="button" onClick={() => persistMove(index, 1)} disabled={index === questions.length - 1} className="rounded-lg border border-white/10 px-2 py-1 disabled:opacity-30">Вниз</button><button type="button" onClick={() => deleteQuestion(index)} className="rounded-lg border border-rose-300/40 px-2 py-1 text-rose-200">Видалити</button></div></div><label className="mt-4 block text-sm text-zinc-300">Текст<textarea value={question.text} onChange={(event) => update(index, "text", event.target.value)} maxLength={400} className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-zinc-950 p-3" /></label><label className="mt-3 block text-sm text-zinc-300">Правильна відповідь<input value={question.correctAnswer} onChange={(event) => update(index, "correctAnswer", event.target.value)} maxLength={160} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 p-3" /></label><label className="mt-3 block text-sm text-zinc-300">Кількість відповідей<select value={question.answerCount} onChange={(event) => update(index, "answerCount", Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 p-3">{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label></article>)}</div></section><button onClick={save} disabled={saving} className="mt-8 w-full rounded-2xl bg-violet-500 px-5 py-4 text-lg font-bold hover:bg-violet-400 disabled:opacity-50">{saving ? "Зберігаємо…" : "Зберегти пресет"}</button>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}</main>;
}
