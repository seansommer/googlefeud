import { APP_CONFIG } from "./config.js";

export const GAME_PHASES = Object.freeze({
  LOBBY: "lobby",
  WAITING: "waiting",
  ANSWERING: "answering",
  SCORING: "scoring",
  RECAP: "recap",
  FINISHED: "finished"
});

export function normalizeText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerSuffix(query, suggestion) {
  const cleanQuery = normalizeText(query);
  const cleanSuggestion = normalizeText(suggestion);
  return cleanSuggestion.startsWith(cleanQuery)
    ? cleanSuggestion.slice(cleanQuery.length).trim()
    : cleanSuggestion;
}

export function findAnswerMatch(query, answer, suggestions = []) {
  const normalizedAnswer = normalizeText(answer);
  const fullAnswer = normalizeText(`${query} ${answer}`);
  const index = suggestions.findIndex((suggestion) => {
    const normalizedSuggestion = normalizeText(suggestion);
    const suffix = answerSuffix(query, suggestion);
    return normalizedSuggestion === fullAnswer || suffix === normalizedAnswer;
  });

  if (index < 0) {
    return { matched: false, rank: null, points: 0, suggestion: null };
  }

  return {
    matched: true,
    rank: index + 1,
    points: APP_CONFIG.scoreByRank[index] ?? 0,
    suggestion: suggestions[index]
  };
}

export function safeKey(value = "") {
  return normalizeText(value).replace(/\s/g, "-").slice(0, 80);
}

export function makeGameCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function makeHostNumber(uid = "") {
  let hash = 2166136261;
  for (const char of uid) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `H-${String(Math.abs(hash) % 100000).padStart(5, "0")}`;
}

export function sortLeaderboard(players = {}) {
  return Object.entries(players)
    .map(([uid, player]) => ({ uid, ...player }))
    .sort(
      (a, b) =>
        (b.totalScore || 0) - (a.totalScore || 0) ||
        (b.highRoundCount || 0) - (a.highRoundCount || 0) ||
        (a.displayName || "").localeCompare(b.displayName || "")
    );
}

export function getRound(game, roundNumber = game?.currentRound) {
  return game?.rounds?.[roundNumber] || null;
}

export function lockedPlayerIds(game) {
  return Object.entries(game?.players || {})
    .filter(([, player]) => player.locked !== false)
    .map(([uid]) => uid);
}

export function allPlayersSubmitted(game) {
  const ids = lockedPlayerIds(game);
  const answers = getRound(game)?.answers || {};
  return ids.length > 0 && ids.every((uid) => answers[uid]?.locked);
}

export function allScoresConfirmed(game) {
  const ids = lockedPlayerIds(game);
  const claims = getRound(game)?.scoreClaims || {};
  return ids.length > 0 && ids.every((uid) => Number.isFinite(Number(claims[uid]?.points)));
}

export function allPlayersReady(game, nextRound = (game?.currentRound || 0) + 1) {
  const ids = lockedPlayerIds(game);
  const ready = game?.ready?.[nextRound] || {};
  return ids.length > 0 && ids.every((uid) => ready[uid] === true);
}

export function calculateRoundResults(game, roundNumber = game?.currentRound) {
  const round = getRound(game, roundNumber);
  if (!round) return [];
  return lockedPlayerIds(game).map((uid) => {
    const player = game.players[uid];
    const answer = round.answers?.[uid]?.text || "";
    const suggested = findAnswerMatch(round.query, answer, round.suggestions);
    const claim = round.scoreClaims?.[uid];
    return {
      uid,
      displayName: player.displayName,
      answer,
      suggestedPoints: suggested.points,
      points: Number(claim?.points ?? suggested.points),
      match: suggested,
      confirmed: claim != null
    };
  });
}

export function summarizeGame(game) {
  const leaderboard = sortLeaderboard(game?.players || {});
  return {
    leaderboard,
    winners: leaderboard.filter(
      (player) => player.totalScore === leaderboard[0]?.totalScore
    ),
    roundsPlayed: Object.values(game?.rounds || {}).filter((round) => round.finalized).length
  };
}

export function formatGameNumber(game) {
  return game?.gameNumber ? `Game #${game.gameNumber}` : `Game ${game?.code || ""}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function now() {
  return Date.now();
}
