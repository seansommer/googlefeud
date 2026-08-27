const ACTIVE_GAME_KEY = "googlefeud.activeGame";
const DRAFT_ANSWER_KEY = "googlefeud.draftAnswer";
const RECENT_QUESTION_KEY = "googlefeud.recentQuestions";
const LEGACY_KEYS = {
  activeGame: "googlefued.activeGame",
  draftAnswer: "googlefued.draftAnswer",
  recentQuestions: "googlefued.recentQuestions"
};

function readWithLegacyMigration(key, legacyKey) {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
  }
  return legacy;
}

export const sessionStore = {
  setActiveGame(gameId) {
    localStorage.setItem(ACTIVE_GAME_KEY, gameId);
    localStorage.removeItem(LEGACY_KEYS.activeGame);
  },
  getActiveGame() {
    return readWithLegacyMigration(ACTIVE_GAME_KEY, LEGACY_KEYS.activeGame);
  },
  clearActiveGame() {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    localStorage.removeItem(LEGACY_KEYS.activeGame);
  },
  saveDraft(gameId, roundNumber, answer) {
    localStorage.setItem(DRAFT_ANSWER_KEY, JSON.stringify({ gameId, roundNumber, answer }));
    localStorage.removeItem(LEGACY_KEYS.draftAnswer);
  },
  readDraft(gameId, roundNumber) {
    try {
      const draft = JSON.parse(readWithLegacyMigration(DRAFT_ANSWER_KEY, LEGACY_KEYS.draftAnswer));
      return draft?.gameId === gameId && draft?.roundNumber === roundNumber ? draft.answer : "";
    } catch {
      return "";
    }
  },
  clearDraft() {
    localStorage.removeItem(DRAFT_ANSWER_KEY);
    localStorage.removeItem(LEGACY_KEYS.draftAnswer);
  },
  getRecentQuestionIds() {
    try {
      const ids = JSON.parse(readWithLegacyMigration(RECENT_QUESTION_KEY, LEGACY_KEYS.recentQuestions));
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  },
  rememberQuestionIds(ids, limit = 250) {
    const combined = [...ids, ...this.getRecentQuestionIds()];
    localStorage.setItem(RECENT_QUESTION_KEY, JSON.stringify([...new Set(combined)].slice(0, limit)));
    localStorage.removeItem(LEGACY_KEYS.recentQuestions);
  }
};
