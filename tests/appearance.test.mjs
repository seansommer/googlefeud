import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as core from "../src/core.js";

// Exercise the actual UI functions without Firebase, audio, or a signed-in account.
const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/\ninit\(\);\s*$/, "\n");

function createUI(savedNightMode = false) {
  const elements = new Map();
  const doc = { activeElement: null, querySelector: (key) => elements.get(key) ?? null, querySelectorAll: () => [] };
  const makeElement = (key) => {
    const classes = new Set();
    const element = {
      isConnected: true, attributes: {}, handlers: {}, textContent: "", innerHTML: "",
      classList: {
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
        contains: (name) => classes.has(name)
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      querySelector: (selector) => elements.get(selector) ?? null,
      addEventListener(name, handler) { this.handlers[name] = handler; },
      focus() { doc.activeElement = this; },
      remove() { this.isConnected = false; elements.delete(key); }
    };
    elements.set(key, element);
    return element;
  };
  for (const key of ["#app", "#toast-region", "html", 'meta[name="theme-color"]', "#night-mode-toggle", ".night-mode-label", "#sound-toggle", "#card-trigger"]) makeElement(key);
  doc.documentElement = elements.get("html");
  doc.activeElement = elements.get("#card-trigger");
  let cardHTML = "";
  doc.body = {
    insertAdjacentHTML(_position, html) {
      cardHTML = html;
      for (const key of ["#lifetime-player-modal", "#close-lifetime-card", ".lifetime-card-content"]) makeElement(key);
    }
  };
  const preferences = { nightMode: savedNightMode };
  const sandbox = {
    ...core,
    document: doc,
    window: { location: { hash: "#/home" } },
    APP_CONFIG: { title: "Google Feud", officialDisclaimer: "Unofficial family game." },
    sessionStore: {
      getNightMode: () => preferences.nightMode,
      setNightMode: (enabled) => { preferences.nightMode = enabled; }
    },
    soundEffects: { enabled: false, syncBackgroundMusic() {} },
    clearInterval() {},
    console
  };
  vm.runInNewContext(source + "\nthis.ui = { state, topbar, legalFooter, layout, applyNightMode, toggleNightMode, showLifetimePlayerCard };", sandbox);
  return { ...sandbox.ui, doc, elements, preferences, sound: sandbox.soundEffects, get cardHTML() { return cardHTML; } };
}

test("night toggle leaves the active page, answer, score, and timer untouched", () => {
  const ui = createUI();
  ui.state.game = { phase: "answering" };
  ui.state.roundTimerInterval = 42;
  ui.elements.get("#app").innerHTML = '<input value="tie a tie"><select><option selected>7</option></select>';
  const page = ui.elements.get("#app").innerHTML;
  ui.toggleNightMode();
  assert.equal(ui.doc.documentElement.classList.contains("night-mode"), true);
  assert.equal(ui.elements.get("#night-mode-toggle").attributes["aria-pressed"], "true");
  assert.equal(ui.elements.get(".night-mode-label").textContent, "NIGHT ON");
  assert.equal(ui.preferences.nightMode, true);
  assert.equal(ui.sound.enabled, false);
  assert.equal(ui.elements.get("#app").innerHTML, page);
  assert.equal(ui.state.roundTimerInterval, 42);
  ui.toggleNightMode();
  assert.equal(ui.doc.documentElement.classList.contains("night-mode"), false);
  assert.equal(ui.elements.get('meta[name="theme-color"]').attributes.content, "#100b38");
});

test("night mode is restored on launch and remains active across page renders", () => {
  const ui = createUI(true);
  ui.applyNightMode();
  assert.equal(ui.doc.documentElement.classList.contains("night-mode"), true);
  ui.layout("<p>Next round</p>");
  assert.equal(ui.elements.get("#night-mode-toggle").attributes["aria-pressed"], "true");
  assert.equal(ui.elements.get('meta[name="theme-color"]').attributes.content, "#070711");
  assert.equal(ui.elements.get("#night-mode-toggle").handlers.click, ui.toggleNightMode);
});

test("header has a home icon and accessible appearance control; footer retains disclaimer", () => {
  const ui = createUI();
  ui.state.user = { uid: "test-player" };
  ui.state.profile = { displayName: "Casey & Friends", email: "not-public@example.test" };
  const header = ui.topbar();
  assert.match(header, /class="brand" href="#\/home" aria-label="Google Feud home"/);
  assert.match(header, /class="brand-badge" aria-hidden="true"><svg/);
  assert.match(header, /id="night-mode-toggle"[^>]*aria-pressed="false"/);
  assert.match(header, /Casey &amp; Friends/);
  assert.equal(header.includes("not-public@example.test"), false);
  assert.match(ui.legalFooter(), /footer-wordmark\.webp/);
  assert.match(ui.legalFooter(), /Unofficial family game\./);
});

test("footer turns the black matte and near-black fringe transparent without blending", () => {
  const html = createUI().legalFooter();
  assert.match(html, /color-interpolation-filters="sRGB"/);
  assert.match(html, /filter="url\(#footer-alpha-cutout\)"/);
  assert.match(html, /role="img" aria-labelledby="footer-wordmark-title"/);
  const matrix = html.match(/feColorMatrix type="matrix" values="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  assert.equal(matrix.length, 20);
  const transform = (pixel) => [0, 1, 2, 3].map((row) => Math.max(0, Math.min(1,
    pixel.reduce((sum, value, col) => sum + value * matrix[row * 5 + col], matrix[row * 5 + 4])
  )));
  assert.deepEqual(transform([0, 0, 0, 1]), [0, 0, 0, 0]);
  assert.equal(transform([0.02, 0.02, 0.02, 1])[3], 0);
  assert.deepEqual(transform([1, 1, 1, 1]), [1, 1, 1, 1]);
  assert.deepEqual(transform([0, 0.25, 0.65, 1]), [0, 0.25, 0.65, 1]);
  assert.deepEqual(transform([1, 0.7, 0.1, 1]), [1, 0.7, 0.1, 1]);
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css.match(/\.footer-wordmark svg\s*\{([^}]+)\}/)[1], /mix-blend-mode/);
});

