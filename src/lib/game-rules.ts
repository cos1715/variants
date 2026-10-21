export function migratedAnswerCount(type: string): number { return type === "special" ? 3 : 1; }
export function isAnswerCount(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 5; }
export function hasExactAnswerCount(answers: string[], expected: number): boolean { return isAnswerCount(expected) && answers.length === expected; }
export function canAdjustScore(phase: string, delta: number): boolean { return (phase === "preparing" || phase === "results") && Number.isInteger(delta) && delta >= -20 && delta <= 20 && delta !== 0; }
export function isDeadlineOpen(deadline: string | null, now = Date.now()): boolean {
  return deadline !== null && new Date(deadline).getTime() > now;
}

export type ScoreVote = { voterId: string; answerKind: "correct" | "host_lie" | "player_lie"; authorId: string | null };

export function scoreVotes(votes: ScoreVote[]): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (id: string, amount: number) => scores.set(id, (scores.get(id) ?? 0) + amount);
  for (const vote of votes) {
    if (vote.answerKind === "correct") add(vote.voterId, 2);
    if (vote.answerKind === "host_lie") add(vote.voterId, -2);
    if (vote.answerKind === "player_lie" && vote.authorId) add(vote.authorId, 1);
  }
  return scores;
}

export function canCastVote({ isPlayer, votingOpen, hasVoted, isOwnAnswer }: { isPlayer: boolean; votingOpen: boolean; hasVoted: boolean; isOwnAnswer: boolean }): boolean {
  return isPlayer && votingOpen && !hasVoted && !isOwnAnswer;
}

export function shouldFinalizeRound(finalizedAt: string | null): boolean { return finalizedAt === null; }
