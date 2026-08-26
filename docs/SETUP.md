# Complete Setup Walkthrough

Work through these sections in order. The app is already playable in local preview mode, so none of this needs to be completed before reviewing the design and game flow.

## 1. Create the Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/), sign in, and choose **Create a project**.
2. Use a name such as `googlefued`. Google Analytics is not required for this game and can remain disabled.
3. Keep the project on Firebase's no-cost **Spark** plan.
4. From Project Overview, choose the **Web** icon (`</>`).
5. Register a web app named `Google Fued Web`. Firebase Hosting is not needed because GitHub Pages hosts the files.
6. Firebase displays a configuration object containing `apiKey`, `authDomain`, `databaseURL` or project information, `projectId`, and `appId`.
7. Open `src/config.js` and replace every `REPLACE_ME` value inside `APP_CONFIG.firebase`. If the registration snippet does not show `databaseURL`, add it after creating Realtime Database in Step 3 below.

Firebase's web configuration is designed to appear in browser code. Do not treat it as a private server key. Security comes from Authentication and Database Rules.

## 2. Enable account creation

1. In Firebase Console, open **Build → Authentication**.
2. Choose **Get started**.
3. Open **Sign-in method**.
4. Enable **Email/Password**. The email-link option can remain disabled.
5. Under Authentication settings, add `seansommer.github.io` to **Authorized domains** if it is not already present.

All users create ordinary player accounts. Host and master access is stored separately in Realtime Database and cannot be selected during sign-up.

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

- Players can create their own profile but cannot make themselves hosts.
- Players may join only games still in the lobby.
- Players can submit only their own answer and score confirmation.
- A locked answer cannot be replaced.
- Only the game host or a master user can change the overall game, remove players, reveal rounds, finalize scores, or edit results.
- Only the manually established master can promote other accounts.
- A host may publish a player's all-time high score only after a finished game, and only when it exactly matches that game's stored total.

## 4. Bootstrap your master account

This is the one intentionally manual security step.

1. Run the configured site locally or deploy it to GitHub Pages.
2. Choose **Create My Player** and register your own email, password, and display name.
3. In Firebase Console, open **Authentication → Users** and copy your account's **User UID**.
4. Open **Realtime Database → Data**.
5. Add a top-level node named `admins`.
6. Under `admins`, add a child whose key is your exact UID and whose Boolean value is `true`:

   ```text
   admins
     YOUR_FIREBASE_UID: true
   ```

7. Open `users → YOUR_FIREBASE_UID` and change `role` from `player` to `master`.
8. Add or change `hostNumber` to `H-00001`.
9. Sign out of the game and sign back in.

Your account will now show **Master Controls**. New users appear there, and you can promote any trusted person to Host. Host numbers are generated automatically and remain attached to their account.

## 5. Test Firebase play before deployment

1. Start a local web server from the project folder:

   ```bash
   python3 -m http.server 8080
   ```

2. Open `http://localhost:8080` in a normal browser window and sign in as the master/host.
3. Open a private/incognito window, create a second player account, and join using the host's room code.
4. Create a one-round game using **Built-in answer snapshots**.
5. Confirm that lobby readiness, answer submission, board reveal, score confirmation, recap, and finale update in both windows.

## 6. Optional live autocomplete setup

The general Google Search autocomplete list does not have a supported public Google API intended for this game. The optional adapter uses SerpApi's Google Autocomplete API and keeps its API key behind a Cloudflare Worker.

Current free allowances are suitable for family play:

- SerpApi Free: 250 searches per month.
- Cloudflare Workers Free: up to 100,000 requests per day.
- The game makes one provider search per live round, not one per player.
- Repeated identical questions are cached for about 55 minutes.

### Create the provider account

1. Create a free account at [SerpApi](https://serpapi.com/).
2. Copy the private API key from the account dashboard.
3. Do not paste the key into GitHub, `src/config.js`, or any browser file.

### Deploy the free Worker

Use either Cloudflare's browser editor or Wrangler. The browser route is simplest:

1. Create a free [Cloudflare](https://dash.cloudflare.com/) account.
2. Open **Workers & Pages → Create → Worker**.
3. Name the Worker `googlefued-suggestions`.
4. Replace the sample code with `cloudflare-worker/worker.js`, then deploy.
5. Open the Worker's **Settings → Variables and Secrets**.
6. Add a secret named `SERPAPI_KEY` containing the SerpApi key.
7. Add a plain-text variable named `ALLOWED_ORIGIN` with this value:

   ```text
   https://seansommer.github.io
   ```

8. Redeploy the Worker if Cloudflare requests it.
9. Copy the Worker's `https://...workers.dev` URL.
10. In `src/config.js`, set `suggestionEndpoint` to that URL.

The Worker validates input, limits CORS to the GitHub Pages origin, keeps the key server-side, returns exactly seven results, and caches repeated prompts. The app automatically falls back to the built-in snapshot if the provider fails or runs out of free requests.

## 7. Create and publish the GitHub repository

The repository address will be:

```text
https://github.com/seansommer/googlefued
```

The published game address will be:

```text
https://seansommer.github.io/googlefued/
```

### GitHub website method

1. Sign in to GitHub as `seansommer`.
2. Choose **New repository**.
3. Set the repository name to `googlefued`.
4. Choose **Public**. GitHub Free Pages for this project requires a public repository.
5. Do not add a second README, license, or `.gitignore`; the project already includes them.
6. Upload every project file and folder, preserving the folder structure.
7. Commit the files to the `main` branch.
8. Open **Settings → Pages**.
9. Under **Build and deployment → Source**, choose **GitHub Actions**.
10. Open the repository's **Actions** tab. The included Pages workflow should run automatically.
11. When it finishes successfully, open `https://seansommer.github.io/googlefued/`.

Every future commit to `main` automatically republishes the site.

## 8. Launch checklist

- [ ] Create the master account and confirm Master Controls appear.
- [ ] Promote a separate test user to Host and confirm a Host Number appears.
- [ ] Test with at least one iPhone and one other phone/computer.
- [ ] Confirm a player cannot join after the host starts.
- [ ] Confirm answers remain hidden until everyone submits.
- [ ] Confirm the point order is 10, 7, 5, 4, 3, 2, 1.
- [ ] Test a score override and a host score edit.
- [ ] Confirm all players must enter the next round before the host can start it.
- [ ] Complete the final round and verify ties show co-champions.
- [ ] If live mode is enabled, disconnect or break the Worker URL temporarily and verify the built-in fallback still opens the round.
- [ ] On a phone, use **Add to Home Screen** and reopen the installed game.

## 9. Normal maintenance

- Update built-in answer snapshots in `src/data/question-bank.js` whenever you want fresh backup content.
- Increase the service-worker cache name in `service-worker.js` after changing cached files if a phone appears to retain an older version.
- Review Firebase Realtime Database usage occasionally. A family game should remain far below the Spark-plan limit.
- Review SerpApi usage if live rounds stop refreshing. The game remains playable in snapshot mode.
- Never commit API secrets. The only provider secret belongs in Cloudflare's secret manager.
