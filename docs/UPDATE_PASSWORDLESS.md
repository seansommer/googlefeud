# Password-Free Update Instructions

This update removes player passwords while keeping host and master controls protected.

## What changes

- Regular players enter an email and nickname and continue immediately.
- If no matching profile exists, the app automatically opens Create Player with both fields already filled in.
- Nickname matching ignores capitalization, spaces, accents, and punctuation.
- Email matching ignores capitalization and surrounding spaces but retains punctuation.
- Players can change their nickname from the account menu.
- Hosts and the master use Continue with Google. Instant player profiles cannot be promoted to host.

This is a trust-based family profile, not verified identity. Anyone who knows the email and matching nickname can act as that player, but cannot gain host or master controls.

## Update the GitHub files

1. Extract the password-free update ZIP.
2. In the `googlefued` repository, choose **Add file → Upload files**.
3. Drag in the contents of the extracted update folder while preserving its `src` and `docs` folders.
4. Confirm that GitHub lists the existing files as changed or replaced, then commit directly to `main`.
5. Do not replace `src/config.js`; the update ZIP intentionally excludes it so your Firebase values remain untouched.
6. Wait for the GitHub Pages action to finish successfully.

## Change Firebase Authentication

1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Anonymous**.
3. Enable **Google**, select your project support email, and save.
4. Disable **Email/Password** after confirming that no existing real users still need it.
5. In Authentication settings, confirm `seansommer.github.io` is an authorized domain.

## Publish the new database rules

1. Open **Firebase Console → Realtime Database → Rules**.
2. Replace everything in the editor with `firebase-database.rules.json` from this update.
3. Choose **Publish**.

These rules keep full email profiles private to their owner and the master. They also require Google authentication before an account can become a host.

## Establish the master account

1. On the game website, choose **Host Login → Continue with Google**.
2. In **Firebase Console → Authentication → Users**, copy that Google account's UID.
3. In **Realtime Database → Data**, set `admins/YOUR_UID` to the Boolean value `true`.
4. Under `users/YOUR_UID`, change `role` to `master` and set `hostNumber` to `H-00001`.
5. Sign out of the game and use Continue with Google again.

## Existing test accounts

Old email/password test accounts do not automatically become password-free profiles. If the project contains only disposable test data, delete those test Authentication users and their old `users` records before testing the new flow. If real game history already exists, preserve it and perform a deliberate migration instead.

## Quick test

1. Enter a new email and nickname as a player.
2. Confirm that Create Player opens automatically with the same values.
3. Create the player, sign out, and enter the same values again.
4. Change the nickname from **Menu**, sign out, and confirm the new nickname works while the old one no longer matches.
5. Sign in with Google as the master and confirm that Master Controls appear.
