import { APP_CONFIG } from "../config.js";
import { calculateRoundResults, makeGameCode, normalizeEmail, normalizeNickname, now } from "../core.js";

const STORAGE_KEY = "googlefued.demoState.v2";

function freshState() {
  return {
    currentUser: { uid: "demo-host", email: "host@example.com", displayName: "Demo Host" },
    profile: { displayName: "Demo Host", email: "host@example.com", role: "master", hostNumber: "H-00001", authProvider: "google.com" },
    users: {
      "demo-host": { displayName: "Demo Host", email: "host@example.com", role: "master", hostNumber: "H-00001", authProvider: "google.com" },
      "demo-jules": { displayName: "Cousin Jules", email: "jules@example.com", role: "player", authProvider: "anonymous" },
      "demo-rob": { displayName: "Uncle Rob", email: "rob@example.com", role: "player", authProvider: "anonymous" }
    },
    games: {}
  };
}

export class DemoGameService {
  constructor() {
    this.isDemo = true;
    this.listeners = new Map();
    try {
      this.state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || freshState();
    } catch {
      this.state = freshState();
    }
    this.auth = { currentUser: this.state.currentUser };
    this.profile = this.state.profile;
  }

  async init() {}

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  emit(gameId) {
    this.persist();
    for (const callback of this.listeners.get(gameId) || []) callback(this.state.games[gameId] || null);
  }

  onAuth(callback) {
    queueMicrotask(() => callback(this.state.currentUser, this.state.profile));
    return () => {};
  }

  async signUp({ email, displayName }) {
    const cleanEmail = normalizeEmail(email);
    const cleanName = String(displayName || "").trim();
    const match = Object.values(this.state.users).find(
      (user) => normalizeEmail(user.email) === cleanEmail && normalizeNickname(user.displayName) === normalizeNickname(cleanName)
    );
    if (match) throw Object.assign(new Error("That player already exists. Choose Find Player instead."), { code: "PLAYER_EXISTS" });
    const uid = `demo-${Date.now()}`;
    this.state.currentUser = { uid, email: cleanEmail, displayName: cleanName };
    this.state.profile = { displayName: cleanName, email: cleanEmail, role: "player", hostNumber: null, authProvider: "anonymous" };
    this.state.users[uid] = this.state.profile;
    this.auth.currentUser = this.state.currentUser;
    this.profile = this.state.profile;
    this.persist();
    return this.state.currentUser;
  }

  async signIn({ email, displayName }) {
    const entry = Object.entries(this.state.users).find(
      ([, user]) => normalizeEmail(user.email) === normalizeEmail(email) && normalizeNickname(user.displayName) === normalizeNickname(displayName)
    );
    if (!entry) throw Object.assign(new Error("We did not find that email and nickname together."), { code: "PLAYER_NOT_FOUND" });
    const [uid, profile] = entry;
    this.state.currentUser = { uid, email: profile.email, displayName: profile.displayName };
    this.state.profile = profile;
    this.auth.currentUser = this.state.currentUser;
    this.profile = profile;
    this.persist();
    return this.state.currentUser;
  }

  async signInWithGoogle() {
    const uid = "demo-host";
    const profile = this.state.users[uid];
    this.state.currentUser = { uid, email: profile.email, displayName: profile.displayName };
    this.state.profile = profile;
    this.auth.currentUser = this.state.currentUser;
    this.profile = profile;
    this.persist();
    return this.state.currentUser;
  }

  async signOut() {
    this.state.currentUser = null;
    this.state.profile = null;
    this.auth.currentUser = null;
    this.profile = null;
    this.persist();
  }

  async getProfile(uid) { return this.state.users[uid] || null; }
  async listUsers() { return this.state.users; }

  async updateDisplayName(displayName) {
    const cleanName = String(displayName || "").trim();
    if (!normalizeNickname(cleanName)) throw new Error("Your nickname needs at least one letter or number.");
    const uid = this.auth.currentUser.uid;
    this.state.users[uid].displayName = cleanName;
    this.state.profile = this.state.users[uid];
    this.state.currentUser.displayName = cleanName;
    this.profile = this.state.profile;
    for (const game of Object.values(this.state.games)) {
      if (game.players?.[uid]) game.players[uid].displayName = cleanName;
      if (game.hostUid === uid) game.hostDisplayName = cleanName;
    }
    this.persist();
    return this.profile;
  }

