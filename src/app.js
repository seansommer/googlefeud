import { APP_CONFIG, isFirebaseConfigured, isLiveSuggestionsConfigured } from "./config.js";
import {
  allPlayersReady,
  allPlayersSubmitted,
  allScoresConfirmed,
  calculateRoundResults,
  escapeHtml,
  findAnswerMatch,
  formatDate,
  formatGameNumber,
  getRound,
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
  playedEffects: new Set()
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
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
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
        <button id="sound-toggle" class="btn btn-ghost btn-small sound-toggle" type="button" aria-label="Toggle game sounds">${soundEffects.enabled ? "SOUND ON" : "SOUND OFF"}</button>
        ${state.game ? `<button id="refresh-game" class="btn btn-secondary btn-small refresh-game" type="button" aria-label="Refresh live game">↻ <span class="refresh-label">REFRESH</span></button>` : ""}
        ${state.user ? `<button id="account-menu" class="btn btn-ghost btn-small">Menu</button>` : `<a class="btn btn-ghost btn-small" href="#/auth">Sign in</a>`}
      </div>
    </header>`;
}

function legalFooter() {
  return `<footer class="legal-footer">${escapeHtml(APP_CONFIG.officialDisclaimer)}</footer>`;
}

function layout(content, pageClass = "") {
  root.innerHTML = `<div class="app-shell">${topbar()}<main class="page ${pageClass}">${content}${legalFooter()}</main></div>`;
  document.querySelector("#account-menu")?.addEventListener("click", showAccountMenu);
  document.querySelector("#sound-toggle")?.addEventListener("click", (event) => {
    const enabled = soundEffects.toggle();
    event.currentTarget.textContent = enabled ? "SOUND ON" : "SOUND OFF";
    event.currentTarget.classList.toggle("muted-sound", !enabled);
  });
  document.querySelector("#refresh-game")?.addEventListener("click", (event) => {
    event.currentTarget.textContent = "REFRESHING…";
    event.currentTarget.disabled = true;
    window.location.reload();
  });
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
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" required autocomplete="email" value="${escapeHtml(savedEmail)}" /></div>
        <div class="field"><label for="display-name">Nickname</label><input class="input" id="display-name" name="displayName" maxlength="30" required autocomplete="nickname" value="${escapeHtml(savedNickname)}" placeholder="What should the room call you?" /></div>
        <p class="field-help">Family trust mode: your email helps identify the profile but is never shown inside the game.</p>
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
      if (window.location.hash.startsWith("#/host")) renderHostDashboard();
    }).catch(() => { state.highScores = []; });
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
          ${["master", "admin"].includes(state.profile?.role) ? `<a class="btn btn-ghost" href="#/admin">Manage Host Accounts</a>` : ""}
        </div>
      </div>`}
      <div class="panel">
        <div class="panel-header"><h2>Previous Games</h2><p>Reopen a game to review its details, rounds, and final scores.</p></div>
        ${state.myGames === null ? `<div class="empty-state">Loading game history…</div>` : recentGames.length ? `<div class="player-list">${recentGames.slice(0, 10).map((game) => `<a class="player-row" style="color:inherit;text-decoration:none" href="#/game/${encodeURIComponent(game.gameId)}/details">${playerAvatar(game.nickname)}<div class="player-copy"><strong>${escapeHtml(game.nickname)}</strong><span>Code ${escapeHtml(game.code)} · ${escapeHtml(game.role)}</span></div><span class="player-status">OPEN</span></a>`).join("")}</div>` : `<div class="empty-state"><strong>No previous games yet</strong>Your first room will appear here.</div>`}
      </div>
      <div class="panel">
        <div class="panel-header"><h2>All-Time High Scores</h2><p>Each player's best completed-game total.</p></div>
        ${state.highScores === null ? `<div class="empty-state">Loading high scores…</div>` : highScores.length ? `<div class="leaderboard">${highScores.slice(0, 10).map((entry, index) => `<div class="leader-row"><span class="rank">${index + 1}</span>${playerAvatar(entry.displayName)}<div class="player-copy"><strong>${escapeHtml(entry.displayName)}</strong><span>${escapeHtml(formatGameNumber({ gameNumber: entry.gameNumber }))}</span></div><div class="score"><strong>${entry.score}</strong><span>best</span></div></div>`).join("")}</div>` : `<div class="empty-state"><strong>No high scores yet</strong>Finish a game to claim the board.</div>`}
      </div>
    `,
    "compact"
  );
}

function renderCreateGame() {
  if (!requireAuth("create")) return;
  if (!["host", "master", "admin"].includes(state.profile?.role)) return renderHostDashboard();
  layout(
    `<div class="panel glow">
      <div class="panel-header"><p class="eyebrow">New room</p><h1>Create a Game</h1><p>You can edit the nickname and individual scores later from Host Settings.</p></div>
      <form id="create-game-form" class="form-grid">
        <div class="field"><label for="nickname">Game nickname</label><input class="input" id="nickname" name="nickname" maxlength="40" required placeholder="Sommer Family Showdown" /></div>
        <div class="field"><label for="rounds">Number of rounds</label><input class="input" id="rounds" name="totalRounds" type="number" min="${APP_CONFIG.minRounds}" max="${APP_CONFIG.maxRounds}" value="5" required /><p class="field-help">Choose between ${APP_CONFIG.minRounds} and ${APP_CONFIG.maxRounds} rounds.</p></div>
        <div class="toggle-row"><div class="toggle-copy"><strong>Host plays too</strong><span>Add this host account to the contestant list.</span></div><label class="switch"><input name="hostPlays" type="checkbox" checked /><span class="switch-ui"></span></label></div>
        <div class="field"><label for="suggestion-mode">Answer source</label><select class="select" id="suggestion-mode" name="suggestionMode"><option value="snapshot">Built-in answer snapshots</option>${isLiveSuggestionsConfigured() ? `<option value="live" selected>Live autocomplete provider</option>` : ""}</select><p class="field-help">${isLiveSuggestionsConfigured() ? "Live results refresh immediately before each round." : "Live mode becomes available after the optional suggestion endpoint is configured."}</p></div>
        <button class="btn btn-main" type="submit">CREATE GAME</button>
        <a class="btn btn-ghost" href="#/host">Cancel</a>
      </form>
    </div>`,
    "narrow"
  );
  document.querySelector("#create-game-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const totalRounds = Math.max(APP_CONFIG.minRounds, Math.min(APP_CONFIG.maxRounds, Number(values.totalRounds)));
    await runAction(event.submitter, async () => {
      const game = await state.service.createGame({
        nickname: values.nickname.trim(),
        totalRounds,
        hostPlays: form.hostPlays.checked,
        questionQueue: buildQuestionQueue(totalRounds),
        suggestionMode: values.suggestionMode
      });
      sessionStore.setActiveGame(game.gameId);
      state.myGames = null;
      state.highScores = null;
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
    <div class="section-heading"><div><h1>${escapeHtml(game.nickname)}</h1><p>Hosted by ${escapeHtml(game.hostDisplayName)}</p></div>${modeBadge()}</div>`;
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
    return `<div class="player-row">${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}${current ? " (You)" : ""}</strong><span>${player.locked ? "Locked contestant" : "In the lobby"}</span></div><span class="player-status">${ready ? "READY" : options.readyMap ? "WAITING" : "JOINED"}</span></div>`;
  }).join("")}</div>`;
}

function leaderboard(game) {
  const rows = sortLeaderboard(game.players || {});
  return `<div class="leaderboard">${rows.map((player, index) => `<div class="leader-row"><span class="rank">${index + 1}</span>${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}</strong><span>${player.highRoundCount || 0} round ${player.highRoundCount === 1 ? "win" : "wins"}</span></div><div class="score"><strong>${player.totalScore || 0}</strong><span>points</span></div></div>`).join("")}</div>`;
}

function answerBoard(round) {
  return `<div class="answer-board">${(round?.suggestions || []).map((answer, index) => `<div class="board-answer" style="--index:${index}"><span class="board-answer-text">${escapeHtml(answer)}</span><span class="board-points">${APP_CONFIG.scoreByRank[index]}</span></div>`).join("")}</div>`;
}

function questionCard(round, game) {
  const question = escapeHtml(round?.prompt || "Get ready…").replace(/_+/g, `<span class="blank">____</span>`);
  return `<div class="round-header"><span class="round-number">Round ${game.currentRound} of ${game.totalRounds}</span></div><div class="question-card"><div class="question-category">${escapeHtml(round?.category || "Mystery")}</div><h1>${question}</h1></div>`;
}

async function prepareRound(game, roundNumber) {
  const base = game.questionQueue?.[roundNumber - 1];
  if (!base) throw new Error("This game does not have another question prepared.");
  let suggestions = base.answers;
  let source = "Built-in answer snapshot";
  let fetchedAt = game.createdAt;
  if (game.suggestionMode === "live" && isLiveSuggestionsConfigured()) {
    try {
      const live = await fetchLiveSuggestions(base.query);
      suggestions = live.suggestions;
      source = live.source;
      fetchedAt = live.fetchedAt;
    } catch (error) {
      toast(`Live suggestions were unavailable; using the built-in backup. ${error.message}`, "error");
    }
  }
  return { questionId: base.id, category: base.category, prompt: base.prompt, query: base.query, suggestions, source, fetchedAt };
}

function renderLobby(game) {
  const readyMap = game.lobbyReady || {};
  const players = Object.keys(game.players || {});
  const readyCount = players.filter((playerUid) => readyMap[playerUid]).length;
  layout(
    `${gameHeading(game, `<span class="pill">Lobby</span>`)}
    <div class="form-row">
      <section class="panel glow">
        <div class="panel-header"><h2>Welcome to the game!</h2><p>${players.length} of ${APP_CONFIG.maxPlayers} player slots filled · ${game.totalRounds} rounds</p></div>
        <div class="game-code-card"><span>Join with code</span><strong class="game-code">${escapeHtml(game.code)}</strong></div>
        <div class="progress-track"><div class="progress-bar" style="width:${players.length ? (readyCount / players.length) * 100 : 0}%"></div></div>
        <div class="progress-copy"><span>${readyCount} ready</span><span>${players.length} contestants</span></div>
        <div class="spacer"></div>
        ${isHost() ? `<button id="start-game" class="btn btn-main" ${players.length < 1 ? "disabled" : ""}>START GAME</button>` : readyMap[uid()] ? `<div class="notice"><span>✓</span><span>You're ready. Waiting for the host to start the show.</span></div>` : `<button id="lobby-ready" class="btn btn-main">I'M READY, LET'S GO!</button>`}
        ${isHost() ? `<div class="button-row"><a class="btn btn-secondary" href="#/game/${game.gameId}/settings">Host Settings</a><a class="btn btn-ghost" href="#/game/${game.gameId}/details">Game Details</a></div>` : ""}
      </section>
      <section class="panel"><div class="panel-header"><h2>Contestants</h2><p>Starting the game locks this list.</p></div>${playerList(game, { readyMap })}</section>
    </div>`,
    ""
  );
  document.querySelector("#lobby-ready")?.addEventListener("click", (event) => runAction(event.currentTarget, () => state.service.markLobbyReady(game.gameId), "Ready…"));
  document.querySelector("#start-game")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    const payload = await prepareRound(game, 1);
    await state.service.startGame(game.gameId, payload);
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
    `${gameHeading(game, `<span class="pill live">Answers open</span>`)}
    <div class="round-stage">${questionCard(round, game)}
      <section class="panel">
        <div class="progress-track"><div class="progress-bar" style="width:${totalPlayers ? submittedCount / totalPlayers * 100 : 0}%"></div></div>
        <div class="progress-copy"><span>${submittedCount} submitted</span><span>${totalPlayers} contestants</span></div>
        <div class="spacer"></div>
        ${!isPlayer() ? `<div class="notice"><span>🎙️</span><span>Host view: contestants are answering now. The board reveals when all answers are locked.</span></div>` : answer?.locked ? `<div class="center-text"><p class="eyebrow">Final answer locked</p><h2 class="answer-preview">${escapeHtml(answer.text)}</h2><p class="muted">Waiting for ${Math.max(0, totalPlayers - submittedCount)} more player${totalPlayers - submittedCount === 1 ? "" : "s"}.</p></div>` : `<form id="answer-form" class="answer-entry"><div class="field"><label for="answer">Complete the search</label><input class="input answer-input" id="answer" name="answer" maxlength="90" required autocomplete="off" placeholder="Type only the missing words…" value="${escapeHtml(sessionStore.readDraft(game.gameId, game.currentRound))}" /></div><button class="btn btn-main" type="submit">SUBMIT ANSWER</button></form>`}
      </section>
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
  if (isHost() && allPlayersSubmitted(game)) queueMicrotask(() => state.service.revealRound(game.gameId));
}

