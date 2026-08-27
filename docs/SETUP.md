# Complete Setup Walkthrough

Work through these sections in order. The app runs only against the live Firebase project and does not fall back to demo data.

## 1. Create the Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/), sign in, and choose **Create a project**.
2. Use a name such as `googlefeud`. Google Analytics is not required for this game and can remain disabled.
3. Keep the project on Firebase's no-cost **Spark** plan.
4. From Project Overview, choose the **Web** icon (`</>`).
5. Register a web app named `Google Feud Web`. Firebase Hosting is not needed because GitHub Pages hosts the files.
6. Firebase displays a configuration object containing `apiKey`, `authDomain`, `databaseURL` or project information, `projectId`, and `appId`.
7. Open `src/config.js` and replace every `REPLACE_ME` value inside `APP_CONFIG.firebase`. If the registration snippet does not show `databaseURL`, add it after creating Realtime Database in Step 3 below.

Firebase's web configuration is designed to appear in browser code. Do not treat it as a private server key. Security comes from Authentication and Database Rules.

### Existing-project spelling correction

For the current project, open **Project settings → General** and change both **Project name** and **Public-facing name** to `Google Feud`. Also update the web app nickname to `Google Feud Web` if Firebase offers the edit control.

Do not change the existing `projectId`, `authDomain`, or `databaseURL` values in `src/config.js`. Firebase project IDs are permanent after resource provisioning, so the current internal identifier must remain in those three connection values. It is not displayed anywhere in the game. A completely new Firebase project would be required to replace that internal ID and would require migrating every account, game, and statistic.

## 2. Enable password-free sign-in

1. In Firebase Console, open **Build → Authentication**.
2. Choose **Get started**.
3. Open **Sign-in method**.
4. Enable **Anonymous**. This provides a private Firebase session behind each instant player profile; players never see it and never enter a password.
5. Under **Settings → User actions**, confirm that creating new user accounts is enabled. A disabled setting returns `ADMIN_ONLY_OPERATION` and prevents every player from entering.
6. Leave **Email/Password** and **Google** disabled; neither is used.
7. Confirm `seansommer.github.io` is an authorized domain if Firebase shows an Authorized domains list.

Regular players enter only an email and nickname. If that normalized pair exists, they enter immediately; otherwise the app opens the Create Player screen. Nickname matching ignores capitalization, spaces, accents, and punctuation. Email matching ignores capitalization and surrounding spaces but retains punctuation.

This is intentionally a trusted-family login: anyone who knows another player's email and nickname can act as that player, including joining games and submitting answers. Email addresses are stored for matching but are never displayed after login. The same trust model applies to hosts.

## 3. Create Realtime Database and install the rules

1. Open **Build → Realtime Database**.
2. Choose **Create Database**.
3. Select the database location nearest the expected players.
4. Start in **Locked mode**.
5. Open the **Rules** tab.
6. Replace its contents with the complete contents of `firebase-database.rules.json`.
7. Choose **Publish**.
8. Return to the **Data** tab and copy the database URL. Put that exact URL in `src/config.js` as `databaseURL`.

The included rules enforce these boundaries:

- Players can create and reopen their own instant profile.
- Ordinary players can read only their own full profile; the master can view all profiles.
- The master can promote any trusted profile to host.
- Master role changes use a complete validated profile transaction, including compatibility with older profiles.
- Players may join only games still in the lobby.
- Players can submit only their own answer and score confirmation.
- A locked answer cannot be replaced.
- Only the game host or a master user can change the overall game, remove players, reveal rounds, finalize scores, or edit results.
- Only the manually established master can promote other accounts.
- A host may publish a player's all-time high score only after a finished game, and only when it exactly matches that game's stored total.
- Any signed-in player may read Hall of Fame display names and gameplay totals; email addresses are never stored in that public statistics area.
- A host may synchronize lifetime statistics only from a game they hosted after it is finished; the master may backfill all finished games.

## 4. Bootstrap the master host

1. Open the deployed game, choose **Host Login**, enter the intended master profile's private email and display name, and confirm **Create Player**.
2. Repeat with the intended general-host profile.
3. In **Firebase → Realtime Database → Data → users**, identify each new profile by its private `email` field.
4. On the intended master profile, change `role` to `master` and add `hostNumber` with value `H-00001`.
5. On the general Host profile, change `role` to `host` and add `hostNumber` with value `H-00002`.
6. Sign both profiles out and back in. The master profile can now open Master Controls; the general host can create games.

These assignments remain private in Firebase. The public GitHub source contains neither email address nor a reusable credential hash.

To add another host, have that person create an email-and-nickname profile once. They can open **Menu → Game dashboard → Request Host Access**. The master then opens **Master Controls → Host Requests** and approves the nickname. Master Controls also provides a nickname search and groups all profiles as Master, Hosts, then Players. Email addresses are never shown there.

## 5. Test Firebase play before deployment

1. Start a local web server from the project folder:

   ```bash
   python3 -m http.server 8080
   ```

2. Open `http://localhost:8080` in a normal browser window and enter the private master-profile email plus its display name.
3. Open a private/incognito window, enter a new email and nickname, confirm the Create Player screen, and join using the host's room code.
4. Create a one-round game using **Built-in answer snapshots**.
5. Confirm that lobby readiness, answer submission, board reveal, score confirmation, recap, and finale update in both windows.