  async setUserRole(uid, role, hostNumber = null) {
    if (role === "host" && this.state.users[uid]?.authProvider !== "google.com") {
      throw new Error("That person must sign in with Google before becoming a host.");
    }
    this.state.users[uid] = { ...this.state.users[uid], role, hostNumber };
    this.persist();
  }

  async createGame({ nickname, totalRounds, hostPlays, questionQueue, suggestionMode }) {
    const gameId = `demo-game-${Date.now()}`;
    const uid = this.auth.currentUser.uid;
    const players = {
      "demo-jules": { displayName: "Cousin Jules", totalScore: 0, highRoundCount: 0, joinedAt: now(), locked: false },
      "demo-rob": { displayName: "Uncle Rob", totalScore: 0, highRoundCount: 0, joinedAt: now(), locked: false }
    };
    if (hostPlays) {
      players[uid] = { displayName: this.profile.displayName, totalScore: 0, highRoundCount: 0, joinedAt: now(), locked: false };
    }
    const game = {
      gameId,
      gameNumber: Object.keys(this.state.games).length + 1001,
      code: makeGameCode(),
      nickname,
      hostUid: uid,
      hostDisplayName: this.profile.displayName,
      hostNumber: this.profile.hostNumber,
      totalRounds,
      currentRound: 0,
      status: "lobby",
      phase: "lobby",
      hostPlays,
      suggestionMode,
      questionQueue,
      players,
      createdAt: now(),
      updatedAt: now()
    };
    this.state.games[gameId] = game;
    this.emit(gameId);
    return game;
  }

