import { APP_CONFIG, isFirebaseConfigured, isLiveSuggestionsConfigured } from "./config.js";
import {
  allPlayersReady,
  allPlayersAssignedToTeams,
  allPlayersSubmitted,
  allScoresConfirmed,
  calculateTeamStandings,
  calculateRoundResults,
  escapeHtml,
  findAnswerMatch,
  formatDate,
  formatGameNumber,
  getRound,
  getTeamWinners,
  lockedPlayerIds,
  sortLeaderboard,
  summarizeGame
} from "./core.js";
import { buildQuestionQueue } from "./data/question-bank.js";
import { soundEffects } from "./services/effects.js";
import { FirebaseGameService } from "./services/firebase-service.js";
import { fetchLiveSuggestions } from "./services/live-suggestions.js";
import { sessionStore } from "./services/storage.js";

const root = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const state = {
  service: null,
  user: null,
  profile: null,
  game: null,
  gameId: null,
  unsubscribeGame: null,
  carouselRound: 1,
  users: null,
  myGames: null,
  highScores: null,
  highScoresError: "",
  lifetimeStats: null,
  lifetimeStatsError: "",
  lifetimeStatsLoading: false,
  lifetimeStatsSynced: false,
  playedEffects: new Set(),
  roundTimerInterval: null,
  timerActions: new Set()
};

const uid = () => state.user?.uid;
const isHost = () =>
  Boolean(state.game && (state.game.hostUid === uid() || ["master", "admin"].includes(state.profile?.role)));
const isPlayer = () => Boolean(state.game?.players?.[uid()]);
const modeBadge = () => `<span class="pill live"><span class="live-dot"></span>Live game</span>`;

function playOnce(key, callback) {
  if (state.playedEffects.has(key)) return;
  state.playedEffects.add(key);
  callback();
}

function navigate(path) {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 4300);
}

function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  const isSelect = button.tagName === "SELECT";
  if (busy) {
    button.dataset.wasDisabled = String(button.disabled);
    if (!isSelect) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel;
    }
    button.disabled = true;
    button.classList.add("is-busy");
  } else {
    if (!isSelect) button.textContent = button.dataset.label || button.textContent;
    button.disabled = button.dataset.wasDisabled === "true";
    button.classList.remove("is-busy");
  }
}

async function runAction(button, action, busyLabel) {
  try {
    setBusy(button, true, busyLabel);
    await action();
  } catch (error) {
    console.error(error);
    const authSetupBlocked = error.code === "auth/operation-not-allowed"
      || error.code === "auth/admin-restricted-operation"
      || String(error.message || "").includes("ADMIN_ONLY_OPERATION");
    const message = authSetupBlocked
      ? "Live player entry needs Anonymous Authentication enabled in Firebase."
      : error.message || "Something went wrong.";
    toast(message, "error");
  } finally {
    setBusy(button, false);
  }
}

function topbar() {
  return `
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="${escapeHtml(APP_CONFIG.title)} home">
        <span class="brand-badge">?</span><span>${escapeHtml(APP_CONFIG.title)}</span>
      </a>
      <div class="top-actions">
        ${state.user ? `<span class="user-chip">${escapeHtml(state.profile?.displayName || "Player")}</span>` : ""}
        <button id="sound-toggle" class="btn btn-ghost btn-small sound-toggle" type="button" aria-label="Toggle game sounds"><span class="sound-icon" aria-hidden="true">${soundEffects.enabled ? "🔊" : "🔇"}</span><span class="sound-label">${soundEffects.enabled ? "SOUND ON" : "SOUND OFF"}</span></button>
        ${state.game ? `<button id="refresh-game" class="btn btn-secondary btn-small refresh-game" type="button" aria-label="Refresh live game">↻ <span class="refresh-label">REFRESH</span></button>` : ""}
        ${state.game && state.user ? `<span class="top-action-divider" aria-hidden="true"></span>` : ""}
        ${state.user ? `<button id="account-menu" class="btn btn-ghost btn-small">Menu</button>` : `<a class="btn btn-ghost btn-small" href="#/auth">Sign in</a>`}
      </div>
    </header>`;
}

function legalFooter() {
  return `<footer class="legal-footer">${escapeHtml(APP_CONFIG.officialDisclaimer)}</footer>`;
}

function layout(content, pageClass = "") {
  clearInterval(state.roundTimerInterval);
  state.roundTimerInterval = null;
  root.innerHTML = `<div class="app-shell">${topbar()}<main class="page ${pageClass}">${content}${legalFooter()}</main></div>`;
  document.querySelector("#account-menu")?.addEventListener("click", showAccountMenu);
  document.querySelector("#sound-toggle")?.addEventListener("click", (event) => {
    const enabled = soundEffects.toggle();
    event.currentTarget.querySelector(".sound-icon").textContent = enabled ? "🔊" : "🔇";
    event.currentTarget.querySelector(".sound-label").textContent = enabled ? "SOUND ON" : "SOUND OFF";
    event.currentTarget.classList.toggle("muted-sound", !enabled);
  });
  document.querySelector("#refresh-game")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await runAction(event.currentTarget, async () => {
      const freshGame = await state.service.getGame(state.gameId || state.game?.gameId);
      if (!freshGame) throw new Error("This game room is no longer available.");
      state.game = freshGame;
      render();
      toast("Live game refreshed.", "success");
    }, "↻");
  });
  document.querySelectorAll(".team-name-button").forEach((button) => button.addEventListener("click", async (event) => {
    const nextName = window.prompt("Choose a new team name (1–30 characters):", button.dataset.teamName || "")?.trim();
    if (!nextName || nextName === button.dataset.teamName) return;
    await runAction(event.currentTarget, () => state.service.renameTeam(state.gameId || state.game?.gameId, button.dataset.teamId, nextName), "Saving…");
  }));
}

