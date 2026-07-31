// Sync feature flags and configuration constants
export const ENABLE_TOMBSTONE_AUTO_CLEANUP = true;
export const SYNC_DELETION_CHUNK_SIZE = 500; // number of rows processed per DB transaction
export const SYNC_RETRY_ATTEMPTS = 2; // total attempts (initial + retries)
export const SYNC_RETRY_BASE_MS = 2000; // base back‑off in ms, exponential (2s, 4s, 8s...)
// SYNC_FALLBACK_CACHE_PATH removed — path is now computed at runtime in sheets.ts
// using app.getPath('userData') so it is always in a stable, per-device location
// and never relative to the shell's working directory (which varies by launch context).
