# Password-Free Update Instructions

This update removes passwords for players, hosts, and the master.

## What changes

- Regular players enter an email and nickname and continue immediately.
- If no matching profile exists, the app automatically opens Create Player with both fields already filled in.
- Nickname matching ignores capitalization, spaces, accents, and punctuation.
- Email matching ignores capitalization and surrounding spaces but retains punctuation.
- Players can change their nickname from the account menu.
- Hosts use the same email-and-nickname entry. Email addresses are never displayed after login.

This is a trust-based family profile, not verified identity. Anyone who knows the email and matching nickname can act as that profile.

## Update the GitHub files

1. Extract the password-free update ZIP.
2. In the `googlefeud` repository, choose **Add file → Upload files**.
3. Drag in the contents of the extracted update folder while preserving its `src` and `docs` folders.
4. Confirm that GitHub lists the existing files as changed or replaced, then commit directly to `main`.
5. Do not replace `src/config.js`; the update ZIP intentionally excludes it so your Firebase values remain untouched.
6. Wait for the GitHub Pages action to finish successfully.

## Change Firebase Authentication

1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Anonymous**.
3. Under **Settings → User actions**, confirm that creating new user accounts is enabled.
4. Leave **Google** and **Email/Password** disabled.
5. Confirm `seansommer.github.io` is an authorized domain if Firebase shows an Authorized domains list.

## Publish the new database rules

1. Open **Firebase Console → Realtime Database → Rules**.
2. Replace everything in the editor with `firebase-database.rules.json` from this update.
3. Choose **Publish**.

These rules keep full email profiles out of public game data and allow the master to promote trusted profiles to host.

## Establish the master account

1. Create the Sean and general Host profiles once through **Host Login**.
2. In **Firebase → Realtime Database → Data → users**, find them by their private email fields.
3. Assign Sean `role: master` and `hostNumber: H-00001`.
4. Assign Host `role: host` and `hostNumber: H-00002`.
5. Sign both profiles out and back in.

## Existing test accounts

Old email/password test accounts do not automatically become password-free profiles. If the project contains only disposable test data, delete those test Authentication users and their old `users` records before testing the new flow. If real game history already exists, preserve it and perform a deliberate migration instead.

## Quick test

1. Enter a new email and nickname as a player.
2. Confirm that Create Player opens automatically with the same values.
3. Create the player, sign out, and enter the same values again.
4. Change the nickname from **Menu**, sign out, and confirm the new nickname works while the old one no longer matches.
5. Sign in with Sean's email and nickname and confirm that Master Controls appear.
