const ACTIVE_GAME_KEY = "googlefued.activeGame";
const DRAFT_ANSWER_KEY = "googlefued.draftAnswer";
const RECENT_QUESTION_KEY = "googlefued.recentQuestions";

export const sessionStore = {
  setActiveGame(gameId) {
    localStorage.setItem(ACTIVE_GAME_KEY, gameId);
  },
  getActiveGame() {
    return localStorage.getItem(ACTIVE_GAME_KEY);
  },
  clearActiveGame() {
    localStorage.removeItem(ACTIVE_GAME_KEY);
  },
  saveDraft(gameId, roundNumber, answer) {
    localStorage.setItem(DRAFT_ANSWER_KEY, JSON.stringify({ gameId, roundNumber, answer }));
  },
  readDraft(gameId, roundNumber) {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_ANSWER_KEY));
      return draft?.gameId === gameId && draft?.roundNumber === roundNumber ? draft.answer : "";
    } catch {
      return "";
    }
  },
  clearDraft() {
    localStorage.removeItem(DRAFT_ANSWER_KEY);
  },
  getRecentQuestionIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(RECENT_QUESTION_KEY));
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  },
  rememberQuestionIds(ids, limit = 250) {
    const combined = [...ids, ...this.getRecentQuestionIds()];
    localStorage.setItem(RECENT_QUESTION_KEY, JSON.stringify([...new Set(combined)].slice(0, limit)));
  }
};
