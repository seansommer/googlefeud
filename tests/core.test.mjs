import test from "node:test";
import assert from "node:assert/strict";

import {
  answerEditDistance,
  findAnswerMatch,
  isCloseAnswerMatch,
  isSelectedAnswerIndex
} from "../src/core.js";

test("an empty answer selection never highlights the first board result", () => {
  assert.equal(isSelectedAnswerIndex(null, 0), false);
  assert.equal(isSelectedAnswerIndex(undefined, 0), false);
  assert.equal(isSelectedAnswerIndex(0, 0), true);
  assert.equal(isSelectedAnswerIndex("2", 2), true);
});

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
