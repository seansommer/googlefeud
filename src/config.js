export const APP_CONFIG = {
  title: "Google Fued",
  tagline: "Guess what the internet finishes.",
  officialDisclaimer:
    "Unofficial, fan-made party game. Not affiliated with or endorsed by Google LLC or Family Feud.",
  funnyDisclaimer:
    "Autocomplete has a mind of its own. No search engines were emotionally consulted.",
  repositoryUrl: "https://github.com/seansommer/googlefued",
  scoreByRank: [10, 7, 5, 4, 3, 2, 1],
  maxPlayers: 16,
  minRounds: 1,
  maxRounds: 20,
  firebase: {
    apiKey: "AIzaSyB-kX4n1D_ps1RN5asq4fyuvEWEXRd6fbk",
    authDomain: "fued-728c4.firebaseapp.com",
    databaseURL: "https://console.firebase.google.com/u/3/project/fued-728c4/database/fued-728c4-default-rtdb/data/~2F",
    projectId: "fued-728c4",
    appId: "1:725218404048:web:4213999a77be57a59ca0d5"
  },
  // A Cloudflare Worker URL can protect a live suggestion-provider API key.
  // Example: https://googlefued-suggestions.YOUR-NAME.workers.dev
  suggestionEndpoint: ""
};

export const isFirebaseConfigured = () =>
  APP_CONFIG.firebase.apiKey && !APP_CONFIG.firebase.apiKey.includes("REPLACE_ME");

export const isLiveSuggestionsConfigured = () => Boolean(APP_CONFIG.suggestionEndpoint);
