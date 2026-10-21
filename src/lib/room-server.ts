import "server-only";
import { cookies } from "next/headers";
import { hostCookieName, memberCookieName } from "@/lib/cookies";
import { hashToken } from "@/lib/security";
import { db } from "@/lib/supabase-server";
import { getPreset } from "@/lib/presets";
import type { LeaderboardEntry, Participant, ParticipantRole, PublicAnswer, QuestionType, ResultAnswer, RoomSnapshot, RoomStatus } from "@/lib/types";

export type RoomRecord = { id: string; code: string; status: RoomStatus; preset_id: string; host_token_hash: string; current_question_id: string | null; phase_ends_at: string | null; voting_closed_at: string | null; answering_seconds: number; voting_seconds: number };
type MemberRecord = Participant & { session_token_hash: string };
type QuestionRecord = { id: string; text: string; type: QuestionType; correct_answer: string };
type AnswerRecord = { id: string; text: string; answer_index: number; kind: ResultAnswer["kind"]; participant_id: string | null };
type PublicAnswerRow = { id: string; source_answer_id: string; position: number };
type VoteRecord = { public_answer_id: string; voter_participant_id: string };
type ScoreRecord = { participant_id: string; score_delta: number };
type ScoredParticipant = Participant & { score: number };
type RoundRecord = { question_id: string };

export async function findRoom(code: string): Promise<RoomRecord | null> {
  const rows = await db<RoomRecord[]>(`rooms?code=eq.${code}&select=id,code,status,preset_id,host_token_hash,current_question_id,phase_ends_at,voting_closed_at,answering_seconds,voting_seconds&limit=1`);
  return rows[0] ?? null;
}

export async function authenticateRoomAccess(code: string): Promise<{ room: RoomRecord; isHost: boolean; participant: Participant } | null> {
  const room = await findRoom(code);
  if (!room) return null;
  const store = await cookies();
  const hostToken = store.get(hostCookieName(code))?.value;
  const memberToken = store.get(memberCookieName(code))?.value;
  const isHost = Boolean(hostToken && hashToken(hostToken) === room.host_token_hash);
  const hash = memberToken ? hashToken(memberToken) : "";
  const filter = isHost ? "role=eq.host" : `session_token_hash=eq.${hash}`;
  if (!isHost && !memberToken) return null;
  const members = await db<MemberRecord[]>(`participants?room_id=eq.${room.id}&${filter}&select=id,name,role,joined_at&limit=1`);
  return members[0] ? { room, isHost, participant: members[0] } : null;
}

