import assert from "node:assert/strict";
import test from "node:test";
import { canCastVote, isDeadlineOpen, requiredAnswerCount, scoreVotes, shouldFinalizeRound } from "./game-rules.ts";

test("round type defines its exact required answer count", () => {
  assert.equal(requiredAnswerCount("normal"), 1);
  assert.equal(requiredAnswerCount("special"), 3);
});

test("scores correct choices, host lies, and player lies exactly once per vote", () => {
  const scores = scoreVotes([
    { voterId: "andriy", answerKind: "correct", authorId: null },
    { voterId: "olena", answerKind: "player_lie", authorId: "marko" },
    { voterId: "marko", answerKind: "host_lie", authorId: "host" },
  ]);
  assert.deepEqual(Object.fromEntries(scores), { andriy: 2, marko: 0 });
});

test("a player can cast only one non-own vote while voting is open", () => {
  assert.equal(canCastVote({ isPlayer: true, votingOpen: true, hasVoted: false, isOwnAnswer: false }), true);
  assert.equal(canCastVote({ isPlayer: true, votingOpen: true, hasVoted: true, isOwnAnswer: false }), false);
  assert.equal(canCastVote({ isPlayer: true, votingOpen: true, hasVoted: false, isOwnAnswer: true }), false);
  assert.equal(canCastVote({ isPlayer: false, votingOpen: true, hasVoted: false, isOwnAnswer: false }), false);
});

test("a round is finalized only before its finalization marker is written", () => {
  assert.equal(shouldFinalizeRound(null), true);
  assert.equal(shouldFinalizeRound("2026-10-21T12:00:00.000Z"), false);
});

test("a deadline is closed at its server timestamp", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  assert.equal(isDeadlineOpen("2026-10-21T12:00:01.000Z", now), true);
  assert.equal(isDeadlineOpen("2026-10-21T12:00:00.000Z", now), false);
  assert.equal(isDeadlineOpen(null, now), false);
});
