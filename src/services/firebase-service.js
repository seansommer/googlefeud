import { APP_CONFIG } from "../config.js";
import { calculateRoundResults, makeGameCode, makeHostNumber, now } from "../core.js";

const SDK_VERSION = "12.18.0";
const sdkUrl = (service) =>
  `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${service}.js`;

export class FirebaseGameService {
  constructor() {
    this.isDemo = false;
    this.app = null;
    this.auth = null;
    this.db = null;
    this.api = {};
    this.profile = null;
  }

  async init() {
    const [appApi, authApi, databaseApi] = await Promise.all([
      import(sdkUrl("app")),
      import(sdkUrl("auth")),
      import(sdkUrl("database"))
    ]);

    this.api = { ...appApi, ...authApi, ...databaseApi };
    this.app = appApi.initializeApp(APP_CONFIG.firebase);
    this.auth = authApi.getAuth(this.app);
    this.db = databaseApi.getDatabase(this.app);
    await authApi.setPersistence(this.auth, authApi.browserLocalPersistence);
  }

  onAuth(callback) {
    return this.api.onAuthStateChanged(this.auth, async (user) => {
      if (user) this.profile = await this.getProfile(user.uid);
      else this.profile = null;
      callback(user, this.profile);
    });
  }

  async signUp({ email, password, displayName }) {
    const credential = await this.api.createUserWithEmailAndPassword(this.auth, email, password);
    await this.api.updateProfile(credential.user, { displayName });
    const profile = {
      displayName,
      email: email.toLowerCase(),
      role: "player",
      hostNumber: null,
      createdAt: now(),
      updatedAt: now()
    };
    await this.api.set(this.api.ref(this.db, `users/${credential.user.uid}`), profile);
    this.profile = profile;
    return credential.user;
  }

  async signIn({ email, password }) {
    return (await this.api.signInWithEmailAndPassword(this.auth, email, password)).user;
  }

  async signOut() {
    await this.api.signOut(this.auth);
  }

  async sendPasswordReset(email) {
    return this.api.sendPasswordResetEmail(this.auth, email);
  }

