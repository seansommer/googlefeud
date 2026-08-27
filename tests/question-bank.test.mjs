import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestionQueue,
  cleanQuestionStarter,
  promptFromQuery
} from "../src/data/question-bank.js";

test("custom question starters are cleaned and formatted for display", () => {
  assert.equal(cleanQuestionStarter("  can penguins dream ____?  "), "can penguins dream");
  assert.equal(promptFromQuery("can penguins dream?"), "Can penguins dream ____");
});

test("custom-only games draw exclusively from approved questions", () => {
  const customQuestions = Array.from({ length: 5 }, (_, index) => ({
    questionId: `q${index + 1}`,
    id: `custom-q${index + 1}`,
    category: "Community Pick",
    query: `custom starter ${index + 1}`,
    prompt: `Custom starter ${index + 1} ____`
  }));
  const queue = buildQuestionQueue(3, {
    includeOriginal: false,
    includeCustom: true,
    customQuestions
  });
  assert.ok(queue.length >= 3);
  assert.ok(queue.every((question) => question.bank === "custom"));
});

test("game creation rejects disabled or undersized question pools", () => {
  assert.throws(
    () => buildQuestionQueue(3, { includeOriginal: false, includeCustom: false }),
    /Turn on the original question bank/
  );
  assert.throws(
    () => buildQuestionQueue(3, {
      includeOriginal: false,
      includeCustom: true,
      customQuestions: [{ questionId: "only", query: "only custom", prompt: "Only custom ____" }]
    }),
    /contain 1 question/
  );
});
