import { APP_CONFIG, isLiveSuggestionsConfigured } from "../config.js";

function normalizeSuggestion(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSuggestionsForQuery(query, suggestions = [], limit = 7) {
  const normalizedQuery = normalizeSuggestion(query);
  const seen = new Set();
  return suggestions.reduce((accepted, item) => {
    if (accepted.length >= limit) return accepted;
    const value = typeof item === "string" ? item : item?.value;
    const normalizedValue = normalizeSuggestion(value);
    if (!normalizedValue.startsWith(`${normalizedQuery} `)) return accepted;
    const completion = normalizedValue.slice(normalizedQuery.length).trim();
    if (!completion || seen.has(completion)) return accepted;
    seen.add(completion);
    accepted.push(value.trim());
    return accepted;
  }, []);
}

export async function fetchLiveSuggestions(query) {
  if (!isLiveSuggestionsConfigured()) {
    throw new Error("A live suggestion provider has not been configured.");
  }

  const endpoint = new URL(APP_CONFIG.suggestionEndpoint);
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Suggestion provider returned ${response.status}.`);
  }

  const data = await response.json();
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  const cleaned = cleanSuggestionsForQuery(query, suggestions);

  if (cleaned.length < 7) {
    throw new Error("The provider returned fewer than seven usable suggestions.");
  }

  return {
    suggestions: cleaned,
    source: data.source || "Live autocomplete provider",
    fetchedAt: data.fetchedAt || Date.now()
  };
}
