import test from "node:test";
import assert from "node:assert/strict";

import {
  answerEditDistance,
  findAnswerMatch,
  isCloseAnswerMatch
} from "../src/core.js";

test("answer matching preserves exact matches and their rank", () => {
  const match = findAnswerMatch("how to", "tie a tie", [
    "how to bake bread",
    "how to tie a tie",
    "how to draw"
  ]);
  assert.equal(match.matched, true);
  assert.equal(match.exact, true);
  assert.equal(match.rank, 2);
  assert.equal(match.points, 7);
});

test("answer matching accepts close spelling within about twenty percent", () => {
  const match = findAnswerMatch("how to", "tie a tei", [
    "how to bake bread",
    "how to tie a tie",
    "how to draw"
  ]);
  assert.equal(answerEditDistance("tie a tei", "tie a tie"), 1);
  assert.equal(match.matched, true);
  assert.equal(match.exact, false);
  assert.equal(match.rank, 2);
});

test("answer matching rejects unrelated short words", () => {
  assert.equal(isCloseAnswerMatch("cat", "bat"), false);
  assert.equal(findAnswerMatch("how to", "cat", ["how to bat"]).matched, false);
});

