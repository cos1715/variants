import assert from "node:assert/strict";
import test from "node:test";
import { isDeadlineOpen, requiredAnswerCount } from "./game-rules.ts";

test("round type defines its exact required answer count", () => {
  assert.equal(requiredAnswerCount("normal"), 1);
  assert.equal(requiredAnswerCount("special"), 3);
});

test("a deadline is closed at its server timestamp", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  assert.equal(isDeadlineOpen("2026-10-21T12:00:01.000Z", now), true);
  assert.equal(isDeadlineOpen("2026-10-21T12:00:00.000Z", now), false);
  assert.equal(isDeadlineOpen(null, now), false);
});
