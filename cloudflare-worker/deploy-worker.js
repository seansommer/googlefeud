// Paste this complete file into the existing Cloudflare Worker editor.
// Conservative duplicate detection: preserve provider order and distinct meanings.
export function normalizeSuggestion(value = "") {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function completionKey(value = "") {
  return normalizeSuggestion(value).split(" ").map((word) => {
    if (word.length > 4 && /ies$/.test(word)) return word.slice(0, -3) + "y";
    if (word.length > 4 && /(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && /s$/.test(word) && !/(ss|us|is|news|series|species)$/.test(word)) return word.slice(0, -1);
    return word;
  }).join(" ");
}

export function cleanSuggestionsForQuery(query, items = [], limit = 7) {
  const prefix = normalizeSuggestion(query);
  if (!prefix) return [];
  const seen = new Set();
  const accepted = [];
  for (const item of items) {
    const value = typeof item === "string" ? item : item?.value;
    if (typeof value !== "string") continue;
    const normalized = normalizeSuggestion(value);
    if (!normalized.startsWith(prefix + " ")) continue;
    const key = completionKey(normalized.slice(prefix.length).trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    accepted.push(value.trim().replace(/\s+/g, " "));
    if (accepted.length >= limit) break;
  }
  return accepted;
}

const filterPromptSuggestions = cleanSuggestionsForQuery;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(origin) {
  return {
    ...JSON_HEADERS,
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function response(payload, status, origin) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(origin) });
}


export default {
  async fetch(request, env) {
    const incomingOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const responseOrigin = allowedOrigin === "*" ? "*" : allowedOrigin;

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(responseOrigin) });
      if (request.method !== "GET") return response({ error: "Method not allowed" }, 405, responseOrigin);
      if (allowedOrigin !== "*" && incomingOrigin && incomingOrigin !== allowedOrigin) {
        return response({ error: "Origin not allowed" }, 403, responseOrigin);
      }

      const url = new URL(request.url);
      if (url.pathname.endsWith("/health")) {
        return response({ ok: true, providerConfigured: Boolean(env.SERPAPI_KEY) }, env.SERPAPI_KEY ? 200 : 503, responseOrigin);
      }
      if (!env.SERPAPI_KEY) return response({ error: "Suggestion provider is not configured" }, 503, responseOrigin);

      const query = (url.searchParams.get("q") || "").trim();
      if (!query || query.length > 100) return response({ error: "Query must contain 1–100 characters" }, 400, responseOrigin);

      const providerUrl = new URL("https://serpapi.com/search.json");
      providerUrl.searchParams.set("engine", "google_autocomplete");
      providerUrl.searchParams.set("q", query);
      providerUrl.searchParams.set("gl", "us");
      providerUrl.searchParams.set("hl", "en");
      providerUrl.searchParams.set("no_cache", "true");
      providerUrl.searchParams.set("api_key", env.SERPAPI_KEY);

      const provider = await fetch(providerUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6500) });
      if (!provider.ok) {
        console.error(JSON.stringify({ message: "suggestion provider error", status: provider.status }));
        return response({ error: "Suggestion provider request failed" }, 502, responseOrigin);
      }

      const data = await provider.json();
      const suggestions = filterPromptSuggestions(
        query,
        Array.isArray(data.suggestions) ? data.suggestions : [],
        20
      );
      if (suggestions.length < 7) return response({ error: "Provider returned fewer than seven suggestions" }, 502, responseOrigin);

      return new Response(JSON.stringify({ suggestions, source: "Live Google autocomplete via SerpApi", fetchedAt: Date.now() }), {
        headers: { ...corsHeaders(responseOrigin), "cache-control": "no-store" }
      });
    } catch (error) {
      console.error(JSON.stringify({
        message: "unhandled worker error",
        error: error instanceof Error ? error.message : String(error),
        path: new URL(request.url).pathname
      }));
      return response({ error: "Suggestion service is temporarily unavailable" }, 500, responseOrigin);
    }
  }
};