function renderScoring(game) {
  const round = getRound(game);
  const myAnswer = round?.answers?.[uid()]?.text || "";
  const match = findAnswerMatch(round.query, myAnswer, round.suggestions);
  const claim = round?.scoreClaims?.[uid()];
  layout(
    `${gameHeading(game, `<span class="pill">Round ${game.currentRound} reveal</span>`)}
    <div class="round-stage">${questionCard(round, game)}${answerBoard(round)}
      <section class="panel">
        ${isPlayer() ? `<div class="suggested-score-card ${match.matched ? "score-hit" : "score-miss"}"><span>Suggested award</span><strong>${match.points}</strong><small>${match.points === 1 ? "POINT" : "POINTS"}</small></div><div class="spacer"></div>` : ""}
        ${isPlayer() ? claim ? `<div class="notice"><span>✓</span><span>Your score is locked at <strong>${claim.points} points</strong>. Waiting for the rest of the room.</span></div>` : `<div class="score-claim"><div class="match-card ${match.matched ? "hit" : "miss"}"><strong>${match.matched ? `Match found at #${match.rank}` : "No exact match found"}</strong><span>Your answer: “${escapeHtml(myAnswer)}”${match.suggestion ? ` · Board: “${escapeHtml(match.suggestion)}”` : ""}</span></div><div class="field"><label for="score-claim">Your score</label><select id="score-claim" class="select">${[0,1,2,3,4,5,7,10].map((points) => `<option value="${points}" ${points === match.points ? "selected" : ""}>${points} pts</option>`).join("")}</select></div></div><div class="spacer"></div><button id="confirm-score" class="btn btn-main">FINAL SUBMIT SCORE</button>` : `<div class="notice"><span>🎙️</span><span>Host view: players are confirming the suggested scores.</span></div>`}
        ${isHost() ? `<div class="spacer"></div><button id="finalize-round" class="btn btn-primary" ${allScoresConfirmed(game) ? "" : "disabled"}>GO TO ROUND RECAP</button>` : ""}
      </section>
    </div>`,
    "compact"
  );
  playOnce(`${game.gameId}:${game.currentRound}:reveal`, () => soundEffects.reveal());
  document.querySelector("#confirm-score")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    const points = Number(document.querySelector("#score-claim").value);
    await state.service.confirmScore(game.gameId, game.currentRound, points);
    soundEffects.score(points);
  }, "Submitting…"));
  document.querySelector("#finalize-round")?.addEventListener("click", (event) => runAction(event.currentTarget, () => state.service.finalizeRound(game.gameId), "Tallying…"));
}