function showAccountMenu() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal-backdrop" id="account-modal">
      <div class="modal">
        <h2>${escapeHtml(state.profile?.displayName || "Player")}</h2>
        <p>${escapeHtml(state.profile?.role || "player")} profile</p>
        <form id="nickname-form" class="form-grid">
          <div class="field"><label for="account-nickname">Change nickname</label><input class="input" id="account-nickname" name="displayName" maxlength="30" value="${escapeHtml(state.profile?.displayName || "")}" required autocomplete="nickname" /></div>
          <button class="btn btn-secondary" type="submit">SAVE NICKNAME</button>
        </form>
        <div class="divider"></div>
        <div class="button-stack">
          <a class="btn btn-primary" href="#/host">Game dashboard</a>
          <a class="btn btn-secondary" href="#/hall-of-fame">🏆 Hall of Fame</a>
          ${["master", "admin"].includes(state.profile?.role) ? `<a class="btn btn-secondary" href="#/admin">Master controls</a>` : ""}
          <button class="btn btn-ghost" id="close-account">Close</button>
          <button class="btn btn-danger" id="sign-out">Sign out</button>
        </div>
      </div>
    </div>`
  );
  document.querySelector("#close-account").onclick = () => document.querySelector("#account-modal")?.remove();
  document.querySelectorAll("#account-modal a").forEach((link) =>
    link.addEventListener("click", () => document.querySelector("#account-modal")?.remove())
  );
  document.querySelector("#account-modal").addEventListener("click", (event) => {
    if (event.target.id === "account-modal") event.currentTarget.remove();
  });
  document.querySelector("#nickname-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = new FormData(event.currentTarget).get("displayName")?.trim();
    await runAction(event.submitter, async () => {
      const profile = await state.service.updateDisplayName(displayName);
      state.profile = profile;
      state.user = { ...state.user, displayName: profile.displayName };
      state.users = null;
      state.lifetimeStats = null;
      document.querySelector("#account-modal")?.remove();
      toast("Nickname updated.", "success");
      render();
    }, "Saving…");
  });
  document.querySelector("#sign-out").onclick = async (event) => {
    await runAction(event.currentTarget, async () => {
      await state.service.signOut();
      state.user = null;
      state.profile = null;
      state.myGames = null;
      state.highScores = null;
      state.lifetimeStats = null;
      state.lifetimeStatsError = "";
      state.lifetimeStatsSynced = false;
      state.game = null;
      state.unsubscribeGame?.();
      document.querySelector("#account-modal")?.remove();
      navigate("/home");
    }, "Signing out…");
  };
}

function renderHome() {
  layout(
    `${celebrationPieces(22, "home-confetti")}<section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">The autocomplete party game</p>
        <h1>GOOGLE <span class="accent">FUED</span></h1>
        <p class="tagline">${escapeHtml(APP_CONFIG.tagline)}</p>
        <p class="disclaimer">${escapeHtml(APP_CONFIG.funnyDisclaimer)}</p>
        <div class="button-row center">
          <a class="btn btn-secondary" href="#/instructions">How to Play</a>
          <a class="btn btn-ghost" href="${state.user ? "#/host" : "#/auth?next=host&access=host"}">Host Login</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="game-kicker">${modeBadge()}<span class="pill">Family friendly</span></div>
        <div class="panel-header">
          <h2>Ready to feud?</h2>
          <p>Sign in, enter the six-character room code, and get your best guess ready.</p>
        </div>
        <div class="button-stack">
          <a class="btn btn-main" href="#/join">JOIN GAME</a>
          ${!state.user ? `<a class="btn btn-primary" href="#/auth?next=join">PLAYER SIGN IN</a>` : `<a class="btn btn-primary" href="#/host">Open My Dashboard</a>`}
          ${state.user ? `<a class="btn btn-secondary" href="#/hall-of-fame">🏆 VIEW HALL OF FAME</a>` : ""}
        </div>
        <div class="divider"></div>
        <p class="muted center-text" style="font-size:12px;margin:0">No downloads. Phones, tablets, and computers can all play together.</p>
      </div>
    </section>`,
    ""
  );
}

function renderInstructions() {
  layout(
    `<section class="section-heading"><div><p class="eyebrow">Rules of play</p><h1>How to Play</h1><p>Seven answers are on the board. How high can your guess climb?</p></div></section>
    <div class="panel glow">
      <div class="instruction-list">
        <div class="instruction-step"><div><h3>Join the room</h3><p>Create a player, enter the host's six-character game code, and join the lobby.</p></div></div>
        <div class="instruction-step"><div><h3>Choose your team when enabled</h3><p>In a teams game, pick one of the host's teams before getting ready. Your score still ranks individually and also powers your team.</p></div></div>
        <div class="instruction-step"><div><h3>Read the unfinished search</h3><p>Each round gives everyone the same prompt, such as “How to ____.”</p></div></div>
        <div class="instruction-step"><div><h3>Lock in one answer</h3><p>Type the ending you think appears in the autocomplete list. Confirm carefully—answers lock after final submission.</p></div></div>
        <div class="instruction-step"><div><h3>Reveal the seven</h3><p>When everyone submits, the ranked answer board appears. First place is worth 10 points, followed by 7, 5, 4, 3, 2, and 1.</p></div></div>
        <div class="instruction-step"><div><h3>Confirm your score</h3><p>The game suggests a score from an exact normalized match. Players may override it when the room agrees an answer deserves credit.</p></div></div>
        <div class="instruction-step"><div><h3>Win the game</h3><p>After the host's chosen number of rounds, the highest total wins. Tied winners share the spotlight.</p></div></div>
      </div>
      <div class="divider"></div>
      <div class="notice warning"><span>💡</span><span>Spelling, punctuation, and capitalization are ignored for matching. Different wording is left for the players and host to judge.</span></div>
      <div class="spacer"></div>
      <div class="button-row center"><a class="btn btn-main" href="#/join">JOIN A GAME</a><a class="btn btn-ghost" href="#/home">Back Home</a></div>
    </div>`,
    "compact"
  );
}

function getHashParts() {
  const raw = window.location.hash.slice(1) || "/home";
  const [path, queryString = ""] = raw.split("?");
  return { segments: path.split("/").filter(Boolean), params: new URLSearchParams(queryString) };
}

function requireAuth(nextPath = "home") {
  if (state.user) return true;
  navigate(`/auth?next=${encodeURIComponent(nextPath)}`);
  return false;
}

function renderAuth(params) {
  const signup = params.get("mode") === "signup";
  const next = params.get("next") || "join";
  const hostAccess = params.get("access") === "host";
  const savedEmail = params.get("email") || "";
  const savedNickname = params.get("nickname") || "";
  layout(
    `<div class="panel glow">
      <div class="tabs">
        <button id="login-tab" class="tab ${signup ? "" : "active"}">Find Player</button>
        <button id="signup-tab" class="tab ${signup ? "active" : ""}">Create Player</button>
      </div>
      <div class="panel-header">
        <h1>${signup ? "Create your player" : hostAccess ? "Host Login" : "Welcome back"}</h1>
        <p>${signup ? "No password is needed. Your nickname can be changed later." : "Enter the email and nickname on your profile."}</p>
      </div>
      ${signup && params.get("missing") === "1" ? `<div class="notice warning"><span>👋</span><span>We did not find that email and nickname together. Confirm the information below to create a new player.</span></div><div class="spacer"></div>` : ""}
      <form id="auth-form" class="form-grid">
        <div class="field"><label for="email">Email <span class="label-note">(not shown; a made-up email is okay)</span></label><input class="input" id="email" name="email" type="email" required autocomplete="email" value="${escapeHtml(savedEmail)}" /></div>
        <div class="field"><label for="display-name">Nickname (Display Name)</label><input class="input" id="display-name" name="displayName" maxlength="30" required autocomplete="nickname" value="${escapeHtml(savedNickname)}" placeholder="What should the room call you?" /></div>
        <p class="field-help">Family trust mode: use the same email and display name next time. The email is never displayed in the game.</p>
        <button class="btn btn-main" type="submit">${signup ? "CREATE MY PLAYER" : "CONTINUE"}</button>
      </form>
    </div>`,
    "narrow"
  );
  document.querySelector("#login-tab").onclick = () => navigate(`/auth?next=${encodeURIComponent(next)}${hostAccess ? "&access=host" : ""}`);
  document.querySelector("#signup-tab").onclick = () => navigate(`/auth?mode=signup&next=${encodeURIComponent(next)}${hostAccess ? "&access=host" : ""}`);
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await runAction(button, async () => {
      let user;
      try {
        user = signup ? await state.service.signUp(values) : await state.service.signIn(values);
      } catch (error) {
        if (!signup && error.code === "PLAYER_NOT_FOUND") {
          const query = new URLSearchParams({
            mode: "signup",
            missing: "1",
            next,
            email: values.email,
            nickname: values.displayName
          });
          if (hostAccess) query.set("access", "host");
          navigate(`/auth?${query}`);
          return;
        }
        throw error;
      }
      if (!user) return;
      state.user = user;
      state.profile = state.service.profile;
      state.myGames = null;
      state.highScores = null;
      state.highScoresError = "";
      state.lifetimeStats = null;
      state.lifetimeStatsError = "";
      state.lifetimeStatsSynced = false;
      toast(signup ? "Your player is ready—no password needed!" : "You're signed in.", "success");
      navigate(`/${next}`);
    }, signup ? "Creating…" : "Signing in…");
  });
}

function renderHostDashboard() {
  if (!requireAuth("host")) return;
  const canHost = ["host", "master", "admin"].includes(state.profile?.role);
  const activeGameId = sessionStore.getActiveGame();
  if (state.myGames === null) {
    state.service.listMyGames().then((games) => {
      state.myGames = games;
      if (window.location.hash.startsWith("#/host")) renderHostDashboard();
    }).catch(() => { state.myGames = []; });
  }
  if (state.highScores === null) {
    state.service.listHighScores().then((scores) => {
      state.highScores = scores;
      state.highScoresError = "";
      if (window.location.hash.startsWith("#/host")) renderHostDashboard();
    }).catch((error) => {
      console.error("Could not load high scores.", error);
      state.highScores = [];
      state.highScoresError = "High scores could not be loaded. Publish the latest Firebase Database Rules, then refresh.";
      if (window.location.hash.startsWith("#/host")) renderHostDashboard();
    });
  }
  const recentGames = state.myGames || [];
  const highScores = state.highScores || [];
  layout(
    `<section class="section-heading">
      <div><p class="eyebrow">Host center</p><h1>Hello, ${escapeHtml(state.profile?.displayName || "Host")}</h1><p>${canHost ? `Host ${escapeHtml(state.profile?.hostNumber || "Master")}` : "Player account"}</p></div>
      ${modeBadge()}
    </section>
    ${!canHost ? `<div class="panel"><h2>Host approval needed</h2><p class="muted">Your player account works now. The master user must promote it before it can create games.</p><a class="btn btn-main" href="#/join">JOIN A GAME</a></div>` : `
      <div class="stats-grid">
        <div class="stat"><span class="stat-value">7</span><span class="stat-label">Answers per round</span></div>
        <div class="stat"><span class="stat-value">16</span><span class="stat-label">Player capacity</span></div>
        <div class="stat"><span class="stat-value">10</span><span class="stat-label">Top points</span></div>
      </div>
      <div class="spacer"></div>
      <div class="panel glow">
        <div class="panel-header"><h2>Start the show</h2><p>Create a new room or enter a code for an existing game you host.</p></div>
        <div class="button-stack">
          <a class="btn btn-main" href="#/create">CREATE NEW GAME</a>
          ${activeGameId ? `<a class="btn btn-primary" href="#/game/${encodeURIComponent(activeGameId)}/lobby">Resume Last Game</a>` : ""}
          <a class="btn btn-secondary" href="#/join">Enter Game Code</a>
          <a class="btn btn-secondary" href="#/hall-of-fame">🏆 Open Hall of Fame</a>
          ${["master", "admin"].includes(state.profile?.role) ? `<a class="btn btn-ghost" href="#/admin">Manage Host Accounts</a>` : ""}
        </div>
      </div>`}
      <div class="panel">
        <div class="panel-header"><h2>Previous Games</h2><p>Reopen a game to review its details, rounds, and final scores.</p></div>
        ${state.myGames === null ? `<div class="empty-state">Loading game history…</div>` : recentGames.length ? `<div class="player-list">${recentGames.slice(0, 10).map((game) => `<a class="player-row" style="color:inherit;text-decoration:none" href="#/game/${encodeURIComponent(game.gameId)}/details">${playerAvatar(game.nickname)}<div class="player-copy"><strong>${escapeHtml(game.nickname)}</strong><span>Code ${escapeHtml(game.code)} · ${escapeHtml(game.role)}</span></div><span class="player-status">OPEN</span></a>`).join("")}</div>` : `<div class="empty-state"><strong>No previous games yet</strong>Your first room will appear here.</div>`}
      </div>
      <div class="panel">
        <div class="panel-header"><h2>All-Time High Scores</h2><p>Each player's best completed-game total.</p></div>
        ${state.highScores === null ? `<div class="empty-state">Loading high scores…</div>` : state.highScoresError ? `<div class="notice warning"><span>!</span><span>${escapeHtml(state.highScoresError)}</span></div>` : highScores.length ? `<div class="leaderboard">${highScores.slice(0, 10).map((entry, index) => `<div class="leader-row"><span class="rank">${index + 1}</span>${playerAvatar(entry.displayName)}<div class="player-copy"><strong>${escapeHtml(entry.displayName)}</strong><span>${escapeHtml(formatGameNumber({ gameNumber: entry.gameNumber }))}</span></div><div class="score"><strong>${entry.score}</strong><span>best</span></div></div>`).join("")}</div>` : `<div class="empty-state"><strong>No high scores yet</strong>Finish a game to claim the board.</div>`}
      </div>
    `,
    "compact"
  );
}

function formatHallValue(category, rawValue) {
  const value = Number(rawValue || 0);
  if (category.id === "average") return `${value.toFixed(2)} pts / round`;
  if (category.id === "streak") return `${value} round${value === 1 ? "" : "s"} straight`;
  if (category.id === "single-game") return `${value} points in one game`;
  if (category.id === "total-points") return `${value} lifetime points`;
  if (category.id === "rounds-played") return `${value} rounds played`;
  return `${value} rounds won`;
}

function buildHallCategories(stats) {
  const definitions = [
    { id: "total-points", title: "Most Points Scored", subtitle: "The all-time points champion", field: "totalPoints", trophy: "🏆" },
    { id: "rounds-played", title: "Most Rounds Played", subtitle: "Always ready for another round", field: "roundsPlayed", trophy: "🎟️" },
    { id: "rounds-won", title: "Most Rounds Won", subtitle: "The board-beating specialist", field: "roundsWon", trophy: "👑" },
    { id: "average", title: "Highest Average", subtitle: "Best points per completed round", field: "averagePointsPerRound", trophy: "📈" },
    { id: "single-game", title: "Highest Single Game", subtitle: "The biggest one-game score", field: "bestGameScore", trophy: "⚡" },
    { id: "streak", title: "Longest Win Streak", subtitle: "Most scoring rounds won in a row", field: "bestRoundWinStreak", trophy: "🔥" }
  ];
  return definitions.map((category) => {
    const highest = Math.max(0, ...stats.map((player) => Number(player[category.field] || 0)));
    const winners = highest > 0
      ? stats.filter((player) => Number(player[category.field] || 0) === highest)
      : [];
    return { ...category, highest, winners };
  });
}

function hallAwardCard(category, featured = false) {
  const names = category.winners.map((winner) => winner.displayName).join(" & ");
  return `<button class="hall-award-card ${featured ? "featured" : ""} ${category.winners.length ? "has-winner" : "awaiting"}" type="button" data-hall-category="${escapeHtml(category.id)}" ${category.winners.length ? "" : "disabled"}>
    <span class="hall-trophy" aria-hidden="true"><span>🏆</span><small>${category.trophy}</small></span>
    <span class="hall-award-copy"><span class="hall-category-label">${escapeHtml(category.subtitle)}</span><strong>${escapeHtml(category.title)}</strong><span class="hall-winner-name">${category.winners.length ? escapeHtml(names) : "The trophy is waiting…"}</span></span>
    <span class="hall-record-value">${category.winners.length ? escapeHtml(formatHallValue(category, category.highest)) : "No record yet"}</span>
    ${category.winners.length ? `<span class="hall-tap-hint">Tap to celebrate ✨</span>` : ""}
  </button>`;
}

function showHallCelebration(category) {
  if (!category?.winners?.length) return;
  document.querySelector("#hall-celebration")?.remove();
  const names = category.winners.map((winner) => winner.displayName).join(" & ");
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop hall-celebration" id="hall-celebration">
    ${celebrationPieces(68, "hall-confetti")}
    <div class="modal hall-winner-modal center-text">
      <div class="hall-modal-rays" aria-hidden="true"></div>
      <div class="hall-modal-trophy" aria-hidden="true">🏆</div>
      <p class="eyebrow">Hall of Fame Champion</p>
      <h2>${escapeHtml(category.title)}</h2>
      <div class="hall-modal-winner">${escapeHtml(names)}</div>
      <p>${escapeHtml(formatHallValue(category, category.highest))}</p>
      ${category.winners.length > 1 ? `<p class="muted">A legendary tie—every co-champion keeps the trophy.</p>` : `<p class="muted">This record belongs in the spotlight.</p>`}
      <button class="btn btn-main" id="close-hall-celebration" type="button">BACK TO THE TROPHY ROOM</button>
    </div>
  </div>`);
  soundEffects.finale();
  const close = () => document.querySelector("#hall-celebration")?.remove();
  document.querySelector("#close-hall-celebration").onclick = close;
  document.querySelector("#hall-celebration").addEventListener("click", (event) => {
    if (event.target.id === "hall-celebration") close();
  });
}

