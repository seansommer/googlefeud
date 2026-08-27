import { APP_CONFIG } from "../config.js";
import {
  TEAM_COLOR_PALETTE,
  VICTORY_MODES,
  aggregateLifetimeStats,
  allPlayersAssignedToTeams,
  buildPlayerGameSummary,
  calculateRoundResults,
  clampNumber,
  lockedPlayerIds,
  makeGameCode,
  makeHostNumber,
  normalizeEmail,
  normalizeNickname,
  now,
  rankLifetimeStats
} from "../core.js";
import { cleanQuestionStarter, promptFromQuery } from "../data/question-bank.js";

const SDK_VERSION = "12.18.0";
const sdkUrl = (service) =>
  `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${service}.js`;

function appError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function makePlayerLoginKey(email, displayName) {
  const source = `${normalizeEmail(email)}|${normalizeNickname(displayName)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
      try {
        this.profile = user ? await this.loadProfileForAuth(user) : null;
        callback(this.profile ? this.toAppUser(user, this.profile) : null, this.profile);
      } catch (error) {
        console.error("Could not restore the signed-in profile.", error);
        // A temporary database read failure should not make a visible session
        // look signed out. Keep the last confirmed profile and let the user retry.
        if (user && this.profile) {
          callback(this.toAppUser(user, this.profile), this.profile);
          return;
        }
        this.profile = null;
        callback(null, null);
      }
    });
  }

  toAppUser(authUser, profile) {
    return {
      uid: profile.profileId,
      authUid: authUser.uid,
      email: profile.email,
      displayName: profile.displayName,
      isAnonymous: authUser.isAnonymous
    };
  }

  identityUid() {
    return this.profile?.profileId || this.auth.currentUser?.uid;
  }

  async loadProfileForAuth(user) {
    let profileId = user.uid;
    if (user.isAnonymous) {
      const session = await this.api.get(this.api.ref(this.db, `sessions/${user.uid}`));
      if (!session.exists()) return null;
      profileId = session.child("profileId").val();
    }
    const profile = await this.getProfile(profileId);
    return profile ? { ...profile, profileId } : null;
  }

  async ensureAnonymousAuth() {
    if (this.auth.currentUser && !this.auth.currentUser.isAnonymous) {
      await this.api.signOut(this.auth);
    }
    if (!this.auth.currentUser) {
      return (await this.api.signInAnonymously(this.auth)).user;
    }
    return this.auth.currentUser;
  }

  validatePlayerInput(email, displayName) {
    if (!normalizeEmail(email) || !normalizeEmail(email).includes("@")) {
      throw appError("INVALID_EMAIL", "Enter a valid email address.");
    }
    if (!normalizeNickname(displayName)) {
      throw appError("INVALID_NICKNAME", "Your nickname needs at least one letter or number.");
    }
  }

  async signUp({ email, displayName }) {
    this.validatePlayerInput(email, displayName);
    const authUser = await this.ensureAnonymousAuth();
    const cleanEmail = normalizeEmail(email);
    const cleanName = String(displayName).trim();
    const loginKey = await makePlayerLoginKey(cleanEmail, cleanName);
    const existing = await this.api.get(this.api.ref(this.db, `loginLookup/${loginKey}`));
    if (existing.exists()) {
      throw appError("PLAYER_EXISTS", "That player already exists. Choose Find Player instead.");
    }

    const profileId = this.api.push(this.api.ref(this.db, "users")).key;
    const profile = {
      displayName: cleanName,
      email: cleanEmail,
      role: "player",
      hostNumber: null,
      authProvider: "anonymous",
      ownerAuthUid: authUser.uid,
      loginKey,
      createdAt: now(),
      updatedAt: now()
    };

    await this.api.set(this.api.ref(this.db, `users/${profileId}`), profile);
    const claim = await this.api.runTransaction(
      this.api.ref(this.db, `loginLookup/${loginKey}`),
      (current) => current || profileId
    );
    if (claim.snapshot.val() !== profileId) {
      await this.api.remove(this.api.ref(this.db, `users/${profileId}`));
      throw appError("PLAYER_EXISTS", "That player was just created. Choose Find Player instead.");
    }
    await this.api.set(this.api.ref(this.db, `sessions/${authUser.uid}`), { profileId, loginKey });
    this.profile = { ...profile, profileId };
    return this.toAppUser(authUser, this.profile);
  }

  async signIn({ email, displayName }) {
    this.validatePlayerInput(email, displayName);
    const authUser = await this.ensureAnonymousAuth();
    const loginKey = await makePlayerLoginKey(email, displayName);
    const lookup = await this.api.get(this.api.ref(this.db, `loginLookup/${loginKey}`));
    if (!lookup.exists()) {
      throw appError("PLAYER_NOT_FOUND", "We did not find that email and nickname together.");
    }
    const profileId = lookup.val();
    await this.api.set(this.api.ref(this.db, `sessions/${authUser.uid}`), { profileId, loginKey });
    const profile = await this.getProfile(profileId);
    if (!profile) throw appError("PLAYER_NOT_FOUND", "That player profile is no longer available.");
    this.profile = { ...profile, profileId };
    return this.toAppUser(authUser, this.profile);
  }

  async signOut() {
    const authUser = this.auth.currentUser;
    if (authUser?.isAnonymous) {
      await this.api.remove(this.api.ref(this.db, `sessions/${authUser.uid}`)).catch(() => {});
    }
    if (authUser) await this.api.signOut(this.auth);
    this.profile = null;
  }

  async getProfile(uid) {
    const snapshot = await this.api.get(this.api.ref(this.db, `users/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async updateDisplayName(displayName) {
    const cleanName = String(displayName || "").trim();
    if (!normalizeNickname(cleanName)) {
      throw appError("INVALID_NICKNAME", "Your nickname needs at least one letter or number.");
    }
    const uid = this.identityUid();
    const oldProfile = this.profile || { ...(await this.getProfile(uid)), profileId: uid };
    const [gamesSnapshot, statsSnapshot] = await Promise.all([
      this.api.get(this.api.ref(this.db, `userGames/${uid}`)),
      this.api.get(this.api.ref(this.db, `playerStats/${uid}`))
    ]);
    const updates = {
      [`users/${uid}/displayName`]: cleanName,
      [`users/${uid}/updatedAt`]: now()
    };
    for (const gameId of Object.keys(gamesSnapshot.val() || {})) {
      updates[`games/${gameId}/players/${uid}/displayName`] = cleanName;
    }
    if (statsSnapshot.exists()) updates[`playerStats/${uid}/displayName`] = cleanName;

    if (oldProfile.authProvider === "anonymous") {
      const newLoginKey = await makePlayerLoginKey(oldProfile.email, cleanName);
      const oldLoginKey = oldProfile.loginKey;
      const collision = await this.api.get(this.api.ref(this.db, `loginLookup/${newLoginKey}`));
      if (collision.exists() && collision.val() !== uid) {
        throw appError("NICKNAME_TAKEN", "That email and nickname combination already belongs to another player.");
      }
      updates[`users/${uid}/loginKey`] = newLoginKey;
      await this.api.update(this.api.ref(this.db), updates);
      if (oldLoginKey !== newLoginKey) {
        await this.api.set(this.api.ref(this.db, `loginLookup/${newLoginKey}`), uid);
        await this.api.set(this.api.ref(this.db, `sessions/${this.auth.currentUser.uid}`), {
          profileId: uid,
          loginKey: newLoginKey
        });
        await this.api.remove(this.api.ref(this.db, `loginLookup/${oldLoginKey}`));
      }
      this.profile = { ...oldProfile, displayName: cleanName, loginKey: newLoginKey, updatedAt: now() };
    } else {
      await Promise.all([
        this.api.updateProfile(this.auth.currentUser, { displayName: cleanName }),
        this.api.update(this.api.ref(this.db), updates)
      ]);
      this.profile = { ...oldProfile, displayName: cleanName, updatedAt: now() };
    }
    return this.profile;
  }

  async listUsers() {
    const snapshot = await this.api.get(this.api.ref(this.db, "users"));
    return snapshot.exists() ? snapshot.val() : {};
  }

  async getMyHostRequest() {
    const uid = this.identityUid();
    const snapshot = await this.api.get(this.api.ref(this.db, `hostRequests/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async requestHostAccess() {
    const uid = this.identityUid();
    const profile = this.profile || (await this.getProfile(uid));
    if (!profile || profile.role !== "player") {
      throw appError("PLAYER_REQUIRED", "Only player accounts need to request host access.");
    }
    const request = {
      displayName: profile.displayName,
      status: "pending",
      requestedAt: now()
    };
    await this.api.set(this.api.ref(this.db, `hostRequests/${uid}`), request);
    return request;
  }

  async cancelHostRequest() {
    const uid = this.identityUid();
    await this.api.remove(this.api.ref(this.db, `hostRequests/${uid}`));
  }

  async listHostRequests() {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can review host requests.");
    }
    const snapshot = await this.api.get(this.api.ref(this.db, "hostRequests"));
    return snapshot.exists() ? snapshot.val() : {};
  }

  async submitQuestion({ query, category }) {
    const uid = this.identityUid();
    const profile = this.profile || (await this.getProfile(uid));
    const cleanQuery = cleanQuestionStarter(query);
    const cleanCategory = String(category || "Community Pick").trim().slice(0, 40) || "Community Pick";
    if (cleanQuery.length < 3 || cleanQuery.length > 100) {
      throw appError("INVALID_QUESTION", "The question starter must be between 3 and 100 characters.");
    }
    const questionId = this.api.push(this.api.ref(this.db, `questionSubmissions/${uid}`)).key;
    const timestamp = now();
    const submission = {
      questionId,
      submittedBy: uid,
      submittedByName: profile?.displayName || "Player",
      category: cleanCategory,
      query: cleanQuery,
      prompt: promptFromQuery(cleanQuery),
      status: "pending",
      submittedAt: timestamp,
      updatedAt: timestamp
    };
    await this.api.set(this.api.ref(this.db, `questionSubmissions/${uid}/${questionId}`), submission);
    return submission;
  }

  async listMyQuestionSubmissions() {
    const uid = this.identityUid();
    const snapshot = await this.api.get(this.api.ref(this.db, `questionSubmissions/${uid}`));
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val())
      .sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
  }

  async listQuestionSubmissions() {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can review submitted questions.");
    }
    const snapshot = await this.api.get(this.api.ref(this.db, "questionSubmissions"));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val()).flatMap(([ownerUid, submissions]) =>
      Object.entries(submissions || {}).map(([questionId, submission]) => ({ ownerUid, questionId, ...submission }))
    ).sort((a, b) => {
      const statusOrder = { pending: 0, approved: 1, declined: 2 };
      return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
        || Number(b.submittedAt || 0) - Number(a.submittedAt || 0);
    });
  }

  async reviewQuestionSubmission(ownerUid, questionId, { query, category, status }) {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can review submitted questions.");
    }
    if (!["pending", "approved", "declined"].includes(status)) {
      throw appError("INVALID_STATUS", "Choose Pending, Approved, or Declined.");
    }
    const cleanQuery = cleanQuestionStarter(query);
    const cleanCategory = String(category || "Community Pick").trim().slice(0, 40) || "Community Pick";
    if (cleanQuery.length < 3 || cleanQuery.length > 100) {
      throw appError("INVALID_QUESTION", "The question starter must be between 3 and 100 characters.");
    }
    const path = `questionSubmissions/${ownerUid}/${questionId}`;
    const currentSnapshot = await this.api.get(this.api.ref(this.db, path));
    if (!currentSnapshot.exists()) throw appError("QUESTION_NOT_FOUND", "That submitted question no longer exists.");
    const timestamp = now();
    const prompt = promptFromQuery(cleanQuery);
    const reviewed = {
      ...currentSnapshot.val(),
      questionId,
      category: cleanCategory,
      query: cleanQuery,
      prompt,
      status,
      reviewedAt: timestamp,
      updatedAt: timestamp
    };
    const approvedPath = `approvedQuestions/${questionId}`;
    await this.api.update(this.api.ref(this.db), {
      [path]: reviewed,
      [approvedPath]: status === "approved" ? {
        id: `custom-${questionId}`,
        category: cleanCategory,
        query: cleanQuery,
        prompt,
        approvedAt: timestamp,
        updatedAt: timestamp
      } : null
    });
    return reviewed;
  }

  async listApprovedQuestions() {
    const snapshot = await this.api.get(this.api.ref(this.db, "approvedQuestions"));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([questionId, question]) => ({ questionId, ...question }))
      .sort((a, b) => String(a.prompt || "").localeCompare(String(b.prompt || ""), undefined, { sensitivity: "base", numeric: true }));
  }

  async dismissHostRequest(uid) {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can dismiss host requests.");
    }
    await this.api.remove(this.api.ref(this.db, `hostRequests/${uid}`));
  }

  async approveHostRequest(uid) {
    const updated = await this.setUserRole(uid, "host");
    await this.dismissHostRequest(uid);
    return updated;
  }

  async setUserRole(uid, role, hostNumber = null) {
    if (!['player', 'host'].includes(role)) {
      throw appError("INVALID_ROLE", "Choose either Player or Host.");
    }
    const targetRef = this.api.ref(this.db, `users/${uid}`);
    try {
      // Realtime Database transactions may invoke their updater before the
      // server value has reached the local cache. Returning undefined for that
      // temporary null aborts the transaction and incorrectly reports that a
      // visible profile disappeared. Verify the record, then atomically patch
      // only the master-managed fields instead.
      const currentSnapshot = await this.api.get(targetRef);
      if (!currentSnapshot.exists()) {
        throw appError("PLAYER_NOT_FOUND", "That player profile no longer exists.");
      }
      const current = currentSnapshot.val();
      await this.api.update(targetRef, {
        role,
        hostNumber: role === "host" ? (hostNumber || current.hostNumber || makeHostNumber(uid)) : null,
        updatedAt: now()
      });
      // Role changes resolve any older pending request. The follow-up is safe
      // to ignore when upgrading from rules that predate the request queue.
      if (this.api.remove) {
        await this.api.remove(this.api.ref(this.db, `hostRequests/${uid}`)).catch(() => {});
      }
    } catch (error) {
      if (error?.code === "PERMISSION_DENIED" || /permission/i.test(String(error?.message || ""))) {
        throw appError("RULES_UPDATE_REQUIRED", "Master Controls needs the newest Firebase Database Rules. Publish the repository rules file in Firebase, refresh, and try again.");
      }
      throw error;
    }
    const updatedSnapshot = await this.api.get(targetRef);
    if (!updatedSnapshot.exists()) {
      throw appError("PLAYER_NOT_FOUND", "That player profile no longer exists.");
    }
    return updatedSnapshot.val();
  }

  async nextGameNumber() {
    const result = await this.api.runTransaction(
      this.api.ref(this.db, "meta/nextGameNumber"),
      (value) => Number(value || 1000) + 1
    );
    return result.snapshot.val();
  }

  async createGame({
    nickname,
    totalRounds,
    roundTimerEnabled = true,
    roundTimerSeconds,
    hostPlays,
    questionQueue,
    suggestionMode,
    questionSources = { original: true, custom: false },
    victoryMode = VICTORY_MODES.POINTS,
    teamMode = false,
    teamNames = []
  }) {
    const uid = this.identityUid();
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
    const cleanTeamNames = teamMode
      ? teamNames.slice(0, 4).map((name, index) => String(name || `Team #${index + 1}`).trim().slice(0, 30))
      : [];
    if (teamMode && cleanTeamNames.length < 2) {
      throw new Error("Team mode needs at least two teams.");
    }
    const teams = teamMode
      ? Object.fromEntries(cleanTeamNames.map((name, index) => [`team${index + 1}`, name || `Team #${index + 1}`]))
      : {};
    const teamColors = teamMode
      ? Object.fromEntries(cleanTeamNames.map((_, index) => [
          `team${index + 1}`,
          TEAM_COLOR_PALETTE[index % TEAM_COLOR_PALETTE.length].id
        ]))
      : {};
    const game = {
      gameId,
      gameNumber,
      code,
      nickname,
      hostUid: uid,
      hostDisplayName: profile.displayName,
      hostNumber: profile.hostNumber || makeHostNumber(uid),
      totalRounds,
      roundTimerEnabled: roundTimerEnabled !== false,
      roundTimerSeconds: clampNumber(
        roundTimerSeconds || APP_CONFIG.defaultRoundSeconds,
        APP_CONFIG.minRoundSeconds,
        APP_CONFIG.maxRoundSeconds
      ),
      currentRound: 0,
      status: "lobby",
      phase: "lobby",
      hostPlays,
      victoryMode: victoryMode === VICTORY_MODES.ROUNDS
        ? VICTORY_MODES.ROUNDS
        : VICTORY_MODES.POINTS,
      teamMode: Boolean(teamMode),
      teams,
      teamColors,
      suggestionMode,
      questionSources: {
        original: questionSources.original !== false,
        custom: Boolean(questionSources.custom)
      },
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
    const uid = this.identityUid();
    const snapshot = await this.api.get(this.api.ref(this.db, `userGames/${uid}`));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([gameId, summary]) => ({ gameId, ...summary }))
      .sort((a, b) => Number(b.createdAt || b.joinedAt || 0) - Number(a.createdAt || a.joinedAt || 0));
  }

  async listAllGames() {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can manage every game record.");
    }
    const snapshot = await this.api.get(this.api.ref(this.db, "games"));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([gameId, game]) => ({ gameId, ...game }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async listHighScores() {
    const snapshot = await this.api.get(this.api.ref(this.db, "leaderboard"));
    if (!snapshot.exists()) return [];
    return Object.entries(snapshot.val())
      .map(([uid, entry]) => ({ uid, ...entry }))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  async listLifetimeStats() {
    const snapshot = await this.api.get(this.api.ref(this.db, "playerStats"));
    if (!snapshot.exists()) return [];
    return rankLifetimeStats(Object.entries(snapshot.val())
      .map(([uid, entry]) => {
        const { gameSummaries, ...stats } = entry;
        return { uid, ...stats };
      }));
  }

  async updateLifetimeStatsForGame(gameId, game) {
    if (!game || game.status !== "finished") return;
    for (const [playerUid, player] of Object.entries(game.players || {})) {
      const gameSummary = buildPlayerGameSummary(game, playerUid);
      await this.api.runTransaction(this.api.ref(this.db, `playerStats/${playerUid}`), (current) => {
        const gameSummaries = { ...(current?.gameSummaries || {}), [gameId]: gameSummary };
        const totals = aggregateLifetimeStats(gameSummaries);
        return {
          // A nickname change updates this public field directly. Preserve that
          // current value when older games are synchronized afterward.
          displayName: current?.displayName || player.displayName,
          ...totals,
          gameSummaries,
          lastGameId: gameId,
          updatedAt: now()
        };
      });
    }
  }

  async syncLifetimeStats() {
    const role = this.profile?.role;
    if (!["host", "master", "admin"].includes(role)) return 0;
    let games = [];
    if (["master", "admin"].includes(role)) {
      const snapshot = await this.api.get(this.api.ref(this.db, "games"));
      games = Object.values(snapshot.val() || {});
    } else {
      const summaries = await this.listMyGames();
      const hosted = summaries.filter((summary) => summary.role === "host");
      games = (await Promise.all(hosted.map((summary) => this.getGame(summary.gameId)))).filter(Boolean);
    }
    const finishedGames = games
      .filter((game) => game.status === "finished")
      .sort((a, b) => Number(a.finishedAt || a.createdAt || 0) - Number(b.finishedAt || b.createdAt || 0));
    for (const game of finishedGames) await this.updateLifetimeStatsForGame(game.gameId, game);
    return finishedGames.length;
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

    const uid = this.identityUid();
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
      [`userGames/${uid}/${game.gameId}`]: {
        code: game.code,
        nickname: game.nickname,
        role: "player",
        joinedAt: now()
      }
    });
    return { ...game, players: { ...(game.players || {}), [uid]: player } };
  }

  async selectTeam(gameId, teamId) {
    const game = await this.getGame(gameId);
    const uid = this.identityUid();
    if (!game || game.status !== "lobby") throw new Error("Teams are locked after the game starts.");
    if (!game.teamMode || !Object.prototype.hasOwnProperty.call(game.teams || {}, teamId)) {
      throw new Error("Choose one of the teams in this game.");
    }
    if (!game.players?.[uid]) throw new Error("Only contestants can join a team.");
    await this.api.set(this.api.ref(this.db, `games/${gameId}/players/${uid}/teamId`), teamId);
  }

  async renameTeam(gameId, teamId, name) {
    const cleanName = String(name || "").trim();
    if (!cleanName || cleanName.length > 30) throw new Error("Team names must contain 1–30 characters.");
    const game = await this.getGame(gameId);
    if (!game?.teamMode || !Object.prototype.hasOwnProperty.call(game.teams || {}, teamId)) {
      throw new Error("That team no longer exists.");
    }
    await this.api.set(this.api.ref(this.db, `games/${gameId}/teams/${teamId}`), cleanName);
  }

  async setTeamColor(gameId, teamId, colorId) {
    if (!TEAM_COLOR_PALETTE.some((color) => color.id === colorId)) {
      throw new Error("Choose one of the available team colors.");
    }
    const game = await this.getGame(gameId);
    const actorUid = this.identityUid();
    if (!game?.teamMode || !Object.prototype.hasOwnProperty.call(game.teams || {}, teamId)) {
      throw new Error("That team no longer exists.");
    }
    const canManage = game.hostUid === actorUid
      || ["master", "admin"].includes(this.profile?.role)
      || game.players?.[actorUid]?.teamId === teamId;
    if (!canManage) throw new Error("You can choose a color only for your own team.");
    await this.api.set(this.api.ref(this.db, `games/${gameId}/teamColors/${teamId}`), colorId);
  }

  async deleteGame(gameId) {
    if (!["master", "admin"].includes(this.profile?.role)) {
      throw appError("MASTER_REQUIRED", "Only the master account can permanently delete games.");
    }

    const [gamesSnapshot, statsSnapshot, leaderboardSnapshot, userGamesSnapshot] = await Promise.all([
      this.api.get(this.api.ref(this.db, "games")),
      this.api.get(this.api.ref(this.db, "playerStats")),
      this.api.get(this.api.ref(this.db, "leaderboard")),
      this.api.get(this.api.ref(this.db, "userGames"))
    ]);
    const allGames = gamesSnapshot.val() || {};
    const game = allGames[gameId];
    if (!game) throw new Error("That game has already been deleted.");

    const playerStats = statsSnapshot.val() || {};
    const leaderboard = leaderboardSnapshot.val() || {};
    const affectedPlayerIds = new Set(Object.keys(game.players || {}));
    for (const [playerUid, stats] of Object.entries(playerStats)) {
      if (stats?.gameSummaries?.[gameId]) affectedPlayerIds.add(playerUid);
    }
    for (const [playerUid, entry] of Object.entries(leaderboard)) {
      if (entry?.gameId === gameId) affectedPlayerIds.add(playerUid);
    }

    const updates = {
      [`games/${gameId}`]: null
    };
    if (game.code) updates[`gameCodes/${game.code}`] = null;
    for (const [playerUid, games] of Object.entries(userGamesSnapshot.val() || {})) {
      if (games?.[gameId]) updates[`userGames/${playerUid}/${gameId}`] = null;
    }

    for (const playerUid of affectedPlayerIds) {
      const current = playerStats[playerUid] || {};
      const gameSummaries = Object.fromEntries(
        Object.entries(allGames)
          .filter(([otherGameId, otherGame]) => otherGameId !== gameId
            && otherGame?.status === "finished"
            && otherGame?.players?.[playerUid])
          .map(([otherGameId, otherGame]) => [
            otherGameId,
            buildPlayerGameSummary({ ...otherGame, gameId: otherGameId }, playerUid)
          ])
      );
      const remaining = Object.entries(gameSummaries);
      if (!remaining.length) {
        updates[`playerStats/${playerUid}`] = null;
        updates[`leaderboard/${playerUid}`] = null;
        continue;
      }

      const totals = aggregateLifetimeStats(gameSummaries);
      const latest = remaining
        .slice()
        .sort(([, a], [, b]) => Number(b.finishedAt || 0) - Number(a.finishedAt || 0)
          || Number(b.gameNumber || 0) - Number(a.gameNumber || 0))[0];
      const bestSummary = gameSummaries[totals.bestGameId] || {};
      const displayName = current.displayName
        || game.players?.[playerUid]?.displayName
        || leaderboard[playerUid]?.displayName
        || "Player";
      updates[`playerStats/${playerUid}`] = {
        displayName,
        ...totals,
        gameSummaries,
        lastGameId: latest[0],
        updatedAt: now()
      };
      updates[`leaderboard/${playerUid}`] = {
        displayName,
        score: Number(totals.bestGameScore || 0),
        gameId: totals.bestGameId,
        gameNumber: Number(bestSummary.gameNumber || totals.bestGameNumber || 0),
        lastPlayedAt: Number(bestSummary.finishedAt || totals.lastPlayedAt || 0)
      };
    }

    await this.api.update(this.api.ref(this.db), updates);
    return {
      gameId,
      gameNumber: game.gameNumber,
      nickname: game.nickname,
      affectedPlayers: affectedPlayerIds.size
    };
  }

  watchGame(gameId, callback) {
    return this.api.onValue(this.api.ref(this.db, `games/${gameId}`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  async markLobbyReady(gameId) {
    const uid = this.identityUid();
    const game = await this.getGame(gameId);
    if (game?.teamMode && !game.teams?.[game.players?.[uid]?.teamId]) {
      throw new Error("Choose your team before marking yourself ready.");
    }
    await this.api.set(this.api.ref(this.db, `games/${gameId}/lobbyReady/${uid}`), true);
  }

  async getGame(gameId) {
    const snapshot = await this.api.get(this.api.ref(this.db, `games/${gameId}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async startGame(gameId, roundPayload) {
    const game = await this.getGame(gameId);
    if (!allPlayersAssignedToTeams(game)) {
      throw new Error("Every contestant must choose a team before the game can start.");
    }
    const playerUpdates = {};
    for (const uid of Object.keys(game.players || {})) playerUpdates[`players/${uid}/locked`] = true;
    const openedAt = now();
    const timerEnabled = game.roundTimerEnabled !== false;
    const durationSeconds = clampNumber(
      game.roundTimerSeconds || APP_CONFIG.defaultRoundSeconds,
      APP_CONFIG.minRoundSeconds,
      APP_CONFIG.maxRoundSeconds
    );
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      ...playerUpdates,
      currentRound: 1,
      status: "in_progress",
      phase: "answering",
      [`rounds/1`]: {
        ...roundPayload,
        number: 1,
        openedAt,
        timerEnabled,
        ...(timerEnabled ? {
          durationSeconds,
          deadlineAt: openedAt + durationSeconds * 1000
        } : {}),
        finalized: false
      },
      updatedAt: now()
    });
  }

  async startNextRound(gameId, roundNumber, roundPayload) {
    const game = await this.getGame(gameId);
    const openedAt = now();
    const timerEnabled = game.roundTimerEnabled !== false;
    const durationSeconds = clampNumber(
      game.roundTimerSeconds || APP_CONFIG.defaultRoundSeconds,
      APP_CONFIG.minRoundSeconds,
      APP_CONFIG.maxRoundSeconds
    );
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      currentRound: roundNumber,
      phase: "answering",
      [`rounds/${roundNumber}`]: {
        ...roundPayload,
        number: roundNumber,
        openedAt,
        timerEnabled,
        ...(timerEnabled ? {
          durationSeconds,
          deadlineAt: openedAt + durationSeconds * 1000
        } : {}),
        finalized: false
      },
      updatedAt: now()
    });
  }

  async submitAnswer(gameId, roundNumber, text, timedOut = false) {
    const uid = this.identityUid();
    await this.api.set(this.api.ref(this.db, `games/${gameId}/rounds/${roundNumber}/answers/${uid}`), {
      text: String(text).trim() || "No answer",
      locked: true,
      submittedAt: now(),
      ...(timedOut ? { timedOut: true } : {})
    });
  }

  async expireAnsweringRound(gameId, roundNumber) {
    await this.api.runTransaction(this.api.ref(this.db, `games/${gameId}`), (game) => {
      if (!game || game.phase !== "answering" || Number(game.currentRound) !== Number(roundNumber)) {
        return game;
      }
      const round = game.rounds?.[roundNumber];
      if (!round || round.timerEnabled === false || Number(round.deadlineAt || 0) > now()) return game;
      round.answers ||= {};
      for (const uid of lockedPlayerIds(game)) {
        if (!round.answers[uid]?.locked) {
          round.answers[uid] = {
            text: "No answer",
            locked: true,
            timedOut: true,
            submittedAt: now()
          };
        }
      }
      game.phase = "scoring";
      game.updatedAt = now();
      return game;
    });
  }

  async revealRound(gameId) {
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      phase: "scoring",
      updatedAt: now()
    });
  }

  async confirmScore(gameId, roundNumber, points, selectedAnswerIndex = null) {
    const uid = this.identityUid();
    const claim = { points: Number(points), confirmedAt: now() };
    if (Number.isInteger(selectedAnswerIndex) && selectedAnswerIndex >= 0 && selectedAnswerIndex < 7) {
      claim.selectedAnswerIndex = selectedAnswerIndex;
    }
    await this.api.set(
      this.api.ref(this.db, `games/${gameId}/rounds/${roundNumber}/scoreClaims/${uid}`),
      claim
    );
  }

  async finalizeRound(gameId) {
    await this.api.runTransaction(this.api.ref(this.db, `games/${gameId}`), (game) => {
      if (!game || game.rounds?.[game.currentRound]?.finalized) return game;
      const results = calculateRoundResults(game);
      const best = Math.max(...results.map((result) => result.points));
      for (const result of results) {
        game.players[result.uid].totalScore = Number(game.players[result.uid].totalScore || 0) + result.points;
        if (best > 0 && result.points === best) {
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
    const uid = this.identityUid();
    await this.api.set(this.api.ref(this.db, `games/${gameId}/ready/${nextRound}/${uid}`), true);
  }

  async finishGame(gameId) {
    const game = await this.getGame(gameId);
    const finishedAt = now();
    await this.api.update(this.api.ref(this.db, `games/${gameId}`), {
      status: "finished",
      phase: "finished",
      finishedAt,
      updatedAt: finishedAt
    });
    const finishedGame = { ...game, status: "finished", phase: "finished", finishedAt, updatedAt: finishedAt };
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
    try {
      await this.updateLifetimeStatsForGame(gameId, finishedGame);
    } catch (error) {
      // Finishing the live game must still succeed if the newly added stats
      // rules have not been published yet. A host/master sync repairs it later.
      console.error("Lifetime stats will be synchronized later.", error);
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
          if (best > 0 && Number(item.points || 0) === best && game.players[item.uid]) {
            game.players[item.uid].highRoundCount = Number(game.players[item.uid].highRoundCount || 0) + 1;
          }
        }
      }
      game.updatedAt = now();
      return game;
    });
    const updatedGame = await this.getGame(gameId);
    if (updatedGame?.status === "finished") {
      try {
        await this.updateLifetimeStatsForGame(gameId, updatedGame);
      } catch (error) {
        console.error("Lifetime stats will be synchronized later.", error);
      }
    }
  }
}