## 6. Live autocomplete setup for the 500-prompt pool

The general Google Search autocomplete list does not have a supported public Google API intended for this game. The included adapter uses SerpApi's Google Autocomplete API and keeps its API key behind a Cloudflare Worker.

Current free allowances are suitable for family play:

- SerpApi Free: 250 searches per month.
- Cloudflare Workers Free: up to 100,000 requests per day.
- The game normally makes one provider search per live round, not one per player. It can make up to four attempts when a prompt yields fewer than seven usable results.
- Every live round requests current results with provider caching disabled.

### Create the provider account

1. Create a free account at [SerpApi](https://serpapi.com/).
2. Copy the private API key from the account dashboard.
3. Do not paste the key into GitHub, `src/config.js`, or any browser file.

### Deploy the free Worker

Use either Cloudflare's browser editor or Wrangler. The browser route is simplest:

1. Create a free [Cloudflare](https://dash.cloudflare.com/) account.
2. Open **Workers & Pages → Create → Worker**.
3. Name the Worker `googlefeud-suggestions`.
4. Replace the sample code with `cloudflare-worker/worker.js`, then deploy.
5. Open the Worker's **Settings → Variables and Secrets**.
6. Add a secret named `SERPAPI_KEY` containing the SerpApi key.
7. Add a plain-text variable named `ALLOWED_ORIGIN` with this value:

   ```text
   https://seansommer.github.io
   ```

8. Redeploy the Worker if Cloudflare requests it.
9. Copy the Worker's URL: `https://googlefeud-suggestions.musicmansean87.workers.dev`.
10. Open `https://googlefeud-suggestions.musicmansean87.workers.dev/health` and confirm it returns `{"ok":true,"providerConfigured":true}`.
11. In `src/config.js`, set `suggestionEndpoint` to that Worker base URL, without `/health`.

The Worker validates input, limits CORS to the GitHub Pages origin, keeps the key server-side, returns exactly seven results, and disables provider caching. New games then use 500 varied prompt starters, remember the last 250 prompt IDs on that host device, and request the answer board immediately before each round. If one prompt returns fewer than seven results, the app tries another unused prompt. It never substitutes a saved board into a live game.

## 7. Create and publish the GitHub repository

The repository address will be:

```text
https://github.com/seansommer/googlefeud
```

The published game address will be:

```text
https://seansommer.github.io/googlefeud/
```

### GitHub website method

1. Sign in to GitHub as `seansommer`.
2. Choose **New repository**.
3. Set the repository name to `googlefeud`.
4. Choose **Public**. GitHub Free Pages for this project requires a public repository.
5. Do not add a second README, license, or `.gitignore`; the project already includes them.
6. Upload every project file and folder, preserving the folder structure.
7. Commit the files to the `main` branch.
8. Open **Settings → Pages**.
9. Under **Build and deployment → Source**, choose **GitHub Actions**.
10. Open the repository's **Actions** tab. The included Pages workflow should run automatically.
11. When it finishes successfully, open `https://seansommer.github.io/googlefeud/`.

Every future commit to `main` automatically republishes the site.

## 8. Launch checklist

- [ ] Assign the intended master profile `master / H-00001` privately in Firebase and confirm Master Controls appear.
- [ ] Assign Host `host / H-00002` privately in Firebase and confirm that profile can create a game.
- [ ] Promote a separate test profile to Host and confirm a Host Number appears.
- [ ] Return that test profile to Player, then promote it again to verify both Master Controls directions.
- [ ] Confirm an unknown email/nickname pair opens Create Player and a known pair signs in immediately.
- [ ] Change a player's nickname, sign out, and confirm the new nickname signs in while the old nickname no longer does.
- [ ] Test with at least one iPhone and one other phone/computer.
- [ ] Confirm a player cannot join after the host starts.
- [ ] Confirm answers remain hidden until everyone submits.
- [ ] Confirm the point order is 10, 7, 5, 4, 3, 2, 1.
- [ ] Test a score override and a host score edit.
- [ ] Confirm all players must enter the next round before the host can start it.
- [ ] Complete the final round and verify ties show co-champions.
- [ ] Create a two-team game, customize both names, and confirm every contestant must select a team.
- [ ] Rename a team from a player device after the game starts and confirm every device updates.
- [ ] Confirm round recaps and the finale show team totals while the individual leaderboard remains present.
- [ ] Open **Hall of Fame** while signed in and confirm all six trophy categories and player cards appear.
- [ ] Tap a category winner and confirm the trophy celebration opens with sound and confetti.
- [ ] Open a player card and confirm it shows lifetime statistics without an email address.
- [ ] If games were completed before the Hall of Fame update, open the page as the master once to backfill those games.
- [ ] After live mode is enabled, temporarily break the Worker URL and verify the round stays closed with a provider error rather than showing an old answer board.
- [ ] On a phone, use **Add to Home Screen** and reopen the installed game.

## 9. Normal maintenance

- Keep the 12 saved boards only for setup testing; live games use the separate 500-prompt pool.
- Increase the service-worker cache name in `service-worker.js` after changing cached files if a phone appears to retain an older version.
- Review Firebase Realtime Database usage occasionally. A family game should remain far below the Spark-plan limit.
- Review SerpApi usage if live rounds stop refreshing. The game remains playable in snapshot mode.
- Never commit API secrets. The only provider secret belongs in Cloudflare's secret manager.