function showLifetimePlayerCard(player) {
  document.querySelector("#lifetime-player-modal")?.remove();
  const roundsPlayed = Number(player.roundsPlayed || 0);
  const winRate = roundsPlayed ? (Number(player.roundsWon || 0) / roundsPlayed * 100).toFixed(1) : "0.0";
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="lifetime-player-modal">
    <div class="modal lifetime-player-modal">
      <div class="lifetime-card-heading">${playerAvatar(player.displayName)}<div><p class="eyebrow">Lifetime Player Card</p><h2>${escapeHtml(player.displayName)}</h2></div></div>
      <div class="lifetime-stat-grid">
        <div><strong>${Number(player.totalPoints || 0)}</strong><span>Total points</span></div>
        <div><strong>${Number(player.gamesPlayed || 0)}</strong><span>Games played</span></div>
        <div><strong>${roundsPlayed}</strong><span>Rounds played</span></div>
        <div><strong>${Number(player.roundsWon || 0)}</strong><span>Rounds won</span></div>
        <div><strong>${Number(player.averagePointsPerRound || 0).toFixed(2)}</strong><span>Avg. points / round</span></div>
        <div><strong>${winRate}%</strong><span>Round win rate</span></div>
        <div><strong>${Number(player.bestGameScore || 0)}</strong><span>Best game</span></div>
        <div><strong>${Number(player.bestRoundWinStreak || 0)}</strong><span>Best win streak</span></div>
      </div>
      <div class="lifetime-card-footer"><span>${player.bestGameNumber ? `Best in Game #${Number(player.bestGameNumber)}` : "No best game yet"}</span><span>Last played ${escapeHtml(formatDate(player.lastPlayedAt))}</span></div>
      <button class="btn btn-main" id="close-lifetime-card" type="button">CLOSE PLAYER CARD</button>
    </div>
  </div>`);
  const close = () => document.querySelector("#lifetime-player-modal")?.remove();
  document.querySelector("#close-lifetime-card").onclick = close;
  document.querySelector("#lifetime-player-modal").addEventListener("click", (event) => {
    if (event.target.id === "lifetime-player-modal") close();
  });
}

function loadLifetimeStats() {
  if (state.lifetimeStatsLoading) return;
  state.lifetimeStatsLoading = true;
  (async () => {
    try {
      if (!state.lifetimeStatsSynced && ["host", "master", "admin"].includes(state.profile?.role)) {
        await state.service.syncLifetimeStats();
        state.lifetimeStatsSynced = true;
      }
      state.lifetimeStats = await state.service.listLifetimeStats();
      state.lifetimeStatsError = "";
    } catch (error) {
      console.error("Could not load the Hall of Fame.", error);
      state.lifetimeStats = [];
      state.lifetimeStatsError = "The Hall of Fame needs the latest Firebase Database Rules. Publish the repository's rules file in Firebase, then refresh this page.";
    } finally {
      state.lifetimeStatsLoading = false;
      if (window.location.hash.startsWith("#/hall-of-fame")) renderHallOfFame();
    }
  })();
}

function renderHallOfFame() {
  if (!requireAuth("hall-of-fame")) return;
  if (state.lifetimeStats === null) loadLifetimeStats();
  const stats = state.lifetimeStats || [];
  const categories = buildHallCategories(stats);
  const [points, ...otherCategories] = categories;
  layout(
    `${celebrationPieces(20, "hall-ambient")}<section class="hall-hero">
      <div class="hall-hero-crown" aria-hidden="true">🏆</div>
      <p class="eyebrow">The eternal trophy room</p>
      <h1>HALL OF <span>FAME</span></h1>
      <p>Every completed game adds to these lifetime records. Tap a champion to give them the celebration they deserve.</p>
    </section>
    ${state.lifetimeStats === null ? `<section class="panel hall-loading center-text"><div class="hall-loading-trophy">🏆</div><h2>Polishing the trophies…</h2><p class="muted">Completed games and lifetime records are being synchronized.</p></section>` : state.lifetimeStatsError ? `<div class="notice warning"><span>!</span><span>${escapeHtml(state.lifetimeStatsError)}</span></div>` : !stats.length ? `<section class="panel empty-state"><strong>The trophy room is ready</strong>Complete a game to create the first lifetime player cards and records.</section>` : `
      <section class="hall-section"><div class="hall-section-heading"><div><p class="eyebrow">The main event</p><h2>All-Time Points Champion</h2></div><span>${stats.length} player${stats.length === 1 ? "" : "s"} ranked</span></div>${hallAwardCard(points, true)}</section>
      <section class="hall-section"><div class="hall-section-heading"><div><p class="eyebrow">Lifetime leaders</p><h2>Championship Categories</h2></div></div><div class="hall-category-grid">${otherCategories.slice(0, 3).map((category) => hallAwardCard(category)).join("")}</div></section>
      <section class="hall-section"><div class="hall-section-heading"><div><p class="eyebrow">Record book</p><h2>Single-Game & Streak Records</h2></div></div><div class="hall-record-grid">${otherCategories.slice(3).map((category) => hallAwardCard(category)).join("")}</div></section>
      <section class="hall-section"><div class="hall-section-heading"><div><p class="eyebrow">Contestant collection</p><h2>Lifetime Player Cards</h2><p>Tap any contestant for their complete career snapshot.</p></div></div><div class="lifetime-player-grid">${stats.map((player, index) => `<button class="lifetime-player-card" type="button" data-player-uid="${escapeHtml(player.uid)}"><span class="lifetime-rank">#${index + 1}</span>${playerAvatar(player.displayName)}<span class="lifetime-player-copy"><strong>${escapeHtml(player.displayName)}</strong><span>${Number(player.totalPoints || 0)} points · ${Number(player.roundsWon || 0)} round wins</span></span><span class="lifetime-card-arrow">›</span></button>`).join("")}</div></section>
      ${["host", "master", "admin"].includes(state.profile?.role) ? `<div class="notice"><span>✓</span><span>Completed games you host are automatically synchronized when this page opens.${["master", "admin"].includes(state.profile?.role) ? " Master access also recovers records from every previously completed game." : ""}</span></div>` : ""}
    `}
    <div class="button-row center hall-footer-actions"><a class="btn btn-main" href="#/host">BACK TO DASHBOARD</a><a class="btn btn-ghost" href="#/home">Home</a></div>`,
    ""
  );
  document.querySelectorAll("[data-hall-category]").forEach((button) => button.addEventListener("click", () => {
    showHallCelebration(categories.find((category) => category.id === button.dataset.hallCategory));
  }));
  document.querySelectorAll("[data-player-uid]").forEach((button) => button.addEventListener("click", () => {
    const player = stats.find((entry) => entry.uid === button.dataset.playerUid);
    if (player) showLifetimePlayerCard(player);
  }));
}

