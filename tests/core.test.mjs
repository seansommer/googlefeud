import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateTeamStandings,
  answerEditDistance,
  findAnswerMatch,
  getTeamColor,
  getTeamWinners,
  isCloseAnswerMatch,
  isSelectedAnswerIndex,
  sortGameLeaderboard,
  summarizeGame
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

test("most-rounds-won mode ranks and crowns by round wins", () => {
  const game = {
    victoryMode: "rounds",
    players: {
      alpha: { displayName: "Alpha", totalScore: 30, highRoundCount: 1 },
      beta: { displayName: "Beta", totalScore: 18, highRoundCount: 2 }
    }
  };
  assert.equal(sortGameLeaderboard(game)[0].uid, "beta");
  assert.deepEqual(summarizeGame(game).winners.map((player) => player.uid), ["beta"]);
});

test("team standings use the selected victory rule and custom color", () => {
  const game = {
    teamMode: true,
    victoryMode: "rounds",
    teams: { team1: "Comets", team2: "Rockets" },
    teamColors: { team1: "green" },
    players: {
      alpha: { displayName: "Alpha", teamId: "team1", totalScore: 12 },
      beta: { displayName: "Beta", teamId: "team2", totalScore: 20 }
    },
    rounds: {
      1: { finalized: true, results: { alpha: { points: 10 }, beta: { points: 7 } } },
      2: { finalized: true, results: { alpha: { points: 2 }, beta: { points: 3 } } },
      3: { finalized: true, results: { alpha: { points: 0 }, beta: { points: 10 } } }
    }
  };
  const standings = calculateTeamStandings(game);
  assert.equal(standings[0].teamId, "team2");
  assert.equal(standings[0].roundWins, 2);
  assert.equal(getTeamWinners(game).winners[0].teamId, "team2");
  assert.equal(getTeamColor(game, "team1").id, "green");
});
