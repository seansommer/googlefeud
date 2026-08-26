import { APP_CONFIG, isLiveSuggestionsConfigured } from "../config.js";

export async function fetchLiveSuggestions(query) {
  if (!isLiveSuggestionsConfigured()) {
    throw new Error("A live suggestion provider has not been configured.");
  }

  const endpoint = new URL(APP_CONFIG.suggestionEndpoint);
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Suggestion provider returned ${response.status}.`);
  }

  const data = await response.json();
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  const cleaned = suggestions
    .map((item) => (typeof item === "string" ? item : item?.value))
    .filter(Boolean)
    .slice(0, 7);

  if (cleaned.length < 7) {
    throw new Error("The provider returned fewer than seven usable suggestions.");
  }

  return {
    suggestions: cleaned,
    source: data.source || "Live autocomplete provider",
    fetchedAt: data.fetchedAt || Date.now()
  };
}
