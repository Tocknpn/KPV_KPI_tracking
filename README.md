# SalesTrack Pro — Developer GuideBook

> **Who this is for:** The developer, tech lead, or person in charge who takes over this codebase.  
> Everything you need to understand how the app works, where to find things, and how to change them safely.

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [Quick Start](#2-quick-start)
3. [Tech Stack](#3-tech-stack)
4. [Architecture — Big Picture](#4-architecture--big-picture)
5. [Folder Structure](#5-folder-structure)
6. [Database — Schema & Migrations](#6-database--schema--migrations)
7. [IPC Communication — How Frontend Talks to Backend](#7-ipc-communication--how-frontend-talks-to-backend)
8. [Role-Based Access Control](#8-role-based-access-control)
9. [KPI Scoring Engine](#9-kpi-scoring-engine)
10. [Data Entry Flows](#10-data-entry-flows)
11. [Google Sheets Sync](#11-google-sheets-sync)
12. [Rep Code System](#12-rep-code-system)
13. [Screens — What Each Page Does](#13-screens--what-each-page-does)
14. [Frontend State Management](#14-frontend-state-management)
15. [Build & Deploy](#15-build--deploy)
16. [Default Credentials](#16-default-credentials)
17. [Security Notes](#17-security-notes)
18. [How to Add a New Feature](#18-how-to-add-a-new-feature)

---

## 1. What This App Does

SalesTrack Pro is a **Windows desktop app** for tracking daily gold/jewelry sales KPIs across 4 branches.

Each sales rep is scored on 3 metrics every day:
- **Jewelry** (weight in Baht) × 15 pts/Baht
- **Bar** (weight in Baht) × 7.5 pts/Baht
- **Quantity** (pieces sold) × tier multiplier (branch-specific)

KPI % = `Total Points ÷ Branch Point Target × 100`

Managers see live progress, estimated month-end projections, and can push data to Google Sheets for backup/reporting.

---

## 2. Quick Start

```bash
# Install dependencies
npm install

# Run in development (hot reload)
npm run dev

# Type-check without building
npm run typecheck

# Build distributable Windows exe
npm run dist:win
```

**Dev mode** opens DevTools automatically. The SQLite DB is stored in `%APPDATA%\salestrack-pro\data\salestrack.db`.

---

## 3. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Electron 31** | Cross-platform native Windows app |
| Build system | **electron-vite** | Vite-powered, fast rebuilds, ESM support |
| Frontend | **React 18** + **React Router 6** | UI + client-side routing |
| State management | **Zustand** | Lightweight, no boilerplate |
| Database | **sql.js (SQLite WASM)** | In-memory SQLite, persisted to `.db` file |
| Charts | **Recharts** | Bar, Line, Pie charts |
| Styles | **Tailwind CSS 3** | Utility-first, no CSS files needed |
| Google API | **googleapis** | Google Sheets push/pull |
| XLSX | **xlsx (SheetJS)** | Generate + parse Excel templates |
| Auth | **bcryptjs** | Password hashing |
| Email | **nodemailer** + **node-cron** | Scheduled reports |
| Types | **TypeScript 5** | Full type safety end-to-end |

---

## 4. Architecture — Big Picture

```
┌────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN PROCESS                     │
│                                                                │
│  electron/main.ts                                              │
│  ├── initDatabase()   <- loads sql.js WASM, creates tables     │
│  ├── register*Handlers()  <- registers all IPC channels        │
│  └── createWindow()   <- creates BrowserWindow                 │
│                                                                │
│  electron/db/                                                  │
│  ├── connection.ts    <- singleton DB, persist to disk         │
│  ├── schema.ts        <- table definitions + migrations v1-v9  │
│  ├── seed.ts          <- initial data + test data              │
│  └── query.ts         <- prepare() / transaction() helpers     │
│                                                                │
│  electron/ipc/        <- ONE FILE PER DOMAIN                   │
│  ├── auth.ts          <- login, sessions, user CRUD            │
│  ├── entries.ts       <- daily entries + supervisors CRUD      │
│  ├── targets.ts       <- monthly targets per salesman          │
│  ├── kpi.ts           <- KPI config, scoring engine            │
│  ├── reports.ts       <- dashboard, monthly, executive, team   │
│  ├── upload.ts        <- XLSX bulk import (daily/target/roster)│
│  ├── sheets.ts        <- Google Sheets sync push/pull          │
│  ├── email.ts         <- SMTP config + scheduled emails        │
│  └── admin.ts         <- seed test data, data stats            │
│                                                                │
├────── contextBridge (electron/preload.ts) ─────────────────────┤
│  Exposes typed window.api object — ONLY channel through        │
│  which renderer can talk to main. No direct Node access.       │
├────────────────────────────────────────────────────────────────┤
│                    RENDERER PROCESS (React)                    │
│                                                                │
│  src/main.tsx         <- React entry point                     │
│  src/App.tsx          <- Router + AuthGuard + route tree       │
│                                                                │
│  src/store/           <- Zustand global state                  │
│  ├── auth.store.ts    <- user session (token, role, branchId)  │
│  └── app.store.ts     <- UI state (branch filter, date range)  │
│                                                                │
│  src/screens/         <- one folder per page/route             │
│  src/components/      <- shared layout + UI components         │
│  src/utils/           <- csv.ts, xlsx.ts, dates.ts             │
│  src/types/index.ts   <- all TypeScript interfaces             │
└────────────────────────────────────────────────────────────────┘
```

### The IPC Communication Pattern

```
React Component
    |
    |  window.api.someMethod(token, ...args)
    v
preload.ts  (contextBridge — safe bridge)
    |
    |  ipcRenderer.invoke('channel:action', token, ...args)
    v
ipcMain.handle('channel:action', handler)
    |
    |  1. requireAuth(token) — validates session, returns user
    |  2. Business logic (SQL queries)
    |  3. Return result object
    v
React Component receives result
```

Every handler receives a `token` as first argument. The token is validated against the `sessions` table before any logic runs.

---

## 5. Folder Structure

```
KPV sale performance tracking/
│
├── electron/                   <- MAIN PROCESS (Node.js/Electron)
│   ├── main.ts                 <- App entry: init DB, register IPC, create window
│   ├── preload.ts              <- contextBridge: exposes window.api to renderer
│   ├── db/
│   │   ├── connection.ts       <- DB singleton, file persistence, WASM loading
│   │   ├── schema.ts           <- Table DDL + migration runner (v1-v9)
│   │   ├── seed.ts             <- seedDatabase() + seedTestData()
│   │   └── query.ts            <- prepare(db, sql) and transaction(db, fn) wrappers
│   └── ipc/
│       ├── auth.ts             <- auth:login/logout/getUsers/createUser/updateUser/deleteUser
│       ├── entries.ts          <- entry:getSalesmen/getEntries/save + supervisor:getAll/save
│       ├── targets.ts          <- target:getTargets/saveTargets
│       ├── kpi.ts              <- kpi:getMetrics/getConfigs/saveConfig + computeKpiScore()
│       ├── reports.ts          <- report:dashboard/monthly/executive/teamPerformance/repHistory/supHistory/repDailyEntries
│       ├── upload.ts           <- upload:daily/targets/roster/getLogs/getCoverage
│       ├── sheets.ts           <- sheets:syncToCloud/forceSyncAll/pullFromCloud/testConnection/browseFile
│       ├── roster.ts           <- roster:getAll/saveRep/deactivate/reactivate/getAvailableMonths
│       ├── commission.ts       <- commission:getConfigs/saveConfig/getReport
│       ├── email.ts            <- email:getConfig/saveConfig/sendTest + cron scheduler
│       └── admin.ts            <- admin:seedTestData/dataStats
│
├── src/                        <- RENDERER PROCESS (React)
│   ├── main.tsx                <- ReactDOM.createRoot entry
│   ├── App.tsx                 <- Router + role-based route guards
│   ├── global.d.ts             <- TypeScript: declare window.api type
│   ├── types/index.ts          <- ALL shared interfaces (AuthUser, Salesman, etc.)
│   ├── store/
│   │   ├── auth.store.ts       <- login state: token, user, role, branchId, supervisorId
│   │   └── app.store.ts        <- UI state: selected branch, date range
│   ├── utils/
│   │   ├── csv.ts              <- parse + validate XLSX rows (daily/target/roster)
│   │   ├── xlsx.ts             <- generate XLSX templates (daily/target/roster)
│   │   └── dates.ts            <- date helper functions
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx    <- outer wrapper: sidebar + topbar + main content
│   │   │   ├── Sidebar.tsx     <- nav links, role-filtered visibility
│   │   │   └── TopBar.tsx      <- branch selector, sync button, user info
│   │   └── ui/
│   │       ├── GlassCard.tsx   <- frosted card container
│   │       ├── KpiCard.tsx     <- stat card with title + value + trend
│   │       ├── ArcGauge.tsx    <- SVG arc gauge (KPI % display)
│   │       ├── RadialGauge.tsx <- radial variant gauge
│   │       ├── PeriodFilter.tsx <- month/date-range picker
│   │       └── StatusBadge.tsx <- colored status chip
│   └── screens/
│       ├── Login/              <- username/password form
│       ├── Dashboard/          <- MTD stats, KPI gauge, top performers
│       ├── DailyEntry/         <- manual entry table + XLSX upload + roster upload
│       ├── Reports/            <- monthly perf table per rep (4 tabs) + IndividualProfileModal (rep/sup drill-down)
│       ├── TeamPerformance/    <- supervisor KPI% + team assignment UI
│       ├── Analytics/          <- branch-level charts (pie, line, matrix)
│       ├── Executive/          <- company-wide KPI, branch comparison, sup chart
│       ├── KpiSettings/        <- admin: unified KPI config (Jewelry/Bar/Qty inline + month scope), branch targets, commission rates
│       ├── Settings/           <- Google Sheets config (incl. Force Full Sync), email config
│       ├── UploadHistory/      <- Upload History tab + Roster tab (admin: inline CRUD, month/sup/branch filters)
│       └── UserManagement/     <- admin: user CRUD
│
├── credentials/                <- GITIGNORED — never commit contents
│   └── *.json                  <- Google service account key (stays local)
│
├── package.json                <- version, scripts, dependencies
├── electron-builder.yml        <- Windows installer config
├── electron.vite.config.mjs    <- build paths for main/preload/renderer
├── tailwind.config.ts          <- Tailwind theme
├── tsconfig.json               <- root TS config (references node + web)
├── tsconfig.node.json          <- electron/ TypeScript config
└── tsconfig.web.json           <- src/ TypeScript config
```

---

## 6. Database — Schema & Migrations

### Storage Location

- **Dev:** `%APPDATA%\salestrack-pro\data\salestrack.db`
- **Prod:** same (Electron's `app.getPath('userData')`)
- **In-memory while running** — sql.js loads the file into RAM on startup and writes back to disk via `persistDb()` after every transaction.

### How Migrations Work

`electron/db/schema.ts` stores `SCHEMA_VERSION = 9`. On startup:

1. DB reads `app_settings.schema_version`
2. If row missing → fresh install → run all tables + seed
3. If version < current → run migration blocks in order
4. Each migration is idempotent (`IF NOT EXISTS`, `try/catch` for `ALTER TABLE`)

**Never change BASE_TABLES without adding a migration.** If you add a column, add it to BASE_TABLES for fresh installs AND write a `v10 migration` block for existing users.

### Table Reference

| Table | Purpose |
|-------|---------|
| `app_settings` | Key-value config store (schema_version, sheets_id, kpi settings, sup_kpi_pct) |
| `branches` | 4 branches: Morning Market, Vientiane Center, ITecc, VangThong |
| `users` | Login accounts — roles: admin/supervisor/branch_manager/executive |
| `sessions` | Auth tokens — 8-hour expiry, validated on every IPC call |
| `salesmen` | Sales reps — linked to branch + optional supervisor. Has `rep_code` (unique company ID) |
| `targets` | Monthly targets per salesman (jewelry/bar/qty) |
| `daily_entries` | One row per salesman per date. `synced=0` = not yet pushed to Sheets |
| `kpi_metrics` | 3 rows: Jewelry (id=1), Bar (id=2), Quantity (id=3). Stores `points_per_unit` |
| `kpi_metric_type_rates` | `(metric_id, staff_type)` → `points_per_unit` (B2C vs B2B split rates) |
| `kpi_tier_configs` | Config set per metric+branch combo (effective date range) |
| `kpi_tiers` | Rows under a config: threshold qty → multiplier |
| `branch_kpi_monthly_targets` | Override per branch per month (fallback: `branches.kpi_point_target`) |
| `staff_monthly_targets` | Per-rep point target per year_month (YYYYMM). Loaded from roster upload |
| `supervisors` | Team supervisor records (separate from user accounts) |
| `commission_configs` | LAK commission rates per `(staff_type, year_month)` — editable in KPI Settings |
| `sync_logs` | History of push/pull operations to Google Sheets |
| `upload_logs` | History of XLSX bulk imports |
| `email_config` | SMTP settings + schedule for automated reports |

### Key Relationships

```
branches (1) ──── (N) salesmen
branches (1) ──── (N) users
supervisors (1) ── (N) salesmen          <- salesmen.supervisor_id FK
supervisors (1) ── (0-1) users           <- users.supervisor_id links login to supervisor record
salesmen (1) ───── (N) daily_entries
salesmen (1) ───── (N) targets
kpi_tier_configs (1) ── (N) kpi_tiers
```

### Schema Version History

| Version | Change |
|---------|--------|
| v1 | Base tables (all core tables) |
| v2 | `upload_logs` table |
| v3 | `kpi_metrics.points_per_unit` column |
| v4 | `app_settings`: kpi_total_base, kpi_total_weight defaults |
| v5 | `branches.kpi_point_target` column |
| v6 | `branch_kpi_monthly_targets` table |
| v7 | `supervisors` table + `salesmen.supervisor_id` + `sup_kpi_pct` setting |
| v8 | `users.supervisor_id` — links login account to a supervisor record |
| v9 | `salesmen.rep_code` TEXT UNIQUE — company-issued rep ID for cross-machine sync |
| v10 | `staff_monthly_targets` + `commission_configs` + `kpi_metric_type_rates` tables; `salesmen.staff_type` column |

---

## 7. IPC Communication — How Frontend Talks to Backend

All calls go through `window.api.*` (defined in `electron/preload.ts`).

### Full Channel Reference

#### Auth (`electron/ipc/auth.ts`)

| `window.api` method | IPC channel | Who can call |
|---------------------|-------------|-------------|
| `login(user, pass)` | `auth:login` | anyone |
| `logout(token)` | `auth:logout` | any authenticated |
| `getUsers(token)` | `auth:getUsers` | admin only |
| `createUser(token, data)` | `auth:createUser` | admin only |
| `updateUser(token, id, data)` | `auth:updateUser` | admin only |
| `deleteUser(token, id)` | `auth:deleteUser` | admin only (soft-delete) |
| `getBranches(token)` | `auth:getBranches` | any authenticated |

#### Entries & Supervisors (`electron/ipc/entries.ts`)

| `window.api` method | IPC channel | Notes |
|---------------------|-------------|-------|
| `getSalesmen(token, branchId?)` | `entry:getSalesmen` | supervisor: own team only |
| `createSalesman(token, data)` | `entry:createSalesman` | any auth |
| `updateSalesman(token, id, data)` | `entry:updateSalesman` | any auth |
| `getEntries(token, branchId, date)` | `entry:getEntries` | supervisor: own team only |
| `getEntriesByMonth(token, branchId, y, m)` | `entry:getEntriesByMonth` | any auth |
| `saveEntry(token, entry)` | `entry:save` | any auth |
| `saveBatchEntries(token, entries[])` | `entry:saveBatch` | any auth |
| `getUnsyncedCount(token)` | `entry:getUnsyncedCount` | any auth |
| `getSupervisors(token, branchId?)` | `supervisor:getAll` | any auth |
| `saveSupervisor(token, data)` | `supervisor:save` | any auth |
| `deleteSupervisor(token, id)` | `supervisor:delete` | any auth |
| `assignSalesmen(token, supId, ids[])` | `supervisor:assignSalesmen` | any auth |
| `getSalesmenForBranch(token, branchId)` | `supervisor:getSalesmenForBranch` | any auth |

#### Targets (`electron/ipc/targets.ts`)

| `window.api` method | IPC channel |
|---------------------|-------------|
| `getTargets(token, branchId, y, m)` | `target:getTargets` |
| `saveTargets(token, targets[])` | `target:saveTargets` |

#### KPI Engine (`electron/ipc/kpi.ts`)

| `window.api` method | IPC channel | Notes |
|---------------------|-------------|-------|
| `getKpiMetrics(token)` | `kpi:getMetrics` | |
| `getKpiConfigs(token, branchId?)` | `kpi:getConfigs` | |
| `getKpiTiers(token, configId)` | `kpi:getTiers` | |
| `saveKpiConfig(token, config, tiers[])` | `kpi:saveConfig` | admin only |
| `deleteKpiConfig(token, configId)` | `kpi:deleteConfig` | admin only |
| `saveKpiMetricMultiplier(token, metricId, ppu)` | `kpi:saveMetricMultiplier` | admin only |
| `saveBranchKpiTarget(token, branchId, target)` | `kpi:saveBranchKpiTarget` | admin only |
| `getMonthlyBranchTargets(token, y, m)` | `kpi:getMonthlyBranchTargets` | |
| `saveMonthlyBranchTargets(token, y, m, targets[])` | `kpi:saveMonthlyBranchTargets` | admin only |
| `getKpiFormula(token)` | `kpi:getFormula` | |
| `saveKpiFormula(token, base, weight)` | `kpi:saveFormula` | admin only |
| `simulateKpiScore(token, metricId, branchId, actual, target)` | `kpi:simulate` | |
| `getSupKpiPct(token)` | `kpi:getSupKpiPct` | |
| `saveSupKpiPct(token, pct)` | `kpi:saveSupKpiPct` | admin only |

#### Reports (`electron/ipc/reports.ts`)

| `window.api` method | IPC channel |
|---------------------|-------------|
| `getDashboardStats(token, branchIds[], y, m, from, to)` | `report:dashboard` |
| `getMonthlyReport(token, branchIds[], y, m, from, to, supId?)` | `report:monthly` |
| `getExecutiveReport(token, y, m, from, to)` | `report:executive` |
| `getBranchAnalytics(token, y, m, from, to)` | `report:branchAnalytics` |
| `getTeamPerformance(token, branchIds[], y, m, from, to)` | `report:teamPerformance` |
| `getRepHistory(token, salesmanId, numMonths?)` | `report:repHistory` — 6-month trend + commission per month |
| `getRepDailyEntries(token, salesmanId, year, month)` | `report:repDailyEntries` — daily entries for drill-down chart |
| `getSupHistory(token, supId, numMonths?)` | `report:supHistory` — supervisor team 6-month trend |

#### Upload (`electron/ipc/upload.ts`)

| `window.api` method | IPC channel | Notes |
|---------------------|-------------|-------|
| `uploadDaily(token, rows[], meta)` | `upload:daily` | rows keyed by `repCode` |
| `uploadTargets(token, rows[], meta)` | `upload:targets` | rows keyed by `repCode` |
| `uploadRoster(token, rows[])` | `upload:roster` | admin only |
| `getUploadLogs(token, branchId?, type?, limit?)` | `upload:getLogs` | |
| `getUploadCoverage(token, y, m)` | `upload:getCoverage` | |
| `getSalesmenForTemplate(token, branchId)` | `upload:getSalesmenForTemplate` | |
| `getRosterTemplate(token)` | `upload:getRosterTemplate` | |

#### Google Sheets (`electron/ipc/sheets.ts`)

| `window.api` method | IPC channel |
|---------------------|-------------|
| `getSheetsConfig(token)` | `sheets:getConfig` |
| `saveSheetsConfig(token, config)` | `sheets:saveConfig` |
| `getSyncLogs(token)` | `sheets:getSyncLogs` |
| `syncToCloud(token)` | `sheets:syncToCloud` — pushes unsynced entries only |
| `forceSyncAll(token)` | `sheets:forceSyncAll` — resets all synced=0, clears Entries tab, re-pushes ALL entries + all 6 config tabs |
| `pullFromCloud(token)` | `sheets:pullFromCloud` |
| `testSheetsConnection(token)` | `sheets:testConnection` |
| `browseSheetsFile(token)` | `sheets:browseFile` — opens native file dialog |

#### Roster CRUD (`electron/ipc/roster.ts`)

| `window.api` method | IPC channel | Notes |
|---------------------|-------------|-------|
| `getRosterAll(token, yearMonth?)` | `roster:getAll` | admin only; yearMonth=YYYYMM filters staff_monthly_targets LEFT JOIN |
| `getRosterAvailableMonths(token)` | `roster:getAvailableMonths` | admin only |
| `saveRosterRep(token, data)` | `roster:saveRep` | admin only; upsert salesman + target |
| `deactivateRosterRep(token, id)` | `roster:deactivate` | admin only |
| `reactivateRosterRep(token, id)` | `roster:reactivate` | admin only |

#### Commission (`electron/ipc/commission.ts`)

| `window.api` method | IPC channel |
|---------------------|-------------|
| `getCommissionConfigs(token, yearMonth?)` | `commission:getConfigs` |
| `saveCommissionConfig(token, data)` | `commission:saveConfig` — also pushes CommissionConfig tab to Sheets |
| `getCommissionReport(token, branchIds[], y, m, from?, to?)` | `commission:getReport` |

#### Admin (`electron/ipc/admin.ts`)

| `window.api` method | IPC channel |
|---------------------|-------------|
| `seedTestData(token)` | `admin:seedTestData` — admin only |
| `getDataStats(token)` | `admin:dataStats` — admin only |

---

## 8. Role-Based Access Control

### The 4 Roles

| Role | What They See |
|------|--------------|
| `admin` | Everything — all branches, all menus, KPI settings, user management |
| `branch_manager` | Their assigned branch only — all reps + all supervisors under that branch |
| `supervisor` | Only their own team (linked via `users.supervisor_id` → `supervisors.id`) |
| `executive` | Read-only — all branches, analytics, executive view, no data entry |

### How Scoping Works in Backend

```
requireAuth(token) returns { id, role, branch_id, supervisor_id }

supervisor role:
  getSalesmen:     WHERE s.supervisor_id = user.supervisor_id
  getEntries:      WHERE s.supervisor_id = user.supervisor_id
  report:monthly:  effectiveBranchIds = [user.branch_id]
                   effectiveSupervisorId = user.supervisor_id

branch_manager role:
  report:monthly:  effectiveBranchIds = [user.branch_id]
  teamPerformance: auto-scoped to user.branch_id

executive / admin:
  no scoping — sees all branches
```

**The backend is the real security boundary.** Frontend role checks only hide UI elements — they do not protect data.

### Linking a Supervisor User to a Supervisor Record

A user with `role='supervisor'` has `users.supervisor_id` pointing to a `supervisors` record.  
This is set automatically during `seedTestData()`.  
For production: when creating a supervisor user account, set `supervisor_id` via admin user management or a SQL update.

---

## 9. KPI Scoring Engine

All scoring lives in `electron/ipc/kpi.ts` → `computeKpiScore(db, metricId, branchId, actual, target, date)`.

### Metric IDs (fixed)

| id | Name | Scoring Mode |
|----|------|-------------|
| 1 | Jewelry Weight | `actual_baht × points_per_unit` (default: × 15) |
| 2 | Bar Weight | `actual_baht × points_per_unit` (default: × 7.5) |
| 3 | Quantity | tier lookup → `actual_qty × tier_multiplier` |

### Scoring Logic

```typescript
// Jewelry / Bar — direct multiplier (points_per_unit > 0)
score = actual * metric.points_per_unit

// Quantity — find the active tier config for (branch, date)
// branch-specific config wins over global (branch_id NULL)
// tiers stored DESC by threshold — find first tier where actual >= threshold
score = actual_qty * matching_tier.score
```

### Branch KPI % Calculation

```
Total KPI Points = jewelry_score + bar_score + qty_score

Branch Point Target priority:
  1. branch_kpi_monthly_targets (year, month override)
  2. branches.kpi_point_target  (permanent default)

KPI % = (Total KPI Points / Branch Point Target) * 100
```

### Supervisor KPI

```
team_total_score = sum of all reps' KPI points
sup_score        = team_total_score * (sup_kpi_pct / 100)    <- default 30%, configurable
sup_kpi_pct_ach  = (sup_score / branch_target) * 100
```

`sup_kpi_pct` is in `app_settings` and editable by admin in KPI Settings.

### Est. Month End

```
eomKpiPct = (current_kpi_pct / day_of_month) * days_in_month
```

Used in Reports table, Executive view, and Branch KPI Achievement panel.

---

## 10. Data Entry Flows

### Manual Entry

```
User edits table cell
  -> window.api.saveEntry(token, { salesmanId, branchId, date, ... })
  -> IPC: entry:save
  -> DELETE existing + INSERT new row in daily_entries
  -> persistDb() writes to disk
```

### XLSX Daily Upload

```
User drops Excel file on upload panel
  -> src/utils/xlsx.ts: parse workbook -> raw rows
  -> src/utils/csv.ts: validateDailyRows() -> DailyRowRaw[]
  -> window.api.uploadDaily(token, rows, meta)
  -> IPC: upload:daily
  -> For each row: SELECT salesman WHERE rep_code = ?
     found:    DELETE existing + INSERT daily_entry
     not found: add to skipped[] list
  -> upload_logs record created (success + skipped count)
  -> Return { success, count, skipped }
```

### Roster Upload (Admin Monthly)

```
Admin uploads roster XLSX (done once per month for new staff cycle)
  -> validateRosterRows() -> RosterRow[]
  -> window.api.uploadRoster(token, rows)
  -> IPC: upload:roster
  -> For each row:
       resolve branch by branch_code
       resolve supervisor_id by name + branch
       UPDATE salesmen ... WHERE rep_code = ?   (if exists -> update)
       INSERT INTO salesmen ...                  (if new -> create)
  -> Return { created, updated, skipped }
```

### Target Upload

```
Same flow as Daily Upload but IPC: upload:targets
  -> For each row: resolve rep_code -> DELETE + INSERT into targets
```

---

## 11. Google Sheets Sync

### Setup Requirements

1. Create Google Cloud project → enable Sheets API
2. Create Service Account → download JSON key file
3. Share the target Google Spreadsheet with the service account email (Editor role)
4. In app Settings: enter Spreadsheet ID + full path to JSON key file
5. Click "Test Connection" to verify before syncing

### Push to Cloud (`sheets:syncToCloud`)

```
1. Check Entries!A1 — if no header: create "Entries" tab + write headers
2. SELECT daily_entries WHERE synced = 0
3. Append rows to Entries!A:G
4. UPDATE daily_entries SET synced = 1
5. INSERT sync_logs row
```

**Sheet columns (Entries tab):**  
`Date | Branch | Rep Code | Salesman Name | Jewelry (Baht) | Bar (Baht) | Qty`

### Pull from Cloud (`sheets:pullFromCloud`)

```
1. GET Entries!A:G
2. Skip header row (detected by A1 not matching YYYY-MM-DD)
3. For each row: resolve rep_code -> salesman
4. DELETE + INSERT daily_entry (synced = 1)
```

### CRITICAL Security Rule

**The service account JSON file must NEVER be committed to git.**  
`credentials/` is already in `.gitignore`. Never remove that entry.  
Each machine keeps its own copy of the key locally.

---

## 12. Rep Code System

### Why Rep Codes?

Each salesman has a unique company-issued code (e.g., `MM-A-001`). This solves the multi-PC sync problem:  
- Multiple branch computers use the same Google Sheet
- Auto-increment integer IDs would collide across machines
- Rep codes are stable and machine-independent

### Where Rep Codes Are Used

| Location | Usage |
|----------|-------|
| `salesmen.rep_code` | Stored in DB with unique index |
| `upload:daily` | Maps uploaded row to salesman record |
| `upload:targets` | Maps target row to salesman record |
| `upload:roster` | Upsert key — update if exists, insert if new |
| `sheets:syncToCloud` | Written to "Rep Code" column in Google Sheet |
| `sheets:pullFromCloud` | Matches sheet rows to local salesmen |
| XLSX templates | Pre-filled in download template |

### Test Data Format

`{BRANCH_CODE}-{TIER_LETTER}-{INDEX}` — e.g., `MM-A-001`  
Production codes come from the company's HR/payroll system — any unique string works.

---

## 13. Screens — What Each Page Does

| Route | Screen | Allowed Roles | Purpose |
|-------|--------|--------------|---------|
| `/login` | Login | all | Username + password form |
| `/dashboard` | Dashboard | all | MTD KPI gauge, top performers, quick stats |
| `/daily-entry` | DailyEntry | all | Manual entry + XLSX upload + roster upload (admin) |
| `/reports` | Reports | all | Monthly performance table per rep, branch/supervisor filters; 4 tabs: Performance / Customer Type / Supervisor / Commission; click rep/sup row → individual profile modal with trend chart + history table |
| `/team-performance` | TeamPerformance | admin, branch_manager, executive | Supervisor KPI%, team assignment UI |
| `/analytics` | Analytics | admin, branch_manager, executive | Branch charts: pie, line, comparison matrix |
| `/executive` | Executive | admin, executive | Company-wide KPI, branch comparison, supervisor chart |
| `/kpi-settings` | KpiSettings | admin only | Unified KPI config per month (Jewelry/Bar/Qty cards), tier tables, branch targets, score simulator |
| `/upload-history` | UploadHistory | all (Roster tab: admin only) | Upload History tab + Roster tab (admin: view/edit all reps with month/branch/supervisor filters) |
| `/settings` | Settings | admin, supervisor, branch_manager | Google Sheets config (Force Full Sync), email config, test data loader |
| `/users` | UserManagement | admin only | User CRUD |

### Filter Visibility by Role

| Role | Branch Filter | Supervisor Filter |
|------|-------------|-----------------|
| admin | multi-select all branches | all supervisors |
| executive | multi-select all branches | all supervisors |
| branch_manager | locked to own branch | supervisors in own branch |
| supervisor | locked to own branch | hidden (already scoped) |

---

## 14. Frontend State Management

### `auth.store.ts` (Zustand, persisted to localStorage)

```typescript
{
  token: string | null
  user: AuthUser | null   // { id, username, fullName, role, branchId, supervisorId }
  isAuthenticated: boolean
  login(token, user) / logout()
}
```

### `app.store.ts` (Zustand, persisted to localStorage)

```typescript
{
  selectedBranchIds: number[]   // active branch filter ([] = all)
  dateFrom: string              // YYYY-MM-DD
  dateTo: string                // YYYY-MM-DD
  selectedYear: number
  selectedMonth: number
  setSelectedBranchIds(ids) / setDateRange(from, to) / ...
}
```

Both stores persist filter selections across page refreshes via Zustand persist middleware.

---

## 15. Build & Deploy

### Development

```bash
npm run dev          # hot reload, opens DevTools automatically
npm run typecheck    # tsc --noEmit (no output = clean)
```

### Production Build

```bash
npm run dist:win     # build + package as Windows installer
```

Output: `dist/SalesTrack Pro Setup x.y.z.exe`

Uses NSIS installer (configured in `electron-builder.yml`).

### WASM Dependency

sql.js requires a `sql-wasm.wasm` file. `electron-builder.yml` has `extraResources` to copy it into the packaged app. If missing, app crashes on startup with a WASM loading error.

### Version Bumping Rule

Always bump `version` in `package.json` on every change and include the version in the commit message.  
Semver: `patch` (bug fix), `minor` (new feature), `major` (breaking change).

---

## 16. Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin1234` | Admin — full access |
| `ceo` | `ceo1234` | Executive — read-only |
| `sup_mm` | `sup1234` | Supervisor — Morning Market (Alpha team) |
| `sup_vc` | `sup1234` | Supervisor — Vientiane Center (Alpha team) |
| `sup_it` | `sup1234` | Supervisor — ITecc (Alpha team) |
| `sup_vt` | `sup1234` | Supervisor — VangThong (Alpha team) |
| `bm_mm` | `bm1234` | Branch Manager — Morning Market |
| `bm_vc` | `bm1234` | Branch Manager — Vientiane Center |
| `bm_it` | `bm1234` | Branch Manager — ITecc |
| `bm_vt` | `bm1234` | Branch Manager — VangThong |

**Change all passwords on first production deployment** via User Management (admin login required).

---

## 17. Security Notes

### What's Secured

- Every IPC handler calls `requireAuth(token)` — no unauthenticated backend access possible
- Passwords stored as bcrypt hash (cost=10) — never plaintext in DB
- `contextBridge` + `nodeIntegration: false` — renderer cannot access Node.js directly
- Role checks on sensitive handlers: admin-only use `requireAdmin(token)`
- Parameterized SQL everywhere via `prepare(db, sql).run(params)` — no SQL injection

### What to Be Careful About

**1. Service account JSON must never be in git.**  
`credentials/` is gitignored. If accidentally committed:  
a) Revoke the key in Google Cloud Console immediately  
b) Generate a new key  
c) Rewrite git history (BFG Repo Cleaner or `git filter-branch`)

**2. Session tokens expire after 8 hours.** Expired tokens return `null` from `validateToken()`. Users see "Unauthorized" and are redirected to login.

**3. No remote network exposure.** All IPC is in-process inside Electron. The only external network calls are to Google Sheets API (when syncing).

---

## 18. How to Add a New Feature

### Add a New IPC Handler

1. Open the relevant file in `electron/ipc/` (or create a new one and add it to `electron/main.ts`)
2. Inside the `register*Handlers(ipcMain)` function, add:
   ```typescript
   ipcMain.handle('domain:action', async (_e, token: string, ...args) => {
     requireAuth(token)  // or requireAdmin(token)
     // your logic here
     return result
   })
   ```
3. Expose it in `electron/preload.ts` inside `contextBridge.exposeInMainWorld`:
   ```typescript
   yourNewMethod: (token: string, ...args) =>
     ipcRenderer.invoke('domain:action', token, ...args),
   ```
4. Add TypeScript signature to `src/global.d.ts`
5. Call `window.api.yourNewMethod(token, ...)` from React

### Add a New Screen

1. Create `src/screens/YourScreen/index.tsx`
2. Add route in `src/App.tsx`
3. Add nav link in `src/components/layout/Sidebar.tsx` with role filter
4. Add new types to `src/types/index.ts`

### Add a Database Column

1. Add to `BASE_TABLES` in `electron/db/schema.ts` (for fresh installs)
2. Add a migration block:
   ```typescript
   if (currentVersion < 10) {
     try {
       db.run(`ALTER TABLE some_table ADD COLUMN new_col TEXT`)
     } catch { /* already exists on some DBs */ }
     db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '10')`).run()
   }
   ```
3. Bump `SCHEMA_VERSION = 10` at the top of the file
4. Update the TypeScript interface in `src/types/index.ts`

### Change KPI Scoring Rules

- **Jewelry/Bar multiplier:** Use KPI Settings UI — no code change needed
- **Qty tier thresholds:** Use KPI Settings UI per branch — no code change needed
- **Add a 4th KPI metric:** Insert row into `kpi_metrics`, set `points_per_unit` or add tier config, update `computeKpiScore()` in `kpi.ts`, update the `report:monthly` SQL to aggregate the new column

---

*SalesTrack Pro — KPV Gold & Jewelry Sales Performance System*  
*GuideBook last updated: 2026-06-09 · Schema v10 · App v1.3.7*
