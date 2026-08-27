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