export async function snapshotForRoom(room: RoomRecord, isHost: boolean, participant: Participant): Promise<RoomSnapshot> {
  const [participants, preset] = await Promise.all([
    db<Participant[]>(`participants?room_id=eq.${room.id}&select=id,name,role,joined_at&order=joined_at.asc`),
    getPreset(room.preset_id),
  ]);
  if (!preset) throw new Error("Room preset is missing");
  const question = room.current_question_id
    ? (await db<QuestionRecord[]>(`room_questions?id=eq.${room.current_question_id}&room_id=eq.${room.id}&select=id,text,type,correct_answer&limit=1`))[0] ?? null
    : null;
  const game: RoomSnapshot["game"] = {
    question: question ? { text: question.text, type: question.type } : null,
    phaseEndsAt: room.phase_ends_at,
    answeringSeconds: room.answering_seconds,
    votingSeconds: room.voting_seconds,
    votingClosedAt: room.voting_closed_at,
  };
  if (isHost && room.status === "preparing" && question) game.correctAnswer = question.correct_answer;
  if (participant.role === "player" && room.status === "answering" && question) {
    const own = await db<AnswerRecord[]>(`room_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&participant_id=eq.${participant.id}&kind=eq.player_lie&select=text,answer_index&order=answer_index.asc`);
    game.ownAnswers = own.map((answer) => answer.text);
  }
  if (isHost && room.status === "answering" && question) {
    const submitted = await db<{ participant_id: string }[]>(`room_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&kind=eq.player_lie&select=participant_id`);
    game.submittedPlayerCount = new Set(submitted.map((answer) => answer.participant_id)).size;
  }
  if ((room.status === "voting" || room.status === "results" || room.status === "finished") && question) {
    const [publicRows, answerRows] = await Promise.all([
      db<PublicAnswerRow[]>(`room_public_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&select=id,source_answer_id,position&order=position.asc`),
      db<AnswerRecord[]>(`room_answers?room_id=eq.${room.id}&question_id=eq.${question.id}&select=id,text,kind,participant_id,answer_index`),
    ]);
    const answers = new Map(answerRows.map((answer) => [answer.id, answer]));
    game.publicAnswers = publicRows.flatMap((row): PublicAnswer[] => {
      const answer = answers.get(row.source_answer_id);
      return answer ? [{ id: row.id, text: answer.text }] : [];
    });
    if (participant.role === "player") {
      game.ownPublicAnswerIds = publicRows.flatMap((row) => answers.get(row.source_answer_id)?.participant_id === participant.id ? [row.id] : []);
      const ownVotes = await db<VoteRecord[]>(`room_votes?room_id=eq.${room.id}&question_id=eq.${question.id}&voter_participant_id=eq.${participant.id}&select=public_answer_id&limit=1`);
      game.hasVoted = ownVotes.length > 0;
    }
    if (isHost) {
      const votes = await db<VoteRecord[]>(`room_votes?room_id=eq.${room.id}&question_id=eq.${question.id}&select=public_answer_id,voter_participant_id`);
      game.votedPlayerCount = new Set(votes.map((vote) => vote.voter_participant_id)).size;
    }
    if (room.status === "results" || room.status === "finished") {
      const [votes, scoredParticipants, deltas, rounds, allQuestions] = await Promise.all([
        db<VoteRecord[]>(`room_votes?room_id=eq.${room.id}&question_id=eq.${question.id}&select=public_answer_id,voter_participant_id`),
        db<ScoredParticipant[]>(`participants?room_id=eq.${room.id}&select=id,name,role,joined_at,score&order=joined_at.asc`),
        db<ScoreRecord[]>(`room_round_scores?room_id=eq.${room.id}&question_id=eq.${question.id}&select=participant_id,score_delta`),
        db<RoundRecord[]>(`room_rounds?room_id=eq.${room.id}&select=question_id`),
        db<{ id: string }[]>(`room_questions?room_id=eq.${room.id}&select=id`),
      ]);
      const names = new Map(scoredParticipants.map((member) => [member.id, member.name]));
      const votesByAnswer = new Map<string, string[]>();
      for (const vote of votes) votesByAnswer.set(vote.public_answer_id, [...(votesByAnswer.get(vote.public_answer_id) ?? []), names.get(vote.voter_participant_id) ?? "Гравець"]);
      game.results = { answers: publicRows.flatMap((row): ResultAnswer[] => {
        const answer = answers.get(row.source_answer_id);
        if (!answer) return [];
        const voters = votesByAnswer.get(row.id) ?? [];
        return [{ id: row.id, text: answer.text, kind: answer.kind, authorName: answer.kind === "correct" ? null : names.get(answer.participant_id ?? "") ?? null, voteCount: voters.length, voters }];
      }) };
      const deltaByParticipant = new Map(deltas.map((delta) => [delta.participant_id, delta.score_delta]));
      let previousScore: number | null = null; let place = 0;
      game.leaderboard = scoredParticipants.filter((member) => member.role === "player").sort((a, b) => b.score - a.score || a.joined_at.localeCompare(b.joined_at)).map((member, index): LeaderboardEntry => {
        if (member.score !== previousScore) place = index + 1;
        previousScore = member.score;
        return { participantId: member.id, name: member.name, score: member.score, lastRoundDelta: deltaByParticipant.get(member.id) ?? 0, place };
      });
      game.hasNextQuestion = room.status === "results" && allQuestions.some((candidate) => !rounds.some((round) => round.question_id === candidate.id));
    }
  }
  return { code: room.code, status: room.status, preset: { id: preset.id, name: preset.name, isBuiltin: preset.isBuiltin, questionCount: preset.questionCount }, participants, isHost, role: participant.role, game };
}