test("footer artwork is 35% of its previous width and Created by Sean is the final text", () => {
  const html = createUI().legalFooter();
  assert.match(html, /Unofficial family game\.<\/p><p class="creator-credit"><strong>Created by Sean<\/strong><\/p><\/footer>$/);
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const wordmark = css.match(/\.footer-wordmark\s*\{([^}]+)\}/)[1];
  assert.match(wordmark, /width: min\(122\.5px, 35%\)/);
  assert.match(wordmark, /min-height: 44px/, "the smaller logo retains a usable tap target");
  assert.match(css.match(/\.creator-credit\s*\{([^}]+)\}/)[1], /font-weight: 700/);
  const badge = css.match(/\.brand-badge\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(badge, /rotate\(/, "the home icon is upright");
});

test("app initialization installs repeatable audio activation handlers", () => {
  assert.match(source, /soundEffects\.installUnlockHandlers\(\)/);
  assert.doesNotMatch(source, /addEventListener\("pointerdown", unlockSound/);
});

test("night background has subtle gradients and excludes the stage image", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const background = css.match(/\.night-mode \.app-shell::before\s*\{([^}]+)\}/)[1];
  assert.match(background, /radial-gradient/);
  assert.match(background, /linear-gradient/);
  assert.doesNotMatch(background, /url\(/);
});

test("player card keeps every statistic and places Close after the scrollable content", () => {
  const ui = createUI();
  ui.showLifetimePlayerCard({ displayName: "Casey <script>", accountRole: "host", lifetimeRank: 2, totalPoints: 240, gamesPlayed: 8, roundsPlayed: 40, roundsWon: 15, averagePointsPerRound: 6, bestGameScore: 60, bestRoundWinStreak: 4, bestGameNumber: 19 });
  const html = ui.cardHTML;
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="lifetime-card-name"/);
  assert.match(html, /Casey &lt;script&gt;/);
  assert.equal(html.includes("<script>"), false);
  for (const label of ["Total points", "Games played", "Rounds played", "Rounds won", "Avg. points / round", "Round win rate", "Best game", "Best win streak", "Host", "#2"]) assert.ok(html.includes(label), label);
  assert.match(html, /lifetime-card-footer[\s\S]*?<\/div>\s*<\/div>\s*<div class="lifetime-card-actions"><button[^>]*id="close-lifetime-card"/);
  assert.equal(ui.doc.activeElement, ui.elements.get("#close-lifetime-card"));
  ui.elements.get("#close-lifetime-card").onclick();
  assert.equal(ui.elements.has("#lifetime-player-modal"), false);
  assert.equal(ui.doc.activeElement, ui.elements.get("#card-trigger"));
});

test("player card supports keyboard scrolling, contained tab focus, Escape, and backdrop close", () => {
  const ui = createUI();
  ui.showLifetimePlayerCard({ displayName: "New player" });
  assert.match(ui.cardHTML, /Unranked/);
  assert.match(ui.cardHTML, /0\.00/);
  assert.match(ui.cardHTML, /0\.0%/);
  const modal = ui.elements.get("#lifetime-player-modal");
  modal.handlers.keydown({ key: "Tab", preventDefault() {} });
  assert.equal(ui.doc.activeElement, ui.elements.get(".lifetime-card-content"));
  modal.handlers.keydown({ key: "Tab", shiftKey: true, preventDefault() {} });
  assert.equal(ui.doc.activeElement, ui.elements.get("#close-lifetime-card"));
  modal.handlers.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(ui.elements.has("#lifetime-player-modal"), false);
  ui.showLifetimePlayerCard({ displayName: "New player" });
  const reopened = ui.elements.get("#lifetime-player-modal");
  reopened.handlers.click({ target: reopened });
  assert.equal(ui.elements.has("#lifetime-player-modal"), false);
});

test("player card can restore an explicit opener after its loading state blurred focus", () => {
  const ui = createUI();
  const opener = ui.elements.get("#card-trigger");
  ui.doc.activeElement = null;
  ui.showLifetimePlayerCard({ displayName: "Casey" }, opener);
  ui.elements.get("#close-lifetime-card").onclick();
  assert.equal(ui.doc.activeElement, opener);
});
