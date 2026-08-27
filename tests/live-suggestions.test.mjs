import test from "node:test";
import assert from "node:assert/strict";

import { filterPromptSuggestions } from "../cloudflare-worker/worker.js";
import { cleanSuggestionsForQuery } from "../src/services/live-suggestions.js";

const query = "things you should never post on";
const providerResults = [
  { value: "10 things you should never post on social media" },
  { value: "things you should never post on social media" },
  { value: "Things you should never post on   social media" },
  { value: "3 things you should never post on facebook" },
  { value: "things you should never post on facebook" },
  { value: "things you should never post on a public profile" }
];

test("Worker keeps only exact prompt completions and removes duplicates", () => {
  assert.deepEqual(filterPromptSuggestions(query, providerResults), [
    "things you should never post on social media",
    "things you should never post on facebook",
    "things you should never post on a public profile"
  ]);
});

test("browser client applies the same prompt-completion guard", () => {
  assert.deepEqual(cleanSuggestionsForQuery(query, providerResults), [
    "things you should never post on social media",
    "things you should never post on facebook",
    "things you should never post on a public profile"
  ]);
});

