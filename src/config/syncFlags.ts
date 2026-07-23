// Sync feature flags and configuration constants
export const ENABLE_TOMBSTONE_AUTO_CLEANUP = true;
export const SYNC_DELETION_CHUNK_SIZE = 500; // number of rows processed per DB transaction
export const SYNC_RETRY_ATTEMPTS = 2; // total attempts (initial + retries)
export const SYNC_RETRY_BASE_MS = 2000; // base back‑off in ms, exponential (2s, 4s, 8s...)
export const SYNC_FALLBACK_CACHE_PATH = "./syncCache.json"; // written when sync fails after retries
