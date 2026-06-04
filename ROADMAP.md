# SalesTrack Pro — Roadmap & Phase Plan

## Current Architecture (v1.2.x)

```
Electron Desktop App (Windows)
  ├── Frontend: React + Vite (renderer process)
  ├── Backend:  Electron main process (Node.js)
  ├── Database: sql.js SQLite — file: %APPDATA%\SalesTrack Pro\data\salestrack.db
  └── Sync:     Google Sheets API (push daily entries, pull roster)
```

---

## Current Multi-PC Status

| Feature | Status | Notes |
|---|---|---|
| Local data persistence | ✅ Working | Written to disk after every save |
| Manual CSV upload (entries) | ✅ Working | Upload XLSX from any PC |
| Manual CSV upload (targets) | ✅ Working | Same |
| Push to Google Sheets | ✅ Working | `Entries!A:G` tab receives unsynced entries |
| Pull roster from Sheets | ⚠️ Partial | Reads row count but does NOT import to local DB |
| Pull entries from Sheets | ❌ Not implemented | Admin PC can't auto-receive branch entries |
| Real-time multi-PC sync | ❌ Not implemented | Each PC = independent DB |

### Current Multi-PC Workflow (manual)
```
Branch PC 1 ──[upload CSV]──► local DB ──[Sync to Cloud]──► Google Sheets
Branch PC 2 ──[upload CSV]──► local DB ──[Sync to Cloud]──► Google Sheets
                                                                ▼
Admin PC ──────────────────────────────────────────── (view in Sheets only)
                                                      ❌ local DB still empty
```

### Fix Needed (before Phase A/B)
Implement `pullEntries` from Sheets — reads `Entries!A:G` tab, inserts rows into local DB.
This allows admin PC to aggregate all branch data after each branch syncs.

---

## Phase 0 — Fix Sync Pull (Pre-requisite)
**Goal:** Admin PC can pull all branch entries from Google Sheets into local DB.

| Task | Detail |
|---|---|
| Implement `pullEntries` from `Entries` sheet | Read rows, match by salesman_id, INSERT OR REPLACE into daily_entries |
| Fix `pullFromCloud` to actually import roster | Read `Roster` tab, sync salesman list across PCs |
| Ensure salesman IDs are consistent across PCs | Admin creates all salesmen → push roster → branches pull roster |
| Add "Pull from Cloud" button to TopBar or Settings | Trigger full sync (roster + entries) |

**Effort:** 3–5 days  
**Dependency:** All branches must use same Google Sheets + service account

---

## Phase A — LAN Read-Only Web (Tablet Access)
**Goal:** Manager on tablet views Dashboard / Reports / Analytics / Executive / Team Performance via browser on office Wi-Fi. No data entry.

### What changes
| Layer | Change |
|---|---|
| Add Express server | Starts alongside Electron app, port 3001 |
| Extract GET routes | `/api/dashboard`, `/api/reports`, `/api/analytics`, `/api/executive`, `/api/team` |
| API adapter in frontend | `apiClient.ts` — Electron mode uses `window.api`, web mode uses `fetch()` |
| Static web build | Vite builds a separate web bundle (no Daily Entry / Upload / Settings screens) |
| Auth | Same login, JWT token for web sessions |
| DB | Same `salestrack.db` file — Express reads same data as Electron |

### What does NOT change
- Desktop Electron app flow unchanged
- Data entry still on desktop only
- No cloud database needed

### Access
```
Manager tablet (same Wi-Fi) ──► http://192.168.x.x:3001 ──► Express on admin PC
```
Limitation: admin PC must be ON and on same Wi-Fi. App off = web off.

**Effort:** 2–3 weeks  
**Cost:** Free (same hardware)

---

## Phase B — Vercel Cloud (Anywhere Access)
**Goal:** Manager accesses dashboard from any network, any device.

### Architecture
```
Tablet (any network)
  └──► Vercel (React read-only frontend)
         └──► Vercel Functions or Render API
                └──► Neon PostgreSQL (cloud DB)
                       ▲
             Electron app (admin PC)
               └── pushes data on every save/sync
                   (alongside existing Sheets sync)
```

### What changes
| Layer | Change |
|---|---|
| Database | Add Neon PostgreSQL as secondary sync target (free tier, 0.5 GB) |
| Electron sync | On save/upload → also write to Neon (same data, different target) |
| API | Vercel serverless functions (GET endpoints only) |
| Auth | JWT, same user accounts stored in Neon |
| Frontend | Read-only React build deployed to Vercel |
| KPI engine | Port TypeScript formulas to run on Vercel function (same logic) |

### What does NOT change
- Desktop Electron app unchanged
- Data entry still on desktop only
- Local DB still exists and is primary

### Data flow
```
Admin PC enters/uploads data
  → local DB (primary, instant)
  → Google Sheets (existing sync)
  → Neon PostgreSQL (new sync target, on save)

Manager tablet opens Vercel URL
  → reads from Neon DB
  → data freshness = last sync time (not real-time live feed — acceptable)
```

**Effort:** Phase A (2–3 wk) + Phase B additions (2–3 wk) = ~5–6 weeks total  
**Cost:** Free (Vercel hobby + Neon free tier + Render free)

---

## Recommended Sequence

```
Now        Fix Sync Pull (Phase 0)     3–5 days   multi-PC aggregation works
Month 1    Phase A (LAN web)           2–3 weeks  tablet reads on office Wi-Fi
Month 2    Phase B (Vercel)            2–3 weeks  tablet reads anywhere
```

---

## File Locations (for testing)

| Item | Path |
|---|---|
| Local SQLite DB | `C:\Users\{user}\AppData\Roaming\SalesTrack Pro\data\salestrack.db` |
| Logs (Electron) | `C:\Users\{user}\AppData\Roaming\SalesTrack Pro\logs\` |
| Google Sheets data | `Entries!A:G` and `Roster!A:E` tabs in configured spreadsheet |
| Service account key | Path set in Settings → Google Sheets Sync |

---

## Sync Test Checklist (run before Phase A)

- [ ] PC-A: Load test data → verify `salestrack.db` file exists and has size > 0
- [ ] PC-A: Enter 1 daily entry manually → "Sync to Cloud" → confirm Sheets row appears
- [ ] PC-B: Pull roster from Sheets → confirm same salesman names + IDs appear
- [ ] PC-B: Upload a CSV with entries using PC-A's salesman IDs → confirm entries saved locally
- [ ] PC-A: "Pull from Cloud" → (currently broken — needs Phase 0 fix)
- [ ] Both PCs: Dashboard KPI numbers match for same branch + date range
