import test from "node:test";
import assert from "node:assert/strict";

import { FirebaseGameService } from "../src/services/firebase-service.js";

function snapshot(value) {
  return {
    exists: () => value != null,
    val: () => value
  };
}

test("master role updates verify and patch an existing profile", async () => {
  const service = new FirebaseGameService();
  const record = { displayName: "Taylor", role: "player", updatedAt: 1 };
  service.db = {};
  service.api = {
    ref: (_db, path) => path,
    get: async (path) => snapshot(path === "users/player-1" ? record : null),
    update: async (_path, values) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) delete record[key];
        else record[key] = value;
      }
    }
  };

  const updated = await service.setUserRole("player-1", "host");
  assert.equal(updated.role, "host");
  assert.match(updated.hostNumber, /^H-\d{5}$/);
});

test("master role updates report a genuinely missing profile", async () => {
  const service = new FirebaseGameService();
  service.db = {};
  service.api = {
    ref: (_db, path) => path,
    get: async () => snapshot(null)
  };

  await assert.rejects(
    service.setUserRole("missing", "host"),
    (error) => error.code === "PLAYER_NOT_FOUND"
  );
});

test("player host requests contain only nickname, status, and time", async () => {
  const service = new FirebaseGameService();
  service.db = {};
  service.profile = {
    profileId: "player-1",
    displayName: "Taylor",
    email: "private@example.com",
    role: "player"
  };
  let savedPath = "";
  let savedValue = null;
  service.api = {
    ref: (_db, path) => path,
    set: async (path, value) => { savedPath = path; savedValue = value; }
  };

  const request = await service.requestHostAccess();
  assert.equal(savedPath, "hostRequests/player-1");
  assert.equal(request.displayName, "Taylor");
  assert.equal(request.status, "pending");
  assert.equal(typeof request.requestedAt, "number");
  assert.equal("email" in savedValue, false);
});

test("timer-free games open a round without a deadline", async () => {
  const service = new FirebaseGameService();
  service.db = {};
  let updatePath = "";
  let updateValue = null;
  service.api = {
    ref: (_db, path) => path,
    get: async () => snapshot({
      roundTimerEnabled: false,
      teamMode: false,
      players: { player1: { displayName: "Taylor" } }
    }),
    update: async (path, value) => { updatePath = path; updateValue = value; }
  };

  await service.startGame("game-1", { prompt: "How to ___", answers: ["how to dance"] });
  assert.equal(updatePath, "games/game-1");
  assert.equal(updateValue["rounds/1"].timerEnabled, false);
  assert.equal("deadlineAt" in updateValue["rounds/1"], false);
  assert.equal("durationSeconds" in updateValue["rounds/1"], false);
});

test("master game deletion rolls the game out of lifetime records and history", async () => {
  const service = new FirebaseGameService();
  service.db = {};
  service.profile = { profileId: "master", role: "master" };
  const valuesByPath = {
    games: {
      "game-1": {
        gameId: "game-1",
        gameNumber: 1001,
        code: "ABC123",
        nickname: "First Game",
        status: "finished",
        finishedAt: 10,
        players: {
          player1: { displayName: "Taylor" },
          player2: { displayName: "Jordan" }
        },
        rounds: {
          1: { finalized: true, results: { player1: { points: 10 }, player2: { points: 5 } } },
          2: { finalized: true, results: { player1: { points: 0 }, player2: { points: 0 } } }
        }
      },
      "game-2": {
        gameId: "game-2",
        gameNumber: 1002,
        status: "finished",
        finishedAt: 20,
        players: { player1: { displayName: "Taylor" } },
        rounds: {
          1: { finalized: true, results: { player1: { points: 7 } } }
        }
      }
    },
    playerStats: {
      player1: {
        displayName: "Taylor",
        gameSummaries: {
          "game-1": { points: 10, roundsPlayed: 2, roundsWon: 1, winPattern: "10", finishedAt: 10, gameNumber: 1001 },
          "game-2": { points: 7, roundsPlayed: 1, roundsWon: 1, winPattern: "1", finishedAt: 20, gameNumber: 1002 }
        }
      },
      player2: {
        displayName: "Jordan",
        gameSummaries: {
          "game-1": { points: 5, roundsPlayed: 2, roundsWon: 0, winPattern: "00", finishedAt: 10, gameNumber: 1001 }
        }
      }
    },
    leaderboard: {
      player1: { displayName: "Taylor", score: 10, gameId: "game-1", gameNumber: 1001 },
      player2: { displayName: "Jordan", score: 5, gameId: "game-1", gameNumber: 1001 }
    },
    userGames: {
      master: { "game-1": { role: "host" } },
      player1: { "game-1": { role: "player" }, "game-2": { role: "player" } },
      player2: { "game-1": { role: "player" } }
    }
  };
  let committedUpdates = null;
  service.api = {
    ref: (_db, path = "") => path,
    get: async (path) => snapshot(valuesByPath[path] ?? null),
    update: async (_path, updates) => { committedUpdates = updates; }
  };

  await service.deleteGame("game-1");
  assert.equal(committedUpdates["games/game-1"], null);
  assert.equal(committedUpdates["gameCodes/ABC123"], null);
  assert.equal(committedUpdates["userGames/player1/game-1"], null);
  assert.equal(committedUpdates["playerStats/player1"].totalPoints, 7);
  assert.equal(committedUpdates["playerStats/player1"].roundsPlayed, 1);
  assert.equal(committedUpdates["leaderboard/player1"].gameId, "game-2");
  assert.equal(committedUpdates["playerStats/player2"], null);
  assert.equal(committedUpdates["leaderboard/player2"], null);
});
