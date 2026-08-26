# Google Fued

A responsive, installable autocomplete party game for family gatherings. Players create accounts, join with a six-character code, submit one answer per round, confirm the suggested score, and compete across a host-selected number of rounds.

The app is intentionally built without a package manager or compilation step. GitHub Pages serves the HTML, CSS, JavaScript modules, and original artwork directly.

## What is included

- Player account creation and email/password login
- Master, host, and player roles
- Master user controls for promoting hosts and assigning host numbers
- Host game creation with nickname, room code, round count, and host-play option
- Realtime lobby, answer submission, answer reveal, score confirmation, recaps, and finale
- Seven ranked answers worth `10, 7, 5, 4, 3, 2, 1` points
- Player-agreed score overrides and host score editing
- Full game and round-detail views
- Persistent scores, previous-round results, and round-win counts
- Built-in answer snapshots for reliable offline/fallback play
- Optional real-time autocomplete adapter using a free Cloudflare Worker and SerpApi
- Playable preview mode before Firebase is configured
- GitHub Pages deployment workflow
- Progressive Web App manifest and offline shell caching
- Original game-show stage artwork, icon, animations, and visual system

## Architecture

| Part | Service | Cost for this use |
| --- | --- | --- |
| Website files | GitHub Pages | Free with a public GitHub Free repository |
| Accounts and live game state | Firebase Authentication + Realtime Database Spark plan | Free within the family-sized quotas |
| Live autocomplete proxy | Cloudflare Worker Free plan | Free within the Worker quota |
| Google autocomplete results | SerpApi Free plan | 250 searches per month; one search is used per live round |

The game always has a built-in answer-bank fallback. If a live query fails or its free monthly allowance is exhausted, the round still opens with the stored seven-answer snapshot.

## Run the playable preview

From the project folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Because `src/config.js` initially contains placeholder Firebase values, the app automatically runs in preview mode with a demo master account and two sample players.

## Production setup

Follow [docs/SETUP.md](docs/SETUP.md) in order:

1. Create and configure the Firebase project.
2. Create the first account and securely mark it as the master user.
3. Optionally configure live autocomplete.
4. Create the `seansommer/googlefued` public repository and enable GitHub Pages.
5. Run the launch checklist on at least two devices.

## Important security notes

- The Firebase web configuration in `src/config.js` identifies the Firebase project; it is not a server secret. Database Rules protect the data.
- Never place the SerpApi key in `src/config.js`, GitHub, or browser code. Save it only as a Cloudflare Worker secret.
- The master-user flag must be created manually in Firebase. The public app cannot promote itself to master.
- GitHub Free serves Pages from a public repository, so all committed source files are visible.

## Naming and attribution

The app currently uses the requested working title “Google Fued.” Its design does not imitate Google's logo, color sequence, typography, or interface. The app includes an on-screen notice that it is unofficial and is not affiliated with Google LLC or Family Feud.

Google's published brand guidance advises developers not to incorporate “Google” into a product name. Before broad public distribution, consider changing `APP_CONFIG.title` and the matching metadata to a unique title such as “Autocomplete Showdown.”

## Project map

```text
assets/                         Original icon and generated stage artwork
cloudflare-worker/              Optional protected live-suggestion proxy
docs/                           Setup and game-system documentation
src/config.js                   Title, Firebase values, and Worker endpoint
src/core.js                     Matching, scoring, ranking, and state helpers
src/data/question-bank.js       Reliable seven-answer fallback rounds
src/services/                   Firebase, demo, storage, and live providers
src/app.js                      Screens, navigation, and interaction flow
firebase-database.rules.json    Realtime Database security rules
.github/workflows/pages.yml     GitHub Pages deployment
```

## License

The original project code is available under the MIT License. The generated game artwork is provided as part of this project for use with the game.