function renderCreateGame() {
  if (!requireAuth("create")) return;
  if (!["host", "master", "admin"].includes(state.profile?.role)) return renderHostDashboard();
  const sourceMode = isLiveSuggestionsConfigured() ? "live" : "snapshot";
  layout(
    `<div class="panel glow">
      <div class="panel-header"><p class="eyebrow">New room</p><h1>Create a Game</h1><p>You can edit the nickname and individual scores later from Host Settings.</p></div>
      <form id="create-game-form" class="form-grid">
        <div class="field"><label for="nickname">Game nickname</label><input class="input" id="nickname" name="nickname" maxlength="40" required placeholder="Sommer Family Showdown" /></div>
        <div class="field"><label for="rounds">Number of rounds</label><input class="input" id="rounds" name="totalRounds" type="number" min="${APP_CONFIG.minRounds}" max="${APP_CONFIG.maxRounds}" value="5" required /><p class="field-help">Choose between ${APP_CONFIG.minRounds} and ${APP_CONFIG.maxRounds} rounds.</p></div>
        <div class="field"><label for="round-timer">Answer timer (seconds)</label><input class="input" id="round-timer" name="roundTimerSeconds" type="number" min="${APP_CONFIG.minRoundSeconds}" max="${APP_CONFIG.maxRoundSeconds}" value="${APP_CONFIG.defaultRoundSeconds}" required /><p class="field-help">Every round will automatically reveal when this timer reaches zero.</p></div>
        <div class="toggle-row"><div class="toggle-copy"><strong>Host plays too</strong><span>Add this host account to the contestant list.</span></div><label class="switch"><input name="hostPlays" type="checkbox" checked /><span class="switch-ui"></span></label></div>
        <div class="toggle-row"><div class="toggle-copy"><strong>Teams mode</strong><span>Players still compete individually, but their points also build a team total.</span></div><label class="switch"><input id="team-mode" name="teamMode" type="checkbox" /><span class="switch-ui"></span></label></div>
        <section class="team-setup hidden" id="team-setup">
          <div class="team-setup-heading"><div><p class="eyebrow">Build the squads</p><h2>Team Setup</h2></div><div class="field team-count-field"><label for="team-count">Teams</label><select class="select" id="team-count" name="teamCount"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></div></div>
          <p class="field-help">Everyone chooses a team in the lobby. Any contestant or host can rename a team throughout the game.</p>
          <div class="team-name-grid">${Array.from({ length: 4 }, (_, index) => `<div class="field team-name-field" data-team-position="${index + 1}"><label for="team-name-${index + 1}">Team #${index + 1} name</label><input class="input" id="team-name-${index + 1}" name="teamName${index + 1}" maxlength="30" value="Team #${index + 1}" required /></div>`).join("")}</div>
        </section>
        <input type="hidden" name="suggestionMode" value="${sourceMode}" />
        ${sourceMode === "live"
          ? `<div class="notice"><span>●</span><span><strong>Live answer boards</strong><br />Each round uses a fresh autocomplete request from the 500-prompt pool. Saved answer lists are not used.</span></div>`
          : `<div class="notice warning"><span>!</span><span><strong>Saved-board testing mode</strong><br />The live suggestion endpoint is not configured yet, so this room will use the 12 saved test boards. Connect the Worker to unlock 500 current-result prompts.</span></div>`}
        <button class="btn btn-main" type="submit">CREATE GAME</button>
        <a class="btn btn-ghost" href="#/host">Cancel</a>
      </form>
    </div>`,
    "narrow"
  );
  const teamModeInput = document.querySelector("#team-mode");
  const teamSetup = document.querySelector("#team-setup");
  const teamCount = document.querySelector("#team-count");
  const updateTeamSetup = () => {
    const enabled = teamModeInput.checked;
    const count = Number(teamCount.value);
    teamSetup.classList.toggle("hidden", !enabled);
    document.querySelectorAll(".team-name-field").forEach((field) => {
      const active = enabled && Number(field.dataset.teamPosition) <= count;
      field.classList.toggle("hidden", !active);
      field.querySelector("input").disabled = !active;
    });
  };
  teamModeInput.addEventListener("change", updateTeamSetup);
  teamCount.addEventListener("change", updateTeamSetup);
  updateTeamSetup();
  document.querySelector("#create-game-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const totalRounds = Math.max(APP_CONFIG.minRounds, Math.min(APP_CONFIG.maxRounds, Number(values.totalRounds)));
    const roundTimerSeconds = Math.max(APP_CONFIG.minRoundSeconds, Math.min(APP_CONFIG.maxRoundSeconds, Number(values.roundTimerSeconds)));
    const teamMode = form.teamMode.checked;
    const teamNames = teamMode
      ? Array.from({ length: Number(values.teamCount) }, (_, index) => values[`teamName${index + 1}`])
      : [];
    await runAction(event.submitter, async () => {
      const recentQuestionIds = sessionStore.getRecentQuestionIds();
      const questionQueue = buildQuestionQueue(totalRounds, {
        sourceMode: values.suggestionMode,
        excludedIds: recentQuestionIds
      });
      const game = await state.service.createGame({
        nickname: values.nickname.trim(),
        totalRounds,
        roundTimerSeconds,
        hostPlays: form.hostPlays.checked,
        teamMode,
        teamNames,
        questionQueue,
        suggestionMode: values.suggestionMode
      });
      sessionStore.setActiveGame(game.gameId);
      state.myGames = null;
      state.highScores = null;
      state.highScoresError = "";
      toast(`Game ${game.code} is ready!`, "success");
      navigate(`/game/${game.gameId}/lobby`);
    }, "Building room…");
  });
}

function renderJoinGame() {
  if (!requireAuth("join")) return;
  layout(
    `<div class="panel glow">
      <div class="panel-header center-text"><p class="eyebrow">Find your room</p><h1>Join Game</h1><p>Ask the host for the six-character code shown in their lobby.</p></div>
      <form id="join-form" class="form-grid">
        <div class="field"><label for="game-code">Game code</label><input class="input code-input" id="game-code" name="code" minlength="6" maxlength="6" required autocomplete="off" placeholder="ABC123" /></div>
        <button class="btn btn-main" type="submit">JOIN THE ROOM</button>
        <a class="btn btn-ghost" href="#/home">Back Home</a>
      </form>
    </div>`,
    "narrow"
  );
  const input = document.querySelector("#game-code");
  input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  document.querySelector("#join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAction(event.submitter, async () => {
      const game = await state.service.joinGame(input.value);
      sessionStore.setActiveGame(game.gameId);
      state.myGames = null;
      navigate(`/game/${game.gameId}/lobby`);
    }, "Joining…");
  });
}

function gameHeading(game, extra = "") {
  return `<div class="game-kicker"><span class="pill">${escapeHtml(formatGameNumber(game))}</span><span class="pill">Code ${escapeHtml(game.code)}</span>${extra}</div>
    <div class="section-heading"><div><h1>${escapeHtml(game.nickname)}</h1><p>Hosted by ${escapeHtml(game.hostDisplayName)}${game.teamMode ? " · Teams mode" : ""}</p></div>${modeBadge()}</div>
    ${game.teamMode ? teamScoreboard(game) : ""}`;
}

function teamScoreboard(game, roundNumber = null) {
  const standings = calculateTeamStandings(game, roundNumber);
  const scoreField = roundNumber == null ? "totalScore" : "roundScore";
  const topScore = Math.max(0, ...standings.map((team) => Number(team[scoreField] || 0)));
  return `<section class="team-scoreboard ${roundNumber == null ? "" : "round-team-scoreboard"}">
    <div class="team-scoreboard-heading"><span>${roundNumber == null ? "Team standings" : `Round ${roundNumber} team points`}</span><small>Tap any team name to rename it</small></div>
    <div class="team-score-grid">${standings.map((team, index) => {
      const score = Number(team[scoreField] || 0);
      const leading = topScore > 0 && score === topScore;
      const members = team.members.map((member) => member.displayName).join(", ") || "Waiting for players";
      return `<article class="team-score-card team-color-${team.position + 1} ${leading ? "leading" : ""}"><span class="team-place">${leading ? "★" : `#${index + 1}`}</span><div class="team-score-copy"><button type="button" class="team-name-button" data-team-id="${escapeHtml(team.teamId)}" data-team-name="${escapeHtml(team.name)}">${escapeHtml(team.name)} ✎</button><span>${escapeHtml(members)}</span></div><div class="team-score-value"><strong>${score}</strong><span>pts</span></div></article>`;
    }).join("")}</div>
  </section>`;
}

function playerAvatar(name = "?") {
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="player-avatar">${escapeHtml(initials)}</span>`;
}

function playerList(game, options = {}) {
  const players = Object.entries(game.players || {});
  if (!players.length) return `<div class="empty-state"><strong>No contestants yet</strong>Share the room code to fill the stage.</div>`;
  return `<div class="player-list">${players.map(([playerUid, player]) => {
    const ready = options.readyMap?.[playerUid];
    const current = playerUid === uid();
    const teamName = game.teamMode ? game.teams?.[player.teamId] : "";
    return `<div class="player-row">${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}${current ? " (You)" : ""}</strong><span>${game.teamMode ? teamName ? `Playing for ${escapeHtml(teamName)}` : "Choosing a team…" : player.locked ? "Locked contestant" : "In the lobby"}</span></div><span class="player-status">${ready ? "READY" : options.readyMap ? "WAITING" : "JOINED"}</span></div>`;
  }).join("")}</div>`;
}

function teamSelection(game) {
  if (!game.teamMode || !isPlayer()) return "";
  const selectedTeamId = game.players?.[uid()]?.teamId;
  return `<section class="panel team-selection-panel"><div class="panel-header"><p class="eyebrow">Choose your side</p><h2>${selectedTeamId ? `You joined ${escapeHtml(game.teams[selectedTeamId])}` : "Pick a Team Before Starting"}</h2><p>You can switch teams until the host starts the game. Your personal points will also count toward this team.</p></div><div class="team-choice-grid">${Object.entries(game.teams || {}).map(([teamId, name], index) => {
    const members = Object.values(game.players || {}).filter((player) => player.teamId === teamId).length;
    const selected = teamId === selectedTeamId;
    return `<button type="button" class="team-choice team-color-${index + 1} ${selected ? "selected" : ""}" data-select-team="${escapeHtml(teamId)}"><span>${selected ? "✓" : index + 1}</span><strong>${escapeHtml(name)}</strong><small>${members} member${members === 1 ? "" : "s"}</small></button>`;
  }).join("")}</div></section>`;
}

function contestantStatusList(game, getStatus) {
  const playerIds = lockedPlayerIds(game);
  return `<div class="contestant-status-list">${playerIds.map((playerUid) => {
    const player = game.players[playerUid];
    const status = getStatus(playerUid, player);
    return `<div class="contestant-status-row ${status.complete ? "complete" : "waiting"}">
      ${playerAvatar(player.displayName)}
      <div class="player-copy"><strong>${escapeHtml(player.displayName)}${playerUid === uid() ? " (You)" : ""}</strong><span>${escapeHtml(status.detail)}</span></div>
      <span class="status-badge">${status.complete ? "✓ " : "• "}${escapeHtml(status.label)}</span>
    </div>`;
  }).join("")}</div>`;
}

function statusPanel(game, title, description, getStatus) {
  return `<section class="panel status-panel"><div class="panel-header"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${contestantStatusList(game, getStatus)}</section>`;
}

function roundTimer(round) {
  const duration = Number(round?.durationSeconds || APP_CONFIG.defaultRoundSeconds);
  return `<section class="timer-card" aria-label="Round timer">
    <div class="timer-ring" id="round-timer-ring" style="--timer-progress:360deg"><span id="round-timer-value">${duration}</span></div>
    <div><p class="eyebrow">Time remaining</p><strong id="round-timer-message">Answer before the buzzer!</strong></div>
  </section>`;
}

function armRoundTimer(game) {
  const round = getRound(game);
  const deadlineAt = Number(round?.deadlineAt || 0);
  if (!deadlineAt || game.phase !== "answering") return;
  const durationMs = Math.max(1000, Number(round.durationSeconds || APP_CONFIG.defaultRoundSeconds) * 1000);
  const timerValue = document.querySelector("#round-timer-value");
  const timerRing = document.querySelector("#round-timer-ring");
  const timerMessage = document.querySelector("#round-timer-message");
  const actionKey = `${game.gameId}:${game.currentRound}:expired`;

  const expire = async () => {
    if (state.timerActions.has(actionKey)) return;
    state.timerActions.add(actionKey);
    const answer = getRound(state.game)?.answers?.[uid()];
    const input = document.querySelector("#answer");
    if (isPlayer() && !answer?.locked) {
      input?.setAttribute("disabled", "");
      document.querySelector("#answer-form button")?.setAttribute("disabled", "");
      const currentText = input?.value || sessionStore.readDraft(game.gameId, game.currentRound);
      try {
        await state.service.submitAnswer(game.gameId, game.currentRound, currentText, true);
        sessionStore.clearDraft();
      } catch (error) {
        console.error("Could not auto-submit the timed answer.", error);
      }
    }
    if (isHost()) {
      setTimeout(() => {
        state.service.expireAnsweringRound(game.gameId, game.currentRound).catch((error) => {
          console.error(error);
          toast(error.message || "The timer could not close the round.", "error");
        });
      }, 1200);
    }
  };

  const update = () => {
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    if (timerValue) timerValue.textContent = String(seconds);
    if (timerRing) {
      timerRing.style.setProperty("--timer-progress", `${Math.max(0, Math.min(360, remainingMs / durationMs * 360))}deg`);
      timerRing.classList.toggle("urgent", seconds <= 10 && seconds > 0);
      timerRing.classList.toggle("expired", seconds === 0);
    }
    if (timerMessage && seconds === 0) timerMessage.textContent = "Time's up—locking the board…";
    if (remainingMs <= 0) {
      clearInterval(state.roundTimerInterval);
      state.roundTimerInterval = null;
      expire();
    }
  };

  update();
  if (!state.timerActions.has(actionKey)) state.roundTimerInterval = setInterval(update, 250);
}

function leaderboard(game) {
  const rows = sortLeaderboard(game.players || {});
  return `<div class="leaderboard">${rows.map((player, index) => `<div class="leader-row"><span class="rank">${index + 1}</span>${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}</strong><span>${player.highRoundCount || 0} round ${player.highRoundCount === 1 ? "win" : "wins"}${game.teamMode && game.teams?.[player.teamId] ? ` · ${escapeHtml(game.teams[player.teamId])}` : ""}</span></div><div class="score"><strong>${player.totalScore || 0}</strong><span>points</span></div></div>`).join("")}</div>`;
}

function answerBoard(round, options = {}) {
  return `<div class="answer-board">${(round?.suggestions || []).map((answer, index) => {
    const selected = Number(options.selectedIndex) === index;
    const tag = options.interactive ? "button" : "div";
    return `<${tag} ${options.interactive ? `type="button" data-answer-index="${index}" aria-pressed="${selected}"` : ""} class="board-answer ${options.interactive ? "board-answer-choice" : ""} ${selected ? "selected" : ""}" style="--index:${index}"><span class="board-answer-text">${escapeHtml(answer)}</span><span class="board-points">${APP_CONFIG.scoreByRank[index]}</span></${tag}>`;
  }).join("")}</div>`;
}

function questionCard(round, game) {
  const question = escapeHtml(round?.prompt || "Get ready…").replace(/_+/g, `<span class="blank">____</span>`);
  return `<div class="round-header"><span class="round-number">Round ${game.currentRound} of ${game.totalRounds}</span></div><div class="question-card"><div class="question-category">${escapeHtml(round?.category || "Mystery")}</div><h1>${question}</h1></div>`;
}

async function prepareRound(game, roundNumber) {
  const base = game.questionQueue?.[roundNumber - 1];
  if (!base) throw new Error("This game does not have another question prepared.");
  if (game.suggestionMode !== "live") {
    if (!Array.isArray(base.answers) || base.answers.length < 7) {
      throw new Error("This saved test board is incomplete.");
    }
    return { questionId: base.id, category: base.category, prompt: base.prompt, query: base.query, suggestions: base.answers, source: "Saved test board", fetchedAt: game.createdAt };
  }

  if (!isLiveSuggestionsConfigured()) {
    throw new Error("Live answer boards are required for this game, but the suggestion endpoint is not configured.");
  }

  const usedQuestionIds = new Set(
    Object.values(game.rounds || {}).map((round) => round?.questionId).filter(Boolean)
  );
  const candidates = (game.questionQueue || [])
    .slice(roundNumber - 1)
    .filter((question) => !usedQuestionIds.has(question.id))
    .slice(0, 4);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const live = await fetchLiveSuggestions(candidate.query);
      return {
        questionId: candidate.id,
        category: candidate.category,
        prompt: candidate.prompt,
        query: candidate.query,
        suggestions: live.suggestions,
        source: live.source,
        fetchedAt: live.fetchedAt
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`The live provider could not build a seven-answer board. ${lastError?.message || "Try starting the round again."}`);
}

function renderLobby(game) {
  const readyMap = game.lobbyReady || {};
  const players = Object.keys(game.players || {});
  const readyCount = players.filter((playerUid) => readyMap[playerUid]).length;
  const teamsReady = allPlayersAssignedToTeams(game);
  const currentPlayerHasTeam = !game.teamMode || Boolean(game.teams?.[game.players?.[uid()]?.teamId]);
  layout(
    `${gameHeading(game, `<span class="pill">Lobby</span>`)}
    ${teamSelection(game)}
    <div class="form-row">
      <section class="panel glow">
        <div class="panel-header"><h2>Welcome to the game!</h2><p>${players.length} of ${APP_CONFIG.maxPlayers} player slots filled · ${game.totalRounds} rounds</p></div>
        <div class="game-code-card"><span>Join with code</span><strong class="game-code">${escapeHtml(game.code)}</strong></div>
        <div class="progress-track"><div class="progress-bar" style="width:${players.length ? (readyCount / players.length) * 100 : 0}%"></div></div>
        <div class="progress-copy"><span>${readyCount} ready</span><span>${players.length} contestants</span></div>
        <div class="spacer"></div>
        ${game.teamMode && !teamsReady ? `<div class="notice warning"><span>⚑</span><span>Every contestant must choose a team before the game can start.</span></div><div class="spacer"></div>` : ""}
        ${isHost() ? `<button id="start-game" class="btn btn-main" ${players.length < 1 || !teamsReady ? "disabled" : ""}>START GAME</button>` : readyMap[uid()] ? `<div class="notice"><span>✓</span><span>You're ready. Waiting for the host to start the show.</span></div>` : `<button id="lobby-ready" class="btn btn-main" ${currentPlayerHasTeam ? "" : "disabled"}>I'M READY, LET'S GO!</button>`}
        ${isHost() ? `<div class="button-row"><a class="btn btn-secondary" href="#/game/${game.gameId}/settings">Host Settings</a><a class="btn btn-ghost" href="#/game/${game.gameId}/details">Game Details</a></div>` : ""}
      </section>
      <section class="panel"><div class="panel-header"><h2>Contestants</h2><p>Starting the game locks this list.</p></div>${playerList(game, { readyMap })}</section>
    </div>`,
    ""
  );
  document.querySelectorAll("[data-select-team]").forEach((button) => button.addEventListener("click", (event) => runAction(event.currentTarget, () => state.service.selectTeam(game.gameId, button.dataset.selectTeam), "Joining…")));
  document.querySelector("#lobby-ready")?.addEventListener("click", (event) => runAction(event.currentTarget, () => state.service.markLobbyReady(game.gameId), "Ready…"));
  document.querySelector("#start-game")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    const payload = await prepareRound(game, 1);
    await state.service.startGame(game.gameId, payload);
    sessionStore.rememberQuestionIds([payload.questionId]);
    navigate(`/game/${game.gameId}/play`);
  }, "Opening round…"));
}

function finalAnswerModal(answer, onConfirm) {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="final-modal"><div class="modal center-text"><p class="eyebrow">Lock it in</p><h2>“${escapeHtml(answer)}”</h2><p>Is this your final answer? You cannot change it after submitting.</p><div class="button-stack"><button class="btn btn-main" id="confirm-final">YES, FINAL ANSWER</button><button class="btn btn-ghost" id="edit-final">Let me edit it</button></div></div></div>`);
  document.querySelector("#edit-final").onclick = () => document.querySelector("#final-modal")?.remove();
  document.querySelector("#confirm-final").onclick = async (event) => {
    await runAction(event.currentTarget, onConfirm, "Locking…");
    document.querySelector("#final-modal")?.remove();
  };
}

function renderAnswering(game) {
  const round = getRound(game);
  const answer = round?.answers?.[uid()];
  const submittedCount = lockedPlayerIds(game).filter((playerUid) => round?.answers?.[playerUid]?.locked).length;
  const totalPlayers = lockedPlayerIds(game).length;
  layout(
    `${gameHeading(game, `<span class="pill live">Answers open</span>`)}${roundTimer(round)}
    <div class="round-stage">${questionCard(round, game)}
      <section class="panel">
        <div class="progress-track"><div class="progress-bar" style="width:${totalPlayers ? submittedCount / totalPlayers * 100 : 0}%"></div></div>
        <div class="progress-copy"><span>${submittedCount} submitted</span><span>${totalPlayers} contestants</span></div>
        <div class="spacer"></div>
        ${!isPlayer() ? `<div class="notice"><span>🎙️</span><span>Host view: contestants are answering now. The board reveals when all answers are locked.</span></div>` : answer?.locked ? `<div class="center-text"><p class="eyebrow">Final answer locked</p><h2 class="answer-preview">${escapeHtml(answer.text)}</h2><p class="muted">Waiting for ${Math.max(0, totalPlayers - submittedCount)} more player${totalPlayers - submittedCount === 1 ? "" : "s"}.</p></div>` : `<form id="answer-form" class="answer-entry"><div class="field"><label for="answer">Complete the search</label><input class="input answer-input" id="answer" name="answer" maxlength="90" required autocomplete="off" placeholder="Type only the missing words…" value="${escapeHtml(sessionStore.readDraft(game.gameId, game.currentRound))}" /></div><button class="btn btn-main" type="submit">SUBMIT ANSWER</button></form>`}
      </section>
      ${statusPanel(game, "Contestant Answers", "See who has locked in and who is still working.", (playerUid) => {
        const locked = Boolean(round?.answers?.[playerUid]?.locked);
        return { complete: locked, label: locked ? "LOCKED IN" : "ANSWERING", detail: locked ? "Final answer submitted" : "Still choosing an answer" };
      })}
    </div>`,
    "compact"
  );
  const input = document.querySelector("#answer");
  input?.addEventListener("input", () => sessionStore.saveDraft(game.gameId, game.currentRound, input.value));
  document.querySelector("#answer-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    finalAnswerModal(text, async () => {
      await state.service.submitAnswer(game.gameId, game.currentRound, text);
      sessionStore.clearDraft();
      soundEffects.lockIn();
    });
  });
  armRoundTimer(game);
  if (isHost() && allPlayersSubmitted(game)) queueMicrotask(() => state.service.revealRound(game.gameId));
}

