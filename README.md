# Google Fued

A responsive, installable autocomplete party game for family gatherings. Players create accounts, join with a six-character code, submit one answer per round, confirm the suggested score, and compete across a host-selected number of rounds.

The app is intentionally built without a package manager or compilation step. GitHub Pages serves the HTML, CSS, JavaScript modules, and original artwork directly.

## What is included

- Password-free player profiles using email and nickname
- Automatic new-player routing when no matching profile exists
- Password-free player, host, and master sign-in
- Player-editable nicknames with punctuation-insensitive matching
- Master, host, and player roles
- Private Firebase role assignments for master `H-00001` and general host `H-00002`
- Master user controls for promoting hosts and assigning host numbers
- Host game creation with nickname, room code, round count, and host-play option
- Realtime lobby, answer submission, answer reveal, score confirmation, recaps, and finale
- Original Web Audio game-show cues with an on-screen sound toggle
- Round-winner spotlights, animated light rays, confetti, and finale fanfare
- Ambient home-screen confetti, prominent suggested-point displays, and an in-game refresh control
- Seven ranked answers worth `10, 7, 5, 4, 3, 2, 1` points
- Player-agreed score overrides and host score editing
- Full game and round-detail views
- Persistent scores, previous-round results, and round-win counts
- Built-in answer snapshots for reliable offline/fallback play
- Optional real-time autocomplete adapter using a free Cloudflare Worker and SerpApi
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
| Google autocomplete results | SerpApi Free plan | 250 searches per month; one search is used per live round |

The game always has a built-in answer-bank fallback. If a live query fails or its free monthly allowance is exhausted, the round still opens with the stored seven-answer snapshot.

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
3. Optionally configure live autocomplete.
4. Create the `seansommer/googlefued` public repository and enable GitHub Pages.
5. Run the launch checklist on at least two devices.

## Important security notes

- The Firebase web configuration in `src/config.js` identifies the Firebase project; it is not a server secret. Database Rules protect the data.
- Regular player login is intentionally trust-based: anyone who knows the matching email and nickname can open that player profile. Do not store sensitive personal information in player profiles.
- Host access uses the same trust-based email-and-nickname entry. Emails are not displayed after login, but this is convenience—not secure identity verification.
- Never place the SerpApi key in `src/config.js`, GitHub, or browser code. Save it only as a Cloudflare Worker secret.
- Master and host roles are assigned privately in Firebase after each profile is created once; no host credential is committed to the public repository.
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
src/services/                   Firebase, sound effects, storage, and live providers
src/app.js                      Screens, navigation, and interaction flow
firebase-database.rules.json    Realtime Database security rules
.github/workflows/pages.yml     GitHub Pages deployment
```

## License

The original project code is available under the MIT License. The generated game artwork is provided as part of this project for use with the game.