  async getProfile(uid) {
    const snapshot = await this.api.get(this.api.ref(this.db, `users/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async updateDisplayName(displayName) {
    const uid = this.auth.currentUser.uid;
    await Promise.all([
      this.api.updateProfile(this.auth.currentUser, { displayName }),
      this.api.update(this.api.ref(this.db, `users/${uid}`), { displayName, updatedAt: now() })
    ]);
  }

  async listUsers() {
    const snapshot = await this.api.get(this.api.ref(this.db, "users"));
    return snapshot.exists() ? snapshot.val() : {};
  }

  async setUserRole(uid, role, hostNumber = null) {
    const updates = { role, updatedAt: now() };
    if (role === "host") updates.hostNumber = hostNumber || makeHostNumber(uid);
    if (role === "player") updates.hostNumber = null;
    await this.api.update(this.api.ref(this.db, `users/${uid}`), updates);
  }

  async nextGameNumber() {
    const result = await this.api.runTransaction(
      this.api.ref(this.db, "meta/nextGameNumber"),
      (value) => Number(value || 1000) + 1
    );
    return result.snapshot.val();
  }

  async createGame({ nickname, totalRounds, hostPlays, questionQueue, suggestionMode }) {
    const uid = this.auth.currentUser.uid;
    const profile = this.profile || (await this.getProfile(uid));
    if (!["host", "master", "admin"].includes(profile?.role)) {
      throw new Error("This account has not been approved as a host.");
    }

    let code = makeGameCode();
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const existing = await this.api.get(this.api.ref(this.db, `gameCodes/${code}`));
      if (!existing.exists()) break;
      code = makeGameCode();
    }

    const gameId = this.api.push(this.api.ref(this.db, "games")).key;
    const gameNumber = await this.nextGameNumber();
    const game = {
      gameId,
      gameNumber,
      code,
      nickname,
      hostUid: uid,
      hostDisplayName: profile.displayName,
      hostNumber: profile.hostNumber || makeHostNumber(uid),
      totalRounds,
      currentRound: 0,
      status: "lobby",
      phase: "lobby",
      hostPlays,
      suggestionMode,
      questionQueue,
      players: hostPlays
        ? {
            [uid]: {
              displayName: profile.displayName,
              totalScore: 0,
              highRoundCount: 0,
              joinedAt: now(),
              locked: false
            }
          }
        : {},
      createdAt: now(),
      updatedAt: now()
    };

    // Create the game first so the game-code rule can verify its host securely.
    await this.api.set(this.api.ref(this.db, `games/${gameId}`), game);
    await this.api.update(this.api.ref(this.db), {
      [`gameCodes/${code}`]: gameId,
      [`userGames/${uid}/${gameId}`]: { code, nickname, role: "host", createdAt: now() }
    });
    return game;
  }

  async listMyGames() {
    const uid = this.auth.currentUser.uid;
    const snapshot = await this.api.get(this.api.ref(this.db, `userGames/${uid}`));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([gameId, summary]) => ({ gameId, ...summary }))
      .sort((a, b) => Number(b.createdAt || b.joinedAt || 0) - Number(a.createdAt || a.joinedAt || 0));
  }

  async listHighScores() {
    const snapshot = await this.api.get(this.api.ref(this.db, "leaderboard"));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([uid, entry]) => ({ uid, ...entry }))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  async findGameByCode(rawCode) {
    const code = String(rawCode || "").trim().toUpperCase();
    const codeSnapshot = await this.api.get(this.api.ref(this.db, `gameCodes/${code}`));
    if (!codeSnapshot.exists()) throw new Error("We couldn't find that game code.");
    const gameId = codeSnapshot.val();
    const gameSnapshot = await this.api.get(this.api.ref(this.db, `games/${gameId}`));
    if (!gameSnapshot.exists()) throw new Error("That game is no longer available.");
    return gameSnapshot.val();
  }

  async joinGame(code) {
    const game = await this.findGameByCode(code);
    if (game.status !== "lobby") throw new Error("That game has already started.");
    if (Object.keys(game.players || {}).length >= APP_CONFIG.maxPlayers) {
      throw new Error("That game is full.");
    }

    const uid = this.auth.currentUser.uid;
    const profile = this.profile || (await this.getProfile(uid));
    const player = {
      displayName: profile.displayName,
      totalScore: 0,
      highRoundCount: 0,
      joinedAt: now(),
      locked: false
    };
    await this.api.update(this.api.ref(this.db), {
      [`games/${game.gameId}/players/${uid}`]: player,
      [`games/${game.gameId}/updatedAt`]: now(),
      [`userGames/${uid}/${game.gameId}`]: {
        code: game.code,
        nickname: game.nickname,
        role: "player",
        joinedAt: now()
      }
    });
    return { ...game, players: { ...(game.players || {}), [uid]: player } };
  }

  watchGame(gameId, callback) {
    return this.api.onValue(this.api.ref(this.db, `games/${gameId}`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  async markLobbyReady(gameId) {
    const uid = this.auth.currentUser.uid;
    await this.api.set(this.api.ref(this.db, `games/${gameId}/lobbyReady/${uid}`), true);
  }

  async getGame(gameId) {
    const snapshot = await this.api.get(this.api.ref(this.db, `games/${gameId}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async startGame(gameId, roundPayload) {
    const game = await this.getGame(gameId);
    const playerUpdates = {};
    for (const uid of Object.keys(game.players || {})) playerUpdates[`players/${uid}/locked`] = true;
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      ...playerUpdates,
      currentRound: 1,
      status: "in_progress",
      phase: "answering",
      [`rounds/1`]: { ...roundPayload, number: 1, openedAt: now(), finalized: false },
      updatedAt: now()
    });
  }

  async startNextRound(gameId, roundNumber, roundPayload) {
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      currentRound: roundNumber,
      phase: "answering",
      [`rounds/${roundNumber}`]: {
        ...roundPayload,
        number: roundNumber,
        openedAt: now(),
        finalized: false
      },
      updatedAt: now()
    });
  }

  async submitAnswer(gameId, roundNumber, text) {
    const uid = this.auth.currentUser.uid;
    await this.api.set(this.api.ref(this.db, `games/${gameId}/rounds/${roundNumber}/answers/${uid}`), {
      text: String(text).trim(),
      locked: true,
      submittedAt: now()
    });
  }

  async revealRound(gameId) {
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      phase: "scoring",
      updatedAt: now()
    });
  }

  async confirmScore(gameId, roundNumber, points) {
    const uid = this.auth.currentUser.uid;
    await this.api.set(
      this.api.ref(this.db, `games/${gameId}/rounds/${roundNumber}/scoreClaims/${uid}`),
      { points: Number(points), confirmedAt: now() }
    );
  }

  async finalizeRound(gameId) {
    await this.api.runTransaction(this.api.ref(this.db, `games/${gameId}`), (game) => {
      if (!game || game.rounds?.[game.currentRound]?.finalized) return game;
      const results = calculateRoundResults(game);
      const best = Math.max(...results.map((result) => result.points));
      for (const result of results) {
        game.players[result.uid].totalScore = Number(game.players[result.uid].totalScore || 0) + result.points;
        if (result.points === best) {
          game.players[result.uid].highRoundCount =
            Number(game.players[result.uid].highRoundCount || 0) + 1;
        }
      }
      game.rounds[game.currentRound].results = Object.fromEntries(
        results.map((result) => [result.uid, { ...result, match: result.match || null }])
      );
      game.rounds[game.currentRound].finalized = true;
      game.rounds[game.currentRound].finalizedAt = now();
      game.phase = "recap";
      game.updatedAt = now();
      return game;
    });
  }

  async markReady(gameId, nextRound) {
    const uid = this.auth.currentUser.uid;
    await this.api.set(this.api.ref(this.db, `games/${gameId}/ready/${nextRound}/${uid}`), true);
  }

  async finishGame(gameId) {
    const game = await this.getGame(gameId);
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      status: "finished",
      phase: "finished",
      finishedAt: now(),
      updatedAt: now()
    });
    for (const [playerUid, player] of Object.entries(game.players || {})) {
      await this.api.runTransaction(this.api.ref(this.db, `leaderboard/${playerUid}`), (current) => {
        if (current && Number(current.score || 0) > Number(player.totalScore || 0)) return current;
        return {
          displayName: player.displayName,
          score: Number(player.totalScore || 0),
          gameId,
          gameNumber: game.gameNumber,
          lastPlayedAt: now()
        };
      });
    }
  }

  async updateGameSettings(gameId, updates) {
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), { ...updates, updatedAt: now() });
  }

  async removePlayer(gameId, uid) {
    await this.api.remove(this.api.ref(this.db, `games/${gameId}/players/${uid}`));
  }

  async editFinalScore(gameId, roundNumber, uid, points) {
    await this.api.runTransaction(this.api.ref(this.db, `games/${gameId}`), (game) => {
      const result = game?.rounds?.[roundNumber]?.results?.[uid];
      if (!result) return game;
      const oldPoints = Number(result.points || 0);
      const newPoints = Number(points);
      game.rounds[roundNumber].results[uid].points = newPoints;
      game.rounds[roundNumber].results[uid].hostEdited = true;
      game.players[uid].totalScore = Number(game.players[uid].totalScore || 0) + newPoints - oldPoints;
      for (const player of Object.values(game.players || {})) player.highRoundCount = 0;
      for (const round of Object.values(game.rounds || {})) {
        const roundResults = Object.values(round.results || {});
        if (!round.finalized || !roundResults.length) continue;
        const best = Math.max(...roundResults.map((item) => Number(item.points || 0)));
        for (const item of roundResults) {
          if (Number(item.points || 0) === best && game.players[item.uid]) {
            game.players[item.uid].highRoundCount = Number(game.players[item.uid].highRoundCount || 0) + 1;
          }
        }
      }
      game.updatedAt = now();
      return game;
    });
  }
}