function renderScoring(game) {
  const round = getRound(game);
  const myAnswer = round?.answers?.[uid()]?.text || "";
  const match = findAnswerMatch(round.query, myAnswer, round.suggestions);
  const claim = round?.scoreClaims?.[uid()];
  let selectedAnswerIndex = Number.isInteger(Number(claim?.selectedAnswerIndex))
    ? Number(claim.selectedAnswerIndex)
    : null;
  let highlightedAnswerIndex = selectedAnswerIndex ?? (match.matched ? match.rank - 1 : null);
  layout(
    `${gameHeading(game, `<span class="pill">Round ${game.currentRound} reveal</span>`)}
    <div class="round-stage">${questionCard(round, game)}${answerBoard(round, { interactive: isPlayer() && !claim, selectedIndex: highlightedAnswerIndex })}
      <section class="panel">
        ${isPlayer() ? `<div class="suggested-score-card ${match.matched ? "score-hit" : "score-miss"}"><span>Suggested award</span><strong>${match.points}</strong><small>${match.points === 1 ? "POINT" : "POINTS"}</small></div><div class="spacer"></div>` : ""}
        ${isPlayer() ? claim ? `<div class="final-score-card locked"><span>Final points</span><strong>${claim.points}</strong><small>${claim.points === 1 ? "POINT" : "POINTS"}</small></div><div class="spacer"></div><div class="notice"><span>✓</span><span>Your final score is locked. Waiting for the rest of the room.</span></div>` : `<div class="score-claim"><div class="match-card ${match.matched ? "hit" : "miss"}" id="selected-match"><strong>${match.matched ? `Suggested match at #${match.rank}` : "No exact match found"}</strong><span>Your written answer stays “${escapeHtml(myAnswer)}”. Tap any board answer above to use it as the scoring reference.</span></div><div class="final-score-card"><label for="score-claim">Final points</label><select id="score-claim" class="final-score-select">${[0,1,2,3,4,5,7,10].map((points) => `<option value="${points}" ${points === match.points ? "selected" : ""}>${points}</option>`).join("")}</select><small>POINTS</small></div></div><div class="spacer"></div><button id="confirm-score" class="btn btn-main">FINAL SUBMIT SCORE</button>` : `<div class="notice"><span>🎙️</span><span>Host view: players are confirming the suggested scores.</span></div>`}
        ${isHost() ? `<div class="spacer"></div><button id="finalize-round" class="btn btn-primary" ${allScoresConfirmed(game) ? "" : "disabled"}>GO TO ROUND RECAP</button>` : ""}
      </section>
      ${statusPanel(game, "Final Score Check", "See who has confirmed their final points.", (playerUid) => {
        const confirmed = Number.isFinite(Number(round?.scoreClaims?.[playerUid]?.points));
        return { complete: confirmed, label: confirmed ? "SCORE LOCKED" : "REVIEWING", detail: confirmed ? "Final points submitted" : "Choosing final points" };
      })}
    </div>`,
    "compact"
  );
  playOnce(`${game.gameId}:${game.currentRound}:reveal`, () => soundEffects.reveal());
  const scoreSelect = document.querySelector("#score-claim");
  const matchCard = document.querySelector("#selected-match");
  document.querySelectorAll(".board-answer-choice").forEach((button) => button.addEventListener("click", () => {
    selectedAnswerIndex = Number(button.dataset.answerIndex);
    highlightedAnswerIndex = selectedAnswerIndex;
    const points = APP_CONFIG.scoreByRank[selectedAnswerIndex] ?? 0;
    if (scoreSelect) scoreSelect.value = String(points);
    document.querySelectorAll(".board-answer-choice").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    if (matchCard) {
      matchCard.classList.add("hit");
      matchCard.classList.remove("miss");
      matchCard.querySelector("strong").textContent = `Board answer #${selectedAnswerIndex + 1} selected`;
      matchCard.querySelector("span").textContent = `Your written answer stays “${myAnswer}”. This board answer awards ${points} points.`;
    }
  }));
  scoreSelect?.addEventListener("change", () => {
    if (highlightedAnswerIndex == null || Number(scoreSelect.value) === APP_CONFIG.scoreByRank[highlightedAnswerIndex]) return;
    selectedAnswerIndex = null;
    highlightedAnswerIndex = null;
    document.querySelectorAll(".board-answer-choice").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-pressed", "false");
    });
  });
  document.querySelector("#confirm-score")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    const points = Number(document.querySelector("#score-claim").value);
    await state.service.confirmScore(game.gameId, game.currentRound, points, selectedAnswerIndex);
    soundEffects.score(points);
  }, "Submitting…"));
  document.querySelector("#finalize-round")?.addEventListener("click", (event) => runAction(event.currentTarget, () => state.service.finalizeRound(game.gameId), "Tallying…"));
}

