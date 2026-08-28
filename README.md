# Google Feud

A responsive, installable autocomplete party game for family gatherings. Players create accounts, join with a six-character code, submit one answer per round, confirm the suggested score, and compete across a host-selected number of rounds.

The app is intentionally built without a package manager or compilation step. GitHub Pages serves the HTML, CSS, JavaScript modules, and original artwork directly.

## What is included

- Password-free player profiles using email and nickname
- Automatic new-player routing when no matching profile exists
- Password-free player, host, and master sign-in
- Player-editable nicknames with punctuation-insensitive matching
- Master, host, and player roles
- Private Firebase role assignments for master `H-00001` and general host `H-00002`
- Master user controls for promoting hosts, assigning host numbers, and permanently deleting game records
- Counted, collapsible Master Controls for pending host requests, pending question reviews, users, and game records
- Searchable, role-grouped Master Controls with master, host, and player lists sorted alphabetically
- Player-submitted host-access requests with a private master approval queue
- Safe game deletion that removes room history and recalculates affected lifetime totals, streaks, and high scores
- Verified atomic Master Controls for promoting or returning trusted profiles
- Host game creation with nickname, room code, round count, and host-play option
- Optional two-to-four-team mode with host-defined starting names
- Lobby team selection plus synchronized team renaming and player-selected team colors throughout the game
- Live team totals, round contributions, team standings, and an ultimate-team finale
- Per-game victory modes for Total Points or Most Rounds Won, applied to both individuals and teams
- Individual rankings and lifetime statistics remain active during team games
- Realtime lobby, answer submission, answer reveal, score confirmation, recaps, and finale
- Host-adjustable round timer with automatic answer lock and reveal, enabled at 30 seconds by default with an untimed-game option
- Live contestant status lists for readiness, answers, scores, and next-round joins
- Tap-to-reference answer-board scoring with prominent final-point controls
- Original Web Audio game-show cues, a calm homepage theme, and a separate playful focus loop for open-answer rounds
- Menu-based Sound Settings for background music and effects while retaining the top master sound toggle
- Header night-mode toggle with a subtle near-black navy/violet gradient and a saved per-device preference
- Home-shaped navigation badge and a footer wordmark based on the social-sharing artwork
- Round-winner spotlights, animated light rays, confetti, and finale fanfare
- Ambient home-screen confetti, compact suggested points, prominent final-point controls, and an in-game refresh control
- A 1200×630 themed social-sharing card for text messages and social apps
- Seven ranked answers worth `10, 7, 5, 4, 3, 2, 1` points
- Player-agreed score overrides and host score editing
- Full game and round-detail views
- Persistent scores, previous-round results, and round-win counts
- Host Center all-time high scores capped to the top ten players
- Signed-in Hall of Fame with six all-time championship categories
- Lifetime player cards with points, games, rounds, wins, averages, and records, accessible from live-game contestant lists, recaps, and the signed-in nickname in the header
- Signed-in player cards show the account classification as Player, Host, or Master
- Compact lifetime cards with scrollable statistics and an always-reachable Close button on small screens
- Lifetime player cards show each contestant's all-time rank based on total lifetime points, including shared ranks for ties
- Player question submissions with a pending-only master review queue plus an approved-bank manager for adding, editing, and deleting custom questions
- Host-selectable original and approved-custom question banks for every new live game
- Original illustrated home-screen app icon for iOS, Android, and installed web-app shortcuts
- Interactive trophy celebrations for category winners and co-champions
- Idempotent completed-game synchronization that safely backfills earlier results
- 500 varied, non-duplicate live prompt starters across 20 categories
- Recent-question memory that avoids the last 250 prompts used by that host device
- Clearly labelled saved answer boards for pre-provider testing only
- Real-time autocomplete adapter using a free Cloudflare Worker and SerpApi
- Prompt-prefix filtering and completion deduplication for cleaner live answer boards
- Typo-friendly automatic matching with approximately 20% edit tolerance
- Live-only Firebase operation with a clear connection error instead of demo fallback
- GitHub Pages deployment workflow
- Progressive Web App manifest and offline shell caching
- Original game-show stage artwork, icon, animations, and visual system

## Architecture

| Part | Service | Cost for this use |
| --- | --- | --- |
| Website files | GitHub Pages | Free with a public GitHub Free repository |
| Accounts and live game state | Firebase Anonymous Authentication + Realtime Database Spark plan | Free within the family-sized quotas |
| Live autocomplete proxy | Cloudflare Worker Free plan | Free within the Worker quota |
| Google autocomplete results | SerpApi Free plan | 250 searches per month; normally one search per live round, with limited retries when a prompt yields fewer than seven results |

Live rounds request a current board immediately before the round opens and never fall back to stored answers. If a query cannot produce seven results, the app tries another unused prompt; if the provider itself is unavailable, the round stays closed with an actionable error. The 12 saved boards are a separate testing mode used only while no live endpoint is configured.

## Run locally

From the project folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. The app connects to the configured Firebase project; it never falls back to demo data.

## Production setup

Follow [docs/SETUP.md](docs/SETUP.md) in order:

1. Create and configure the Firebase project.
2. Enable Firebase Anonymous Authentication and publish the included database rules.
3. Configure live autocomplete to unlock the 500-prompt current-results mode.
4. Create the `seansommer/googlefeud` public repository and enable GitHub Pages.
5. Run the launch checklist on at least two devices.

For the final answer-provider connection only, use [docs/GO_LIVE.md](docs/GO_LIVE.md).

## Important security notes

- The Firebase web configuration in `src/config.js` identifies the Firebase project; it is not a server secret. Database Rules protect the data.
- Regular player login is intentionally trust-based: anyone who knows the matching email and nickname can open that player profile. Do not store sensitive personal information in player profiles.
- Host access uses the same trust-based email-and-nickname entry. Emails are not displayed after login, but this is convenience—not secure identity verification.
- Hall of Fame records contain only display names and game statistics; email addresses are not copied into public player cards or leaderboard data.
- Never place the SerpApi key in `src/config.js`, GitHub, or browser code. Save it only as a Cloudflare Worker secret.
- Master and host roles are assigned privately in Firebase after each profile is created once; no host credential is committed to the public repository.
- GitHub Free serves Pages from a public repository, so all committed source files are visible.

## Naming and attribution

The app currently uses the requested working title “Google Feud.” Its design does not imitate Google's logo, color sequence, typography, or interface. The app includes an on-screen notice that it is unofficial and is not affiliated with Google LLC or Family Feud.

Google's published brand guidance advises developers not to incorporate “Google” into a product name. Before broad public distribution, consider changing `APP_CONFIG.title` and the matching metadata to a unique title such as “Autocomplete Showdown.”

## Project map

```text
assets/                         Original icon and generated stage artwork
cloudflare-worker/              Protected live-suggestion proxy
docs/                           Setup and game-system documentation
src/config.js                   Title, Firebase values, and Worker endpoint
src/core.js                     Matching, scoring, ranking, and state helpers
src/data/question-bank.js       500 live prompt starters and 12 test boards
src/services/                   Firebase, sound effects, storage, and live providers
src/app.js                      Screens, navigation, and interaction flow
firebase-database.rules.json    Realtime Database security rules
.github/workflows/pages.yml     GitHub Pages deployment
```

## License

The original project code is available under the MIT License. The generated game artwork is provided as part of this project for use with the game.
