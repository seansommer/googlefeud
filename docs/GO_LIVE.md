# Live Autocomplete Activation

The website, accounts, rooms, scores, teams, and game history already use the live Firebase project. The remaining testing label refers only to the answer-board source. Until a Worker URL is configured, new rooms use the twelve saved setup boards.

## What is needed

1. A SerpApi account and private API key.
2. The deployed `googlefeud-suggestions` Cloudflare Worker.
3. The public Worker URL added to `src/config.js`.

The SerpApi key must never be placed in ChatGPT messages, GitHub, `src/config.js`, or any browser file. Enter it only in Cloudflare as an encrypted Worker secret.

## Finish the deployed Worker

The corrected Worker is already deployed at:

```text
https://googlefeud-suggestions.musicmansean87.workers.dev
```

1. In Cloudflare, open **Workers & Pages → googlefeud-suggestions**.
2. Open **Settings → Variables and Secrets**.
3. Add an encrypted secret named `SERPAPI_KEY`.
4. Confirm the plain-text `ALLOWED_ORIGIN` variable is `https://seansommer.github.io`.
5. Redeploy after saving the secret.
6. Open `https://googlefeud-suggestions.musicmansean87.workers.dev/health`.

A ready Worker returns:

```json
{"ok":true,"providerConfigured":true}
```

## Connect the game

Copy only the public Worker base URL. In `src/config.js`, replace the empty value:

```js
suggestionEndpoint: "https://googlefeud-suggestions.musicmansean87.workers.dev"
```

After that commit deploys, Create Game will show **Live answer boards** instead of **Saved-board testing mode**. Every live round selects a prompt from the 500-prompt pool and requests seven current suggestions immediately before the round opens. The Worker keeps only suggestions that begin with that exact prompt and removes duplicate completions. If a prompt cannot produce seven clean results, the game tries another unused prompt rather than showing a polluted board.

## Final two-device test

1. Create a one-round game and confirm Create Game says **Live answer boards**.
2. Join from another device.
3. Start the round and confirm Round Details identifies the source as **Live Google autocomplete via SerpApi** with a current fetch time.
4. Verify the same seven answers appear on both devices.
5. Confirm the SerpApi key is absent from the GitHub repository and browser developer tools.

The public Worker URL is safe to share. Once it exists, it can be committed to the game configuration without exposing the private provider key.