  async listMyGames() {
    const currentUid = this.auth.currentUser.uid;
    return Object.values(this.state.games)
      .filter((game) => game.hostUid === currentUid || game.players?.[currentUid])
      .map((game) => ({
        gameId: game.gameId,
        code: game.code,
        nickname: game.nickname,
        role: game.hostUid === currentUid ? "host" : "player",
        createdAt: game.createdAt
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listHighScores() {
    const scores = {};
    for (const game of Object.values(this.state.games)) {
      if (game.status !== "finished") continue;
      for (const [uid, player] of Object.entries(game.players || {})) {
        if (!scores[uid] || Number(player.totalScore || 0) >= scores[uid].score) {
          scores[uid] = {
            uid,
            displayName: player.displayName,
            score: Number(player.totalScore || 0),
            gameId: game.gameId,
            gameNumber: game.gameNumber,
            lastPlayedAt: game.finishedAt
          };
        }
      }
    }
    return Object.values(scores).sort((a, b) => b.score - a.score);
  }

  async findGameByCode(code) {
    const game = Object.values(this.state.games).find((item) => item.code === String(code).toUpperCase());
    if (!game) throw new Error("We couldn't find that game code.");
    return game;
  }

  async joinGame(code) {
    const game = await this.findGameByCode(code);
    const uid = this.auth.currentUser.uid;
    game.players[uid] = { displayName: this.profile.displayName, totalScore: 0, highRoundCount: 0, joinedAt: now(), locked: false };
    this.emit(game.gameId);
    return game;
  }

  watchGame(gameId, callback) {
    if (!this.listeners.has(gameId)) this.listeners.set(gameId, new Set());
    this.listeners.get(gameId).add(callback);
    queueMicrotask(() => callback(this.state.games[gameId] || null));
    return () => this.listeners.get(gameId)?.delete(callback);
  }

  async markLobbyReady(gameId) {
    const game = this.state.games[gameId];
    game.lobbyReady ||= {};
    game.lobbyReady[this.auth.currentUser.uid] = true;
    this.emit(gameId);
  }

  async getGame(gameId) { return this.state.games[gameId] || null; }

  async startGame(gameId, roundPayload) {
    const game = this.state.games[gameId];
    Object.values(game.players).forEach((player) => { player.locked = true; });
    game.currentRound = 1;
    game.status = "in_progress";
    game.phase = "answering";
    game.rounds = { 1: { ...roundPayload, number: 1, openedAt: now(), finalized: false } };
    this.emit(gameId);
  }

  async startNextRound(gameId, roundNumber, roundPayload) {
    const game = this.state.games[gameId];
    game.currentRound = roundNumber;
    game.phase = "answering";
    game.rounds[roundNumber] = { ...roundPayload, number: roundNumber, openedAt: now(), finalized: false };
    this.emit(gameId);
  }

  async submitAnswer(gameId, roundNumber, text) {
    const game = this.state.games[gameId];
    game.rounds[roundNumber].answers ||= {};
    game.rounds[roundNumber].answers[this.auth.currentUser.uid] = { text, locked: true, submittedAt: now() };
    this.emit(gameId);
  }

  async demoCompleteRound(gameId) {
    const game = this.state.games[gameId];
    const round = game.rounds[game.currentRound];
    round.answers ||= {};
    const demoAnswers = round.suggestions.map((item) => item.replace(new RegExp(`^${round.query}`, "i"), ""));
    let index = 1;
    for (const uid of Object.keys(game.players)) {
      if (!round.answers[uid]) {
        round.answers[uid] = { text: demoAnswers[index % demoAnswers.length], locked: true, submittedAt: now() };
        index += 2;
      }
    }
    this.emit(gameId);
  }

  async revealRound(gameId) { this.state.games[gameId].phase = "scoring"; this.emit(gameId); }

  async confirmScore(gameId, roundNumber, points) {
    const round = this.state.games[gameId].rounds[roundNumber];
    round.scoreClaims ||= {};
    round.scoreClaims[this.auth.currentUser.uid] = { points: Number(points), confirmedAt: now() };
    this.emit(gameId);
  }

  async demoConfirmScores(gameId) {
    const game = this.state.games[gameId];
    const round = game.rounds[game.currentRound];
    round.scoreClaims ||= {};
    for (const result of calculateRoundResults(game)) {
      if (!round.scoreClaims[result.uid]) round.scoreClaims[result.uid] = { points: result.suggestedPoints, confirmedAt: now() };
    }
    this.emit(gameId);
  }

  async finalizeRound(gameId) {
    const game = this.state.games[gameId];
    const round = game.rounds[game.currentRound];
    const results = calculateRoundResults(game);
    const best = Math.max(...results.map((item) => item.points));
    for (const result of results) {
      game.players[result.uid].totalScore += result.points;
      if (result.points === best) game.players[result.uid].highRoundCount += 1;
    }
    round.results = Object.fromEntries(results.map((result) => [result.uid, result]));
    round.finalized = true;
    round.finalizedAt = now();
    game.phase = "recap";
    this.emit(gameId);
  }

  async markReady(gameId, nextRound) {
    const game = this.state.games[gameId];
    game.ready ||= {};
    game.ready[nextRound] ||= {};
    for (const uid of Object.keys(game.players)) game.ready[nextRound][uid] = true;
    this.emit(gameId);
  }

  async finishGame(gameId) {
    Object.assign(this.state.games[gameId], { status: "finished", phase: "finished", finishedAt: now() });
    this.emit(gameId);
  }

  async updateGameSettings(gameId, updates) { Object.assign(this.state.games[gameId], updates); this.emit(gameId); }
  async removePlayer(gameId, uid) { delete this.state.games[gameId].players[uid]; this.emit(gameId); }

  async editFinalScore(gameId, roundNumber, uid, points) {
    const game = this.state.games[gameId];
    const result = game.rounds[roundNumber].results[uid];
    game.players[uid].totalScore += Number(points) - Number(result.points);
    result.points = Number(points);
    result.hostEdited = true;
    for (const player of Object.values(game.players || {})) player.highRoundCount = 0;
    for (const round of Object.values(game.rounds || {})) {
      const roundResults = Object.values(round.results || {});
      if (!round.finalized || !roundResults.length) continue;
      const best = Math.max(...roundResults.map((item) => Number(item.points || 0)));
      for (const item of roundResults) {
        if (Number(item.points || 0) === best && game.players[item.uid]) {
          game.players[item.uid].highRoundCount += 1;
        }
      }
    }
    this.emit(gameId);
  }

  reset() {
    this.state = freshState();
    this.auth.currentUser = this.state.currentUser;
    this.profile = this.state.profile;
    this.persist();
  }
}
