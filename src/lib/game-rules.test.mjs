import assert from "node:assert/strict";
import test from "node:test";
import { canAdjustScore, canCastVote, hasExactAnswerCount, isAnswerCount, isDeadlineOpen, migratedAnswerCount, scoreVotes, shouldFinalizeRound } from "./game-rules.ts";

test("legacy question types migrate to answer counts", () => {
  assert.equal(migratedAnswerCount("normal"), 1);
  assert.equal(migratedAnswerCount("special"), 3);
});

test("answer count accepts only one through five and requires an exact submission", () => {
  assert.equal(isAnswerCount(1), true);
  assert.equal(isAnswerCount(5), true);
  assert.equal(isAnswerCount(0), false);
  assert.equal(isAnswerCount(6), false);
  assert.equal(hasExactAnswerCount(["one"], 1), true);
  assert.equal(hasExactAnswerCount(["one"], 3), false);
  assert.equal(hasExactAnswerCount(["one", "two", "three"], 3), true);
});

test("scores correct choices, host lies, and player lies exactly once per vote", () => {
  const scores = scoreVotes([
    { voterId: "andriy", answerKind: "correct", authorId: null },
    { voterId: "olena", answerKind: "player_lie", authorId: "marko" },
    { voterId: "marko", answerKind: "host_lie", authorId: "host" },
  ]);
  assert.deepEqual(Object.fromEntries(scores), { andriy: 2, marko: -2 });
});

test("score adjustments are limited to between rounds and non-zero deltas", () => {
  assert.equal(canAdjustScore("preparing", 20), true);
  assert.equal(canAdjustScore("results", -20), true);
  assert.equal(canAdjustScore("answering", 1), false);
  assert.equal(canAdjustScore("voting", -1), false);
  assert.equal(canAdjustScore("results", 0), false);
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