function roundPlayerResults(game, roundNumber = game.currentRound) {
  const round = getRound(game, roundNumber);
  const results = round?.results ? Object.values(round.results) : calculateRoundResults(game, roundNumber);
  return `<div class="round-player-list">${results.sort((a,b) => b.points - a.points).map((result) => `<div class="round-player-row">${playerAvatar(result.displayName)}<div class="player-copy"><strong>${escapeHtml(result.displayName)}</strong><span>“${escapeHtml(result.answer || "No answer")}"</span></div><div class="score"><strong>${result.points}</strong><span>points</span></div></div>`).join("")}</div>`;
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
    ${winnerShowcase}<div class="spacer"></div>
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
      ${complete ? `<h2>The game is complete!</h2><p class="muted">One more tap sends everyone to the finale.</p>${isHost() ? `<button id="finish-game" class="btn btn-main">SHOW THE WINNER</button>` : `<div class="notice"><span>🏆</span><span>Waiting for the host to open the finale.</span></div>`}` : `<h2>Round ${nextRound} is next</h2><p class="muted">${readyCount} of ${lockedPlayerIds(game).length} contestants have joined the next round.</p><div class="progress-track"><div class="progress-bar" style="width:${lockedPlayerIds(game).length ? readyCount / lockedPlayerIds(game).length * 100 : 0}%"></div></div><div class="spacer"></div>${isHost() ? `<button id="start-next-round" class="btn btn-main" ${allPlayersReady(game, nextRound) ? "" : "disabled"}>START ROUND ${nextRound}</button>` : ready ? `<div class="notice"><span>✓</span><span>You're in. Waiting for the other players and host.</span></div>` : `<button id="ready-next-round" class="btn btn-main">PROCEED TO NEXT ROUND</button>`}${isHost() && isPlayer() && !ready ? `<div class="spacer"></div><button id="host-ready-next" class="btn btn-secondary">JOIN NEXT ROUND AS A PLAYER</button>` : ""}`}
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
    navigate(`/game/${game.gameId}/play`);
  }, "Opening round…"));
  document.querySelector("#finish-game")?.addEventListener("click", (event) => runAction(event.currentTarget, async () => {
    await state.service.finishGame(game.gameId);
    state.highScores = null;
    navigate(`/game/${game.gameId}/finale`);
  }, "Opening finale…"));
}