function roundPlayerResults(game, roundNumber = game.currentRound) {
  const round = getRound(game, roundNumber);
  const results = round?.results ? Object.values(round.results) : calculateRoundResults(game, roundNumber);
  return `<div class="round-player-list">${results.sort((a,b) => b.points - a.points).map((result) => `<div class="round-player-row">${playerAvatar(result.displayName)}<div class="player-copy"><strong>${escapeHtml(result.displayName)}</strong><span>“${escapeHtml(result.answer || "No answer")}"${result.match?.manual && result.match?.suggestion ? ` · Referenced #${result.match.rank}` : ""}${game.teamMode && game.teams?.[game.players?.[result.uid]?.teamId] ? ` · ${escapeHtml(game.teams[game.players[result.uid].teamId])}` : ""}</span></div><div class="score"><strong>${result.points}</strong><span>points</span></div></div>`).join("")}</div>`;
}

function celebrationPieces(count = 48, className = "") {
  const colors = ["#ffcb48", "#20d7f0", "#ff5d8f", "#8a46ff", "#39dda0", "#fff4bd"];
  return `<div class="confetti ${className}">${Array.from({ length: count }, (_, index) =>
    `<i style="--left:${(index * 37) % 100}%;--delay:-${(index % 9) * .24}s;--duration:${2.4 + (index % 6) * .32}s;--rotation:${index * 29}deg;--confetti-color:${colors[index % colors.length]}"></i>`
  ).join("")}</div>`;
}

function getRoundWinners(game, roundNumber = game.currentRound) {
  const round = getRound(game, roundNumber);
  const results = Object.values(round?.results || {});
  const highestScore = Math.max(0, ...results.map((result) => Number(result.points || 0)));
  return {
    highestScore,
    winners: highestScore > 0 ? results.filter((result) => Number(result.points || 0) === highestScore) : []
  };
}

