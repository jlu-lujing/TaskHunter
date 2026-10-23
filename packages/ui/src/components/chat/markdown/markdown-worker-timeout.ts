/**
 * Safety-net budget for a single Shiki worker tokenize request.
 * Healthy files finish well under this; catastrophic Oniguruma backtracking
 * must not run unbounded (taskhunter/taskhunter#2587).
 */
export const HIGHLIGHT_REQUEST_TIMEOUT_MS = 5_000;