function renderFinale(game) {
  const { winners } = summarizeGame(game);
  const winnerNames = winners.map((winner) => winner.displayName).join(" & ");
  layout(
    `${celebrationPieces(72, "finale-confetti")}${gameHeading(game, `<span class="pill">Finale</span>`)}
    <section class="panel glow finale"><div class="finale-crown" aria-hidden="true"><span>★</span></div><p class="eyebrow">${winners.length > 1 ? "Co-champions" : "Tonight's champion"}</p><h1 class="winner-name">${escapeHtml(winnerNames)}</h1><p class="winner-copy">${winners[0]?.totalScore || 0} points · ${winners[0]?.highRoundCount || 0} round wins</p><div class="divider"></div>${leaderboard(game)}<div class="spacer"></div><div class="button-row center"><a class="btn btn-main" href="#/create">PLAY AGAIN</a><a class="btn btn-ghost" href="#/game/${game.gameId}/details">Full Game Details</a></div></section>`,
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
    <section class="panel"><div class="panel-header"><h2>Game Settings</h2><p>Changes appear for every connected player.</p></div><form id="settings-form" class="form-grid"><div class="field"><label for="settings-nickname">Game nickname</label><input class="input" id="settings-nickname" name="nickname" maxlength="40" value="${escapeHtml(game.nickname)}" required /></div><button class="btn btn-primary" type="submit">SAVE NICKNAME</button></form></section>
    <section class="panel"><div class="panel-header"><h2>Contestants</h2><p>Removing a player is permanent and also removes them from the current round's waiting gates.</p></div><div class="player-list">${Object.entries(game.players || {}).map(([playerUid, player]) => `<div class="player-row">${playerAvatar(player.displayName)}<div class="player-copy"><strong>${escapeHtml(player.displayName)}</strong><span>${player.totalScore || 0} points</span></div><button class="btn btn-danger btn-small remove-player" data-uid="${escapeHtml(playerUid)}">Remove</button></div>`).join("")}</div></section>
    <section class="panel"><div class="panel-header"><h2>Edit Round Scores</h2><p>Host changes update the player's total score immediately.</p></div>${completedRounds.length ? completedRounds.map(([roundNumber, round]) => `<div class="match-card"><strong>Round ${roundNumber}: ${escapeHtml(round.prompt)}</strong><div class="spacer"></div><div class="form-grid">${Object.values(round.results || {}).map((result) => `<div class="toggle-row"><div class="toggle-copy"><strong>${escapeHtml(result.displayName)}</strong><span>“${escapeHtml(result.answer)}”${result.hostEdited ? " · Host edited" : ""}</span></div><select class="select score-edit" style="width:100px" data-round="${roundNumber}" data-uid="${escapeHtml(result.uid)}">${[0,1,2,3,4,5,7,10].map((points) => `<option value="${points}" ${Number(result.points) === points ? "selected" : ""}>${points}</option>`).join("")}</select></div>`).join("")}</div></div><div class="spacer"></div>`).join("") : `<div class="empty-state"><strong>No completed rounds</strong>Score editing appears here after Round 1.</div>`}</section>
    <div class="button-row center"><a class="btn btn-main" href="#/game/${game.gameId}/${game.phase === "lobby" ? "lobby" : game.phase === "recap" ? "recap" : game.phase === "finished" ? "finale" : "play"}">RETURN TO GAME</a></div>`,
    "compact"
  );
  document.querySelector("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runAction(event.submitter, () => state.service.updateGameSettings(game.gameId, { nickname: document.querySelector("#settings-nickname").value.trim() }), "Saving…");
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
    <section class="panel"><div class="player-list">${Object.entries(state.users).map(([userUid, user]) => `<div class="player-row">${playerAvatar(user.displayName)}<div class="player-copy"><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.role || "player")} · ${escapeHtml(user.hostNumber || "No host number")}</span></div><select class="select role-select" style="width:120px" data-uid="${escapeHtml(userUid)}" ${userUid === uid() ? "disabled" : ""}><option value="player" ${user.role === "player" ? "selected" : ""}>Player</option><option value="host" ${user.role === "host" ? "selected" : ""}>Host</option></select></div>`).join("")}</div></section>
    <div class="button-row center"><a class="btn btn-main" href="#/host">BACK TO HOST CENTER</a></div>`,
    "compact"
  );
  document.querySelectorAll(".role-select").forEach((select) => select.addEventListener("change", async () => {
    await runAction(select, async () => {
      await state.service.setUserRole(select.dataset.uid, select.value);
      state.users = await state.service.listUsers();
      toast("Account role updated.", "success");
      renderAdmin();
    }, "Saving…");
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