function renderRoundRecap(game) {
  const round = getRound(game);
  const { winners, highestScore } = getRoundWinners(game);
  const winnerNames = winners.map((winner) => winner.displayName).join(" & ");
  const currentPlayerWon = winners.some((winner) => winner.uid === uid());
  const winnerShowcase = winners.length
    ? `<section class="round-winner-showcase">
        <div class="winner-emblem" aria-hidden="true"><span>★</span></div>
        <p class="eyebrow">${winners.length > 1 ? "Round champions" : currentPlayerWon ? "You won the round!" : "Round champion"}</p>
        <h2>${escapeHtml(winnerNames)}</h2>
        <p>${highestScore} points at the top of the board</p>
        <div class="winner-rays" aria-hidden="true"></div>
      </section>`
    : `<section class="round-draw"><p class="eyebrow">The board wins this one</p><h2>No points scored this round</h2></section>`;
  layout(
    `${winners.length ? celebrationPieces(52, "round-confetti") : ""}${gameHeading(game, `<span class="pill">Round ${game.currentRound} complete</span>`)}
    ${winnerShowcase}${game.teamMode ? `<div class="spacer"></div>${teamScoreboard(game, game.currentRound)}` : ""}<div class="spacer"></div>
    <div class="form-row"><section>${questionCard(round, game)}<div class="spacer"></div>${answerBoard(round)}</section><section class="panel"><div class="panel-header"><h2>Round Scores</h2><p>Highest score earns a round win, including ties.</p></div>${roundPlayerResults(game)}</section></div>
    <div class="spacer"></div><div class="button-row center"><a class="btn btn-main" href="#/game/${game.gameId}/recap">GO TO GAME RECAP</a><a class="btn btn-ghost" href="#/game/${game.gameId}/round-details">Round Details</a></div>`,
    ""
  );
  if (winners.length) playOnce(`${game.gameId}:${game.currentRound}:winner`, () => soundEffects.roundWin());
}

function renderGameRecap(game) {
  const summary = summarizeGame(game);
  const nextRound = game.currentRound + 1;
  const readyMap = game.ready?.[nextRound] || {};
  const readyCount = lockedPlayerIds(game).filter((playerUid) => readyMap[playerUid]).length;
  const ready = readyMap[uid()] || !isPlayer();
  const complete = game.currentRound >= game.totalRounds;
  layout(
    `${gameHeading(game, `<span class="pill">${summary.roundsPlayed} of ${game.totalRounds} rounds</span>`)}
    <div class="panel glow"><div class="panel-header"><h2>Game Recap</h2><p>Leaderboard after Round ${game.currentRound}</p></div>${leaderboard(game)}</div>
    <div class="spacer"></div>
    <div class="panel center-text">
      ${complete ? `<h2>The game is complete!</h2><p class="muted">One more tap sends everyone to the finale.</p>${isHost() ? `<button id="finish-game" class="btn btn-main">SHOW THE WINNER</button>` : `<div class="notice"><span>🏆</span><span>Waiting for the host to open the finale.</span></div>`}` : `<h2>Round ${nextRound} is next</h2><p class="muted">${readyCount} of ${lockedPlayerIds(game).length} contestants have joined the next round.</p><div class="progress-track"><div class="progress-bar" style="width:${lockedPlayerIds(game).length ? readyCount / lockedPlayerIds(game).length * 100 : 0}%"></div></div><div class="spacer"></div>${contestantStatusList(game, (playerUid) => { const joined = readyMap[playerUid] === true; return { complete: joined, label: joined ? "JOINED ROUND" : "WAITING", detail: joined ? `Ready for Round ${nextRound}` : `Still needs to join Round ${nextRound}` }; })}<div class="spacer"></div>${isHost() ? `<button id="start-next-round" class="btn btn-main" ${allPlayersReady(game, nextRound) ? "" : "disabled"}>START ROUND ${nextRound}</button>` : ready ? `<div class="notice"><span>✓</span><span>You're in. Waiting for the other players and host.</span></div>` : `<button id="ready-next-round" class="btn btn-main">PROCEED TO NEXT ROUND</button>`}${isHost() && isPlayer() && !ready ? `<div class="spacer"></div><button id="host-ready-next" class="btn btn-secondary">JOIN NEXT ROUND AS A PLAYER</button>` : ""}`}
      <div class="spacer"></div><div class="button-row center"><a class="btn btn-ghost" href="#/game/${game.gameId}/details">Game Details</a><a class="btn btn-ghost" href="#/game/${game.gameId}/round-details">Round Details</a></div>
    </div>`,
    "compact"
  );
  const markReady = (event) => runAction(event.currentTarget, () => state.service.markReady(game.gameId, nextRound), "Joining…");
  document.querySelector("#ready-next-round")?.addEventListener("click", markReady);
  document.querySelector("#host-ready-next")?.addEventListener("click", markReady);
  document.querySelector("#start-next-round")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    const payload = await prepareRound(game, nextRound);
    await state.service.startNextRound(game.gameId, nextRound, payload);
    sessionStore.rememberQuestionIds([payload.questionId]);
    navigate(`/game/${game.gameId}/play`);
  }, "Opening round…"));
  document.querySelector("#finish-game")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    await state.service.finishGame(game.gameId);
    state.highScores = null;
    state.lifetimeStats = null;
    state.lifetimeStatsSynced = false;
    navigate(`/game/${game.gameId}/finale`);
  }, "Opening finale…"));
}

function renderFinale(game) {
  const { winners } = summarizeGame(game);
  const winnerNames = winners.map((winner) => winner.displayName).join(" & ");
  const teamResult = getTeamWinners(game);
  const teamWinnerNames = teamResult.winners.map((team) => team.name).join(" & ");
  const teamFinale = game.teamMode ? `<section class="team-finale">
    <div class="team-finale-trophy" aria-hidden="true">🏆</div>
    <p class="eyebrow">${teamResult.winners.length > 1 ? "Co-champion teams" : "Ultimate team champion"}</p>
    <h1>${escapeHtml(teamWinnerNames)}</h1>
    <p>${teamResult.highestScore} combined points · ${teamResult.winners.map((team) => `${team.memberCount} member${team.memberCount === 1 ? "" : "s"}`).join(" · ")}</p>
    <div class="winner-rays" aria-hidden="true"></div>
  </section><div class="spacer"></div>` : "";
  layout(
    `${celebrationPieces(72, "finale-confetti")}${gameHeading(game, `<span class="pill">Finale</span>`)}
    ${teamFinale}<section class="panel glow finale"><div class="finale-crown" aria-hidden="true"><span>★</span></div><p class="eyebrow">${game.teamMode ? "Individual standings · " : ""}${winners.length > 1 ? "Co-champions" : "Tonight's champion"}</p><h1 class="winner-name">${escapeHtml(winnerNames)}</h1><p class="winner-copy">${winners[0]?.totalScore || 0} points · ${winners[0]?.highRoundCount || 0} round wins</p><div class="divider"></div><div class="finale-board">${leaderboard(game)}</div><div class="spacer"></div><div class="button-row center"><a class="btn btn-main" href="#/create">PLAY AGAIN</a><a class="btn btn-ghost" href="#/game/${game.gameId}/details">Full Game Details</a></div></section>`,
    "compact"
  );
  playOnce(`${game.gameId}:finale`, () => soundEffects.finale());
}

function roundCarousel(game, roundNumber, targetView) {
  const round = getRound(game, roundNumber);
  return `<div class="carousel"><button id="round-prev" class="btn btn-ghost btn-icon" ${roundNumber <= 1 ? "disabled" : ""} aria-label="Previous round">←</button><div class="carousel-card"><span class="round-number">Round ${roundNumber}</span><h3>${escapeHtml(round?.prompt || "Not played yet")}</h3><p>${round?.finalized ? `Completed ${formatDate(round.finalizedAt)}` : "Not completed"}</p></div><button id="round-next" class="btn btn-ghost btn-icon" ${roundNumber >= game.currentRound ? "disabled" : ""} aria-label="Next round">→</button></div><div class="spacer"></div><div class="button-row center"><a class="btn ${targetView === "round-details" ? "btn-primary" : "btn-ghost"}" href="#/game/${game.gameId}/round-details">Round Details</a><a class="btn ${targetView === "details" ? "btn-primary" : "btn-ghost"}" href="#/game/${game.gameId}/details">Game Summary</a></div>`;
}

function bindCarousel(game, view) {
  document.querySelector("#round-prev")?.addEventListener("click", () => { state.carouselRound = Math.max(1, state.carouselRound - 1); renderGameView(view); });
  document.querySelector("#round-next")?.addEventListener("click", () => { state.carouselRound = Math.min(game.currentRound, state.carouselRound + 1); renderGameView(view); });
}

function renderGameDetails(game) {
  const summary = summarizeGame(game);
  state.carouselRound = Math.min(Math.max(1, state.carouselRound), Math.max(1, game.currentRound));
  layout(
    `${gameHeading(game, `<span class="pill">Game details</span>`)}
    <div class="stats-grid"><div class="stat"><span class="stat-value">${summary.roundsPlayed}</span><span class="stat-label">Rounds played</span></div><div class="stat"><span class="stat-value">${Object.keys(game.players || {}).length}</span><span class="stat-label">Players</span></div><div class="stat"><span class="stat-value">${sortLeaderboard(game.players || {})[0]?.totalScore || 0}</span><span class="stat-label">Top score</span></div></div><div class="spacer"></div>
    <div class="form-row"><section class="panel"><div class="panel-header"><h2>Standings</h2><p>Ranked by total score, then round wins.</p></div>${leaderboard(game)}</section><section class="panel"><div class="panel-header"><h2>Round Carousel</h2><p>Scroll through every played question.</p></div>${roundCarousel(game, state.carouselRound, "details")}</section></div><div class="spacer"></div><div class="button-row center"><a class="btn btn-main" href="#/game/${game.gameId}/${game.phase === "finished" ? "finale" : game.phase === "lobby" ? "lobby" : game.phase === "recap" ? "recap" : "play"}">RETURN TO GAME</a>${isHost() ? `<a class="btn btn-secondary" href="#/game/${game.gameId}/settings">Host Settings</a>` : ""}</div>`,
    ""
  );
  bindCarousel(game, "details");
}

function renderRoundDetails(game) {
  state.carouselRound = Math.min(Math.max(1, state.carouselRound), Math.max(1, game.currentRound));
  const round = getRound(game, state.carouselRound);
  layout(
    `${gameHeading(game, `<span class="pill">Round details</span>`)}${roundCarousel(game, state.carouselRound, "round-details")}
    ${round ? `<div class="form-row"><section>${questionCard(round, { ...game, currentRound: state.carouselRound })}<div class="spacer"></div>${answerBoard(round)}</section><section class="panel"><div class="panel-header"><h2>Player Answers</h2><p>${escapeHtml(round.source || "Answer snapshot")} · ${formatDate(round.fetchedAt)}</p></div>${roundPlayerResults(game, state.carouselRound)}</section></div>` : `<div class="panel empty-state"><strong>No round data yet</strong>Start the game to create the first round.</div>`}
    <div class="spacer"></div><div class="button-row center"><a class="btn btn-main" href="#/game/${game.gameId}/${game.phase === "finished" ? "finale" : game.phase === "recap" ? "recap" : game.phase === "lobby" ? "lobby" : "play"}">RETURN TO GAME</a></div>`,
    ""
  );
  bindCarousel(game, "round-details");
}

function renderSettings(game) {
  if (!isHost()) return renderGameDetails(game);
  const completedRounds = Object.entries(game.rounds || {}).filter(([, round]) => round.finalized);
  layout(
    `${gameHeading(game, `<span class="pill">Host settings</span>`)}
    <section class="panel"><div class="panel-header"><h2>Game Settings</h2><p>Changes appear for every connected player. Timer changes apply when the next round opens.</p></div><form id="settings-form" class="form-grid"><div class="field"><label for="settings-nickname">Game nickname</label><input class="input" id="settings-nickname" name="nickname" maxlength="40" value="${escapeHtml(game.nickname)}" required /></div><div class="field"><label for="settings-timer">Answer timer (seconds)</label><input class="input" id="settings-timer" name="roundTimerSeconds" type="number" min="${APP_CONFIG.minRoundSeconds}" max="${APP_CONFIG.maxRoundSeconds}" value="${Number(game.roundTimerSeconds || APP_CONFIG.defaultRoundSeconds)}" required /></div><button class="btn btn-primary" type="submit">SAVE GAME SETTINGS</button></form></section>
    <section class="panel"><div class="panel-header"><h2>Contestants</h2><p>Removing a player is permanent and also removes them from the current round's waiting gates.</p></div><div class="player-list">${Object.entries(game.players || {}).map(([playerUid, player]) => `<div class="player-row">${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}</strong><span>${player.totalScore || 0} points</span></div><button class="btn btn-danger btn-small remove-player" data-uid="${escapeHtml(playerUid)}">Remove</button></div>`).join("")}</div></section>
    <section class="panel"><div class="panel-header"><h2>Edit Round Scores</h2><p>Host changes update the player's total score immediately.</p></div>${completedRounds.length ? completedRounds.map(([roundNumber, round]) => `<div class="match-card"><strong>Round ${roundNumber}: ${escapeHtml(round.prompt)}</strong><div class="spacer"></div><div class="form-grid">${Object.values(round.results || {}).map((result) => `<div class="toggle-row"><div class="toggle-copy"><strong>${escapeHtml(result.displayName)}</strong><span>“${escapeHtml(result.answer)}”${result.hostEdited ? " · Host edited" : ""}</span></div><select class="select score-edit" style="width:100px" data-round="${roundNumber}" data-uid="${escapeHtml(result.uid)}">${[0,1,2,3,4,5,7,10].map((points) => `<option value="${points}" ${Number(result.points) === points ? "selected" : ""}>${points}</option>`).join("")}</select></div>`).join("")}</div></div><div class="spacer"></div>`).join("") : `<div class="empty-state"><strong>No completed rounds</strong>Score editing appears here after Round 1.</div>`}</section>
    <div class="button-row center"><a class="btn btn-main" href="#/game/${game.gameId}/${game.phase === "lobby" ? "lobby" : game.phase === "recap" ? "recap" : game.phase === "finished" ? "finale" : "play"}">RETURN TO GAME</a></div>`,
    "compact"
  );
  document.querySelector("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const roundTimerSeconds = Math.max(APP_CONFIG.minRoundSeconds, Math.min(APP_CONFIG.maxRoundSeconds, Number(document.querySelector("#settings-timer").value)));
    runAction(event.submitter, () => state.service.updateGameSettings(game.gameId, { nickname: document.querySelector("#settings-nickname").value.trim(), roundTimerSeconds }), "Saving…");
  });
  document.querySelectorAll(".remove-player").forEach((button) => button.addEventListener("click", () => {
    if (window.confirm("Remove this player from the game? This also removes them from the current round.")) runAction(button, () => state.service.removePlayer(game.gameId, button.dataset.uid), "Removing…");
  }));
  document.querySelectorAll(".score-edit").forEach((select) => select.addEventListener("change", () => runAction(select, () => state.service.editFinalScore(game.gameId, Number(select.dataset.round), select.dataset.uid, Number(select.value)), "Saving…")));
}

async function renderAdmin() {
  if (!requireAuth("admin")) return;
  if (!["master", "admin"].includes(state.profile?.role)) return renderHostDashboard();
  if (!state.users) state.users = await state.service.listUsers();
  layout(
    `<section class="section-heading"><div><p class="eyebrow">Master controls</p><h1>User & Host Setup</h1><p>Promote trusted family profiles to hosts and assign their host number.</p></div>${modeBadge()}</section>
    <div class="notice"><span>✓</span><span>Email addresses stay private. Only nicknames, roles, and host numbers appear here.</span></div><div class="spacer"></div>
    <section class="panel"><div class="player-list">${Object.entries(state.users).map(([userUid, user]) => `<div class="player-row">${playerAvatar(user.displayName)}<div class="player-copy"><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.role || "player")} · ${escapeHtml(user.hostNumber || "No host number")}</span></div><select class="select role-select" style="width:120px" data-uid="${escapeHtml(userUid)}" data-current-role="${escapeHtml(user.role || "player")}" ${userUid === uid() ? "disabled" : ""}><option value="player" ${user.role === "player" ? "selected" : ""}>Player</option><option value="host" ${user.role === "host" ? "selected" : ""}>Host</option></select></div>`).join("")}</div></section>
    <div class="button-row center"><a class="btn btn-main" href="#/host">BACK TO HOST CENTER</a></div>`,
    "compact"
  );
  document.querySelectorAll(".role-select").forEach((select) => select.addEventListener("change", async () => {
    const previousRole = select.dataset.currentRole;
    await runAction(select, async () => {
      await state.service.setUserRole(select.dataset.uid, select.value);
      state.users = await state.service.listUsers();
      toast("Account role updated.", "success");
      renderAdmin();
    }, "Saving…");
    if (document.body.contains(select) && state.users?.[select.dataset.uid]?.role !== select.value) {
      select.value = previousRole;
    }
  }));
}

async function ensureGame(gameId) {
  if (state.gameId === gameId && state.game) return true;
  state.unsubscribeGame?.();
  state.gameId = gameId;
  state.game = await state.service.getGame(gameId);
  if (!state.game) return false;
  state.unsubscribeGame = state.service.watchGame(gameId, (game) => {
    state.game = game;
    if (window.location.hash.includes(`/game/${gameId}/`)) render();
  });
  sessionStore.setActiveGame(gameId);
  return true;
}

function renderGameView(view) {
  const game = state.game;
  if (!game) return;
  if (view === "lobby" && game.phase !== "lobby") view = game.phase === "finished" ? "finale" : game.phase === "recap" ? "recap" : "play";
  if (view === "details") return renderGameDetails(game);
  if (view === "round-details") return renderRoundDetails(game);
  if (view === "settings") return renderSettings(game);
  if (view === "recap") return renderGameRecap(game);
  if (view === "finale") return renderFinale(game);
  if (view === "lobby") return renderLobby(game);
  if (game.phase === "answering" || game.phase === "waiting") return renderAnswering(game);
  if (game.phase === "scoring") return renderScoring(game);
  if (game.phase === "recap") return renderRoundRecap(game);
  if (game.phase === "finished") return renderFinale(game);
  return renderLobby(game);
}

async function render() {
  const { segments, params } = getHashParts();
  const [page = "home", gameId, gameView = "play"] = segments;
  if (page === "home") return renderHome();
  if (page === "instructions") return renderInstructions();
  if (page === "auth") return renderAuth(params);
  if (page === "host") return renderHostDashboard();
  if (page === "create") return renderCreateGame();
  if (page === "join") return renderJoinGame();
  if (page === "hall-of-fame") return renderHallOfFame();
  if (page === "admin") return renderAdmin();
  if (page === "game") {
    if (!requireAuth(`game/${gameId}/${gameView}`)) return;
    root.innerHTML = `<div class="boot-screen"><div class="logo-mark"><span>?</span></div><p>Loading the game room…</p></div>`;
    if (!(await ensureGame(gameId))) {
      layout(`<div class="panel center-text"><h1>Game not found</h1><p class="muted">This room may have been removed or the link may be incorrect.</p><a class="btn btn-main" href="#/join">ENTER A GAME CODE</a></div>`, "narrow");
      return;
    }
    return renderGameView(gameView);
  }
  navigate("/home");
}

function renderConnectionError(error) {
  console.error("Live Firebase initialization failed.", error);
  root.innerHTML = `<div class="app-shell"><main class="page narrow"><section class="panel glow center-text connection-error">
    <div class="connection-mark" aria-hidden="true">!</div>
    <p class="eyebrow">Live connection unavailable</p>
    <h1>The game could not reach Firebase.</h1>
    <p class="muted">No demo game was loaded. Check the internet connection and confirm Anonymous Authentication and the Realtime Database are enabled.</p>
    <button class="btn btn-main" id="retry-live">TRY AGAIN</button>
  </section></main></div>`;
  document.querySelector("#retry-live")?.addEventListener("click", () => window.location.reload());
}

async function init() {
  const unlockSound = () => soundEffects.unlock();
  window.addEventListener("pointerdown", unlockSound, { once: true, capture: true });
  window.addEventListener("keydown", unlockSound, { once: true, capture: true });

  try {
    if (!isFirebaseConfigured()) throw new Error("Firebase configuration is incomplete.");
    state.service = new FirebaseGameService();
    await state.service.init();
  } catch (error) {
    renderConnectionError(error);
    return;
  }

  state.service.onAuth((user, profile) => {
    state.user = user;
    state.profile = profile;
    render();
  });
  window.addEventListener("hashchange", render);
  if (!window.location.hash) navigate("/home");
  else await render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

init();
