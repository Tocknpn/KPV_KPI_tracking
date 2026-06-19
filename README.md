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
7. [IPC Communication — Full Channel Reference](#7-ipc-communication--full-channel-reference)
8. [Role-Based Access Control](#8-role-based-access-control)
9. [KPI Scoring Engine](#9-kpi-scoring-engine)
10. [Roster — How It Actually Works](#10-roster--how-it-actually-works)
11. [Sales Upload — Approval Workflow](#11-sales-upload--approval-workflow)
12. [Google Sheets Sync](#12-google-sheets-sync)
13. [Screens — What Each Page Does](#13-screens--what-each-page-does)
14. [Frontend State Management](#14-frontend-state-management)
15. [Build & Deploy](#15-build--deploy)
16. [Default Credentials](#16-default-credentials)
17. [Security Notes](#17-security-notes)
18. [Known Gaps / Technical Debt](#18-known-gaps--technical-debt)
19. [How to Add a New Feature](#19-how-to-add-a-new-feature)

---

## 1. What This App Does

SalesTrack Pro is a **Windows desktop app** (Electron) for tracking daily gold/jewelry sales KPIs across 4 branches (Morning Market, Vientiane Center, ITecc, VangThong), plus roster management, commission calculation, and an approval-gated sales data correction workflow.

Each sales rep is scored on 3 metrics every day:
- **Jewelry** (weight in Baht) × rate (branch/staff-type/month-specific, default 15 pts/Baht for B2C)
- **Bar** (weight in Baht) × rate (default 7.5 pts/Baht for B2C)
- **Quantity** (pieces sold) × tier multiplier (branch-specific, qty-threshold tiers)

`KPI % = Total Points ÷ Branch Point Target × 100`

8 user roles see different slices of this data (see [§8](#8-role-based-access-control)). Sales data upload is approval-gated (see [§11](#11-sales-upload--approval-workflow)) since it directly drives KPI and commission payouts. Everything can sync to Google Sheets for backup/cross-device access.

---

## 2. Quick Start

```bash
npm install
npm run dev          # hot reload (renderer only — main/preload need a full restart)
npm run typecheck     # see the warning in §18 before trusting this
npm run dist:win      # build Windows installer
```

**Dev mode** opens DevTools automatically. SQLite DB lives at `%APPDATA%\salestrack-pro\data\salestrack.db`.

**Electron main-process code (electron/*.ts) does NOT hot-reload** — after editing `main.ts`, `preload.ts`, or anything under `electron/`, kill the dev process and run `npm run dev` again. Only renderer (`src/`) hot-reloads.

---

## 3. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Electron 31** | Cross-platform native Windows app |
| Build system | **electron-vite** | Vite-powered, fast rebuilds, ESM support |
| Frontend | **React 18** + **React Router 6** | UI + client-side routing |
| State management | **Zustand** | Lightweight, no boilerplate, persisted to localStorage |
| Database | **sql.js (SQLite WASM)** | In-memory SQLite, persisted to a `.db` file on every write |
| Charts | **Recharts** | Bar, Line, Area, Pie charts |
| Styles | **Tailwind CSS 3** | Utility-first, no CSS files needed |
| Google API | **googleapis** | Google Sheets push/pull |
| XLSX | **xlsx (SheetJS)** | Generate + parse Excel templates |
| Auth | **bcryptjs** | Password hashing (plus a plaintext column — see [§17](#17-security-notes)) |
| Email | **nodemailer** + **node-cron** | Scheduled KPI report emails |
| Types | **TypeScript 5** | Project-referenced (`tsconfig.node.json` / `tsconfig.web.json`) |

---

## 4. Architecture — Big Picture

```
┌────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN PROCESS                     │
│                                                                │
│  electron/main.ts                                              │
│  ├── initDatabase()        <- loads sql.js WASM, runs migrations│
│  ├── registerAllHandlers() <- wires every IPC channel           │
│  └── createWindow()        <- creates BrowserWindow             │
│                                                                │
│  electron/db/                                                  │
│  ├── connection.ts    <- DB singleton, file persistence (WASM) │
│  ├── schema.ts        <- table DDL + migration runner (v1-v20) │
│  ├── seed.ts           <- seedDatabase() (fresh install) +      │
│  │                        seedTestData() (108-rep mock dataset) │
│  ├── history.ts        <- roster_monthly read/write helpers     │
│  └── query.ts          <- prepare()/transaction() wrappers      │
│                                                                │
│  electron/ipc/        <- ONE FILE PER DOMAIN (see §7)          │
│                                                                │
├────── contextBridge (electron/preload.ts) ─────────────────────┤
│  Exposes typed window.api object — ONLY channel through        │
│  which renderer can talk to main. No direct Node access.       │
├────────────────────────────────────────────────────────────────┤
│                    RENDERER PROCESS (React)                    │
│                                                                │
│  src/main.tsx, src/App.tsx <- entry + route tree                │
│  src/store/            <- Zustand global state                 │
│  src/screens/          <- one folder per page/route             │
│  src/components/       <- shared layout + UI components         │
│  src/utils/             <- csv.ts, xlsx.ts, dates.ts             │
│  src/types/index.ts     <- roles, menu keys, shared interfaces  │
│  src/global.d.ts        <- window.api TS surface (PARTIAL — §18)│
└────────────────────────────────────────────────────────────────┘
```

### The IPC Communication Pattern

```
React Component
    |  window.api.someMethod(token, ...args)
    v
preload.ts  (contextBridge — safe bridge)
    |  ipcRenderer.invoke('channel:action', token, ...args)
    v
ipcMain.handle('channel:action', handler)
    |  1. requireAuth(token) / requireAdmin(token) — validates session
    |  2. Business logic (parameterized SQL)
    |  3. Return result object
    v
React Component receives result
```

Every handler receives `token` first. `requireAuth` validates it against the `sessions` table (8-hour expiry) and returns `{ id, role, username, branch_id, supervisor_id }`. **The backend is the real security boundary** — frontend role checks only hide UI, they don't protect data. Every report/entry handler independently re-derives the caller's allowed `branch_id`/`supervisor_id` server-side rather than trusting client-passed filters.

---

## 5. Folder Structure

```
KPV sale performance tracking/
│
├── electron/                   <- MAIN PROCESS (Node.js/Electron)
│   ├── main.ts                 <- entry: init DB (45s timeout + error screen), register IPC, create window
│   ├── preload.ts               <- contextBridge: exposes window.api to renderer
│   ├── db/
│   │   ├── connection.ts        <- DB singleton, file persistence, WASM loading
│   │   ├── schema.ts            <- table DDL + migration runner (SCHEMA_VERSION = 20)
│   │   ├── seed.ts              <- seedDatabase() + seedTestData()
│   │   ├── history.ts           <- roster_monthly resolve/materialize/snapshot helpers
│   │   └── query.ts             <- prepare(db, sql) and transaction(db, fn) wrappers
│   └── ipc/
│       ├── auth.ts              <- login/logout/sessions/users/permissions/audit log + ROLE_DEFAULTS
│       ├── entries.ts           <- legacy salesman CRUD + entry:* (mostly superseded by roster.ts) + supervisor CRUD
│       ├── targets.ts            <- legacy per-rep monthly targets table (mostly superseded by staff_monthly_targets)
│       ├── kpi.ts               <- KPI config CRUD + computeKpiScore() scoring engine
│       ├── reports.ts            <- dashboard/monthly/executive/teamPerformance/repHistory/supHistory
│       ├── sales.ts              <- Sale Report aggregations (period compare, by-branch, by-type, weekly/daily trend)
│       ├── upload.ts             <- XLSX bulk import (daily/targets/roster) + daily upload-batch approval workflow
│       ├── sheets.ts             <- Google Sheets push/pull for every config tab + Roster + Users + Entries
│       ├── roster.ts             <- roster:* — month-aware roster CRUD (built on roster_monthly)
│       ├── commission.ts         <- commission config CRUD + commission report + Sheets sync
│       ├── email.ts              <- SMTP config + scheduled report emails
│       └── admin.ts              <- seed test data, data stats
│
├── src/                         <- RENDERER PROCESS (React)
│   ├── main.tsx, App.tsx        <- entry + route tree
│   ├── global.d.ts              <- window.api TypeScript surface — INCOMPLETE, see §18
│   ├── types/index.ts            <- UserRole, MENU_KEYS, ROLE_DEFAULTS, ROLE_LABELS, all shared interfaces
│   ├── store/
│   │   ├── auth.store.ts        <- token, user, permissions (persisted)
│   │   └── app.store.ts          <- selected branch/period filters (persisted)
│   ├── utils/
│   │   ├── csv.ts                <- parse + validate XLSX rows (daily/target/roster)
│   │   ├── xlsx.ts               <- generate XLSX templates
│   │   └── dates.ts              <- date range helpers
│   ├── components/
│   │   ├── layout/ (AppShell, Sidebar, TopBar)
│   │   └── ui/ (GlassCard, KpiCard, ArcGauge, RadialGauge, PeriodFilter, StatusBadge)
│   └── screens/                  <- see §13 for the full table
│
├── credentials/                  <- GITIGNORED — Google service account key, never commit
├── package.json                  <- version, scripts, deps (bump version on every change!)
├── electron-builder.yml           <- Windows installer config
├── electron.vite.config.mjs       <- build paths for main/preload/renderer
├── tsconfig.json                  <- root, project-references only (see §18 typecheck caveat)
├── tsconfig.node.json             <- electron/ TS config
└── tsconfig.web.json              <- src/ TS config
```

---

## 6. Database — Schema & Migrations

### Storage Location

`%APPDATA%\salestrack-pro\data\salestrack.db` — loaded fully into memory by sql.js on startup, written back to disk via `persistDb()` after every write (standalone writes immediately; inside a `transaction()` block, once after COMMIT).

### How Migrations Work

`electron/db/schema.ts` stores `SCHEMA_VERSION = 20`. On startup:

1. Read `app_settings.schema_version`.
2. Missing → fresh install → run `BASE_TABLES` DDL + `seedDatabase()`.
3. `version < SCHEMA_VERSION` → run each `if (currentVersion < N)` migration block in order, bumping the stored version after each.
4. Every migration must be idempotent (`CREATE TABLE IF NOT EXISTS`, `try { ALTER TABLE ... } catch {}` for new columns) since it may partially-run before a crash.

**Never change `BASE_TABLES` without also adding a migration block** — fresh installs read `BASE_TABLES`; existing installs only ever see migration blocks.

> **Known footgun:** raw `db.prepare(sql).run(...)` (sql.js's native API, used in `schema.ts`) takes **one array** of bind params, not variadic arguments — `.run([a, b])`, not `.run(a, b)`. Passing separate arguments silently leaves params unbound (NULL), which only surfaces as a `NOT NULL constraint failed` at runtime, not a compile error. This caused a real production incident (app stuck on "Starting up…" forever) earlier in this project's history. The wrapped `prepare(db, sql)` from `db/query.ts` used everywhere else in `electron/ipc/*.ts` *does* accept variadic args — only raw `db.prepare()` calls inside `schema.ts` need the array form.

### Table Reference (current)

| Table | Purpose |
|-------|---------|
| `app_settings` | Key-value store: `schema_version`, `sheets_id`, `service_account_path`, `kpi_total_base/weight`, `sup_kpi_pct` |
| `branches` | The 4 real branches: Morning Market (MM), Vientiane Center (VC), ITecc (IT), VangThong (VT) |
| `users` | Login accounts. `password_hash` (bcrypt, used for login) + `password_plain` (plaintext, see §17) |
| `sessions` | Auth tokens, 8-hour expiry |
| `user_permissions` | Per-user menu overrides on top of `ROLE_DEFAULTS` (`user_id, menu_key, enabled`) |
| `audit_logs` | login/logout/user changes/sales-upload-submit/sales-upload-delete events, plus roster changes, KPI Settings changes, commission config changes, and supervisor changes (see §13's Audit Log row) |
| `salesmen` | Sales reps. `branch_id/staff_type/supervisor_id/active` here = the **live/current** state (used by daily-upload matching, team listings). Has `rep_code` (unique) |
| `supervisors` | Team supervisor records (separate from `users` login accounts) |
| `roster_monthly` | **The roster source of truth** — one row per rep per month it changed. See [§10](#10-roster--how-it-actually-works) |
| `daily_entries` | One row per salesman per date. `branch_id`/`staff_type` stamped at write time (immutable — a later transfer never re-prices history). `upload_log_id` links back to the upload batch that created it. `synced=0` = not yet pushed to Sheets |
| `upload_logs` | One row per upload batch (`upload_type: 'daily' \| 'target'`, who, when, filename, record count, status) |
| `targets` | Legacy per-rep monthly weight/qty targets (largely superseded by `staff_monthly_targets` + KPI Settings) |
| `staff_monthly_targets` | Per-rep KPI point target per `year_month` |
| `kpi_metrics` | 3 fixed rows: Jewelry (id=1), Bar (id=2), Quantity (id=3) — `points_per_unit` default multiplier |
| `kpi_metric_type_rates` | `(metric_id, staff_type, branch_id?, year_month?)` → `points_per_unit`. NULL `branch_id`/`year_month` = fallback. See priority rule in [§9](#9-kpi-scoring-engine) |
| `kpi_tier_configs` / `kpi_tiers` | Qty scoring tiers — config scoped by branch + `effective_from/effective_to` date range; tiers are `threshold_pct → score` rows under a config |
| `branch_kpi_monthly_targets` | Per-branch-per-month point target override (fallback: `branches.kpi_point_target`) |
| `commission_configs` | LAK commission rates per `(staff_type, year_month)`, plus a `staff_type='supervisor'` row storing the team-share % |
| `sync_logs` | History of Sheets push/pull operations |
| `email_config` | SMTP settings + schedule for automated KPI report emails |

### Removed Tables (don't reintroduce without reading §10)

`salesman_history` and `roster_months` existed through schema v19 (an event-log + a publish-gate table, reconstructed via correlated subqueries). Both were **dropped in v20** in favor of the single `roster_monthly` table — simpler to read, simpler to push to one Sheet tab, no separate "did this month get touched" gate needed.

### Schema Version History (high-level)

| Version | Change |
|---------|--------|
| v1–v9 | Base tables, `upload_logs`, KPI multipliers, branch targets, `supervisors`, rep codes |
| v10 | `staff_monthly_targets`, `commission_configs`, `kpi_metric_type_rates`, `salesmen.staff_type` |
| v13 | `salesman_history` (since removed, see v19) |
| v14 | `kpi_metric_type_rates.branch_id` — rates become branch-scoped |
| v15 | `roster_months` gate table (since removed, see v19) |
| v16 | `kpi_metric_type_rates.year_month` — rates become month-scoped (editing today never rewrites past months' scores) |
| v17 | Bugfix: reset corrupted Global qty-tier fallback values |
| v18 | `daily_entries.upload_log_id` — links entries back to their upload batch, for the approval workflow (§11) |
| v19 | **Roster redesign**: new `roster_monthly` table; dropped `salesman_history` + `roster_months` |
| v20 | `users.password_plain` — see §17 |

---

## 7. IPC Communication — Full Channel Reference

All calls go through `window.api.*` (defined in `electron/preload.ts`). `requireAuth` = any logged-in user; `requireAdmin` = `role === 'admin'` only; other restrictions are noted.

#### Auth & Permissions (`auth.ts`)
`auth:login` · `auth:logout` · `auth:getPermissions` · `auth:getUserPermissions` (admin) · `auth:saveUserPermissions` (admin) · `auth:getUsers` (admin) · `auth:createUser` (admin) · `auth:updateUser` (admin) · `auth:deleteUser` (admin, soft-delete) · `auth:getBranches` · `audit:getLogs` (admin)

#### Legacy Entries & Supervisors (`entries.ts`)
`entry:getSalesmen` · `entry:createSalesman` · `entry:updateSalesman` · `entry:getEntries` · `entry:getEntriesByMonth` · `entry:save` · `entry:saveBatch` · `entry:getUnsyncedCount` — these last 4 (`entry:save*`) back the now-removed Manual Entry UI; no screen calls them anymore but they're left in place. `supervisor:getAll` · `supervisor:save` · `supervisor:delete` · `supervisor:assignSalesmen` (used by TeamPerformance) · `supervisor:getSalesmenForBranch`

#### Legacy Targets (`targets.ts`)
`target:getTargets` · `target:saveTargets` — weight/qty targets; KPI point targets now live in KPI Settings + `staff_monthly_targets` instead.

#### KPI Engine (`kpi.ts`)
`kpi:getMetrics` · `kpi:getConfigs` · `kpi:getTiers` · `kpi:saveConfig` (admin/hr) · `kpi:deleteConfig` (admin/hr) · `kpi:saveMetricMultiplier` (admin/hr) · `kpi:getBranchMetricRates` · `kpi:saveBranchMetricRates` (admin/hr) · `kpi:getBranchQtyTiers` · `kpi:saveBranchQtyTiers` (admin/hr) · `kpi:saveBranchKpiTarget` (admin) · `kpi:getMonthlyBranchTargets` · `kpi:saveMonthlyBranchTargets` (admin/hr) · `kpi:getFormula` · `kpi:saveFormula` (admin) · `kpi:simulate` · `kpi:getSupKpiPct` · `kpi:saveSupKpiPct` (admin)

#### Reports (`reports.ts`)
`report:dashboard` · `report:monthly` · `report:executive` · `report:teamPerformance` · `report:repHistory` (6-month trend + commission) · `report:repDailyEntries` (drill-down chart) · `report:supHistory` · `report:branchAnalytics`

#### Sale Report (`sales.ts`)
`sales:getReport` — period vs. prior-period vs. same-period-last-month, by-branch, by-staff-type, weekly trend (8 weeks), daily trend, calendar-week WoW comparison.

#### Upload (`upload.ts`)
`upload:daily` (accountant_officer only — rejects rows that conflict with an existing record, see §11) · `upload:getDailyBatches` (accountant_manager/admin) · `upload:deleteDailyBatch` (accountant_manager/admin) · `upload:targets` · `upload:roster` (admin/hr/hr_support) · `upload:getRosterTemplate` · `upload:getLogs` · `upload:getCoverage` · `upload:getSalesmenForTemplate` · `upload:getRepUploadStatus`

#### Roster (`roster.ts`) — see [§10](#10-roster--how-it-actually-works)
`roster:getAll` (admin/hr) · `roster:getAllAsOf` (admin/hr) · `roster:saveRep` (admin/hr) · `roster:deactivate` (admin/hr) · `roster:reactivate` (admin/hr)

#### Commission (`commission.ts`)
`commission:getConfigs` · `commission:saveConfig` (admin, also pushes to Sheets) · `commission:pullConfigs` (admin) · `commission:getReport`

#### Google Sheets (`sheets.ts`)
`sheets:getConfig` · `sheets:saveConfig` · `sheets:getSyncLogs` · `sheets:testConnection` · `sheets:browseFile` · `sheets:syncToCloud` (push unsynced entries only) · `sheets:pullFromCloud` · `sheets:pushConfig` (push all config tabs) · `sheets:forceSyncAll` (full bidirectional resync — see §12)

#### Email (`email.ts`)
`email:getConfig` · `email:saveConfig` · `email:sendTest`

#### Admin (`admin.ts`)
`admin:seedTestData` (admin) · `admin:dataStats` (admin)

---

## 8. Role-Based Access Control

### The 8 Roles

| Role | Scope | Notes |
|------|-------|-------|
| `admin` | All branches | Full function + User Management, but **no** Sales Upload, KPI Setup, or Roster |
| `sales_sup` | Own team (`supervisor_id`) | Team Report, Team KPI, Team Commission |
| `accountant_officer` | Own branch | Sales Upload (XLSX only — Manual Entry was removed app-wide), Sale Report |
| `accountant_manager` | All branches | Approves/clears upload batches (§11), Sale Report |
| `branch_manager` | Own branch | All teams within their branch, Sale Report |
| `hr` | All branches | Everything except User Management — includes KPI Settings, Roster — but no Sales Upload |
| `hr_support` | — | Roster Upload only (not full Roster CRUD) |
| `top_manager` | All branches | View-only oversight, everything except User Management |

A legacy `accountant` role string existed mid-redesign and has since been **fully removed** from the codebase — if you see it anywhere, it's stale.

### Where Defaults Live (and the #1 gotcha)

`ROLE_DEFAULTS` (role → default `MenuKey[]`) is defined **twice**:
- `src/types/index.ts` — frontend fallback / display
- `electron/ipc/auth.ts` — backend, what `computePermissions()` actually returns at login

**These must be edited together.** A real bug occurred earlier in this project from exactly this drifting out of sync (a menu key added to one copy but not the other → menu silently invisible despite the frontend "knowing" it should exist).

On top of `ROLE_DEFAULTS`, a `user_permissions` table holds **per-user overrides** (`user_id, menu_key, enabled`) settable in User Management's permission modal — lets you grant one specific "special" user extra menus beyond their role, without touching the role itself.

### Scoping in Practice

Every relevant handler re-derives scope server-side from `requireAuth(token)`'s `role`/`branch_id`/`supervisor_id` — never trusts client-passed branch filters for scoped roles:

```
sales_sup:           branchIds = [user.branch_id]; supervisorId = user.supervisor_id
branch_manager:       branchIds = [user.branch_id]
accountant_officer:   branchIds = [user.branch_id]
accountant_manager:   no branch scoping (sees all)
admin / hr / top_manager: no scoping (see all branches)
```

---

## 9. KPI Scoring Engine

All scoring lives in `electron/ipc/kpi.ts` → `computeKpiScore(db, metricId, branchId, actual, target, date, staffType?)`.

### Priority Rule (used for both Jewelry/Bar rates AND Qty tiers)

> **branch + this month > branch + standing (no month) > global + this month > global + standing**

"Standing" = `year_month IS NULL` (Jewelry/Bar rates) or `effective_to IS NULL` (Qty tier configs) — the fallback that applies to any month without a more specific override. **Editing a rate today never rewrites how a past month already scored** — that's the entire reason `year_month`/`effective_from`/`effective_to` exist instead of one eternal value per branch.

```
Jewelry / Bar:  score = actual_baht × points_per_unit   (type-rate lookup, falls back to kpi_metrics default)
Quantity:       find the active tier config for (branch, staffType, date)
                tiers sorted DESC by threshold_pct — first tier where actual >= threshold wins
                score = actual_qty × tier.score
```

### Branch KPI %

```
Total KPI Points = jewelry_score + bar_score + qty_score
Branch Point Target priority: branch_kpi_monthly_targets (year+month override) > branches.kpi_point_target (default)
KPI % = Total KPI Points / Branch Point Target × 100
```

### Supervisor KPI

```
team_total_score = sum of all reps' KPI points
sup_score         = team_total_score × (sup_kpi_pct / 100)   — default 30%, editable in KPI Settings
sup_kpi_pct_ach   = sup_score / branch_target × 100
```

`branch_target` here is per-rep target summed across the team, same fallback chain as Rep KPI%: each rep's individual `staff_monthly_targets` override if set, else the branch+staff-type default. (Fixed a bug where Supervisor "Team KPI %" always showed 0.0% because this fallback wasn't applied — it now matches how Rep KPI% already worked.)

### Est. Month End

```
eomKpiPct = (current_kpi_pct / day_of_month) × days_in_month
```

---

## 10. Roster — How It Actually Works

**One table, one Sheet tab.** `roster_monthly` has one row per rep per month it actually changed — columns: `salesman_id, year_month, branch_id, supervisor_id, staff_type, active`.

### Reads carry forward automatically — except the Roster screen's own display

"Roster as of month X" resolves to the **nearest month ≤ X that has any rows** — a month nobody touched simply reads as whatever the last edited month said. No "confirm this month, nothing changed" step exists or is needed for KPI/report calculations.

```
resolveYm(year, month) = SELECT MAX(year_month) FROM roster_monthly WHERE year_month <= target
```

This is a pure read — it never writes, so viewing a report never triggers a disk persist.

**The Roster screen itself is the one exception.** Selecting a month with no rows shows an empty table ("No roster uploaded for {Month} {Year}") instead of silently falling back to the nearest earlier month's data — this forces HR to explicitly touch every month even if nothing changed, so what's on screen always reflects what was actually uploaded/edited for that exact month. The carry-forward safety net described above still applies everywhere else (KPI Report, Sale Report, branch target math) — only the Roster screen's own display opted out of it.

### Writes materialize the target month first

Editing/uploading for a month with no existing rows first **copies the nearest earlier month's full row-set forward** into that month (`ensureMonthMaterialized`), then applies the specific change on top. This keeps every "touched" month a complete, self-contained snapshot — no patchwork of "this rep from month X, that rep from month X-2" when reading one month.

### Two states, one cache

- `roster_monthly` — the month-indexed source of truth, used by the Roster screen and `getHeadcountAsOf()` (branch target headcount math).
- `salesmen.branch_id/staff_type/supervisor_id/active` — a **live "right now" cache**, used everywhere that doesn't care about history (daily-upload rep matching, team listings). Every roster edit updates both.

### Editing a specific month

The Roster screen has a month/year picker; `roster:saveRep`/`deactivate`/`reactivate` now accept an explicit `year`/`month` and target that month specifically (previously a real bug existed where edits always silently wrote to *today's* month regardless of which month was being viewed — fixed as part of the v19 redesign).

### Two tabs: Reps and Sup

The Roster screen has a **Reps** tab (existing rep CRUD, unchanged) and a **Sup** tab (read-only list of supervisors for the selected month — Sup Code, Name, Branch, Type, live Rep headcount, Target, Status). The Sup tab lets HR check both reps and supervisors are accounted for in one place, without cross-referencing Team Performance.

The Reps tab also shows a **Target** column — each rep's monthly KPI point target: their individual override from `staff_monthly_targets` if one is set, otherwise the branch+staff-type default.

The old **Show Inactive** toggle was removed — inactive reps are now always hidden from the Reps tab list (a footer count still shows how many are hidden).

### Uploading

`upload:roster`'s `Effective_Date` column is still the only thing that decides which month a row counts for — it threads through to the same `snapshotSalesman(db, salesmanId, effectiveDate)` → `roster_monthly` write path as manual edits.

### `admin:seedTestData` gotcha

`seedTestData()` in `seed.ts` must insert into `roster_monthly` for every rep it creates (May + current month) — without it, seeded reps are invisible on the Roster screen and `getHeadcountAsOf()` returns 0, zeroing out branch point-target math. The `admin:seedTestData` handler also clears `roster_monthly` + `staff_monthly_targets` *before* deleting `salesmen` — both have a foreign key to it and `PRAGMA foreign_keys=ON` means deleting `salesmen` first throws.

---

## 11. Sales Upload — Approval Workflow

Sales data drives KPI and commission, so it's deliberately **not** a simple overwrite-on-reupload anymore.

```
Accountant Officer uploads XLSX (own branch only)
  → for each row, check daily_entries for an existing (salesman_id, entry_date) row
      no existing row  → insert, tag with upload_log_id
      existing row     → REJECT — "ask an Accountant Manager to clear the conflicting
                          upload batch before re-uploading"
  → upload_logs row created/updated; audit_logs gets a `sales_upload_submitted` entry
```

To fix a mistake, an **Accountant Manager** (or admin) goes to Upload History → "Sales Upload Records — Approval" panel, finds the bad batch, and clicks **Delete & Allow Resubmit** — this deletes every `daily_entries` row tagged with that `upload_log_id` (and only those), logs a `sales_upload_deleted` audit entry, then the Accountant Officer can re-upload corrected data for those exact rep/date slots.

The same panel also has a **Delete by Branch + Date** tool, separate from the per-batch button above. Instead of targeting a whole upload batch, it lets an Accountant Manager pick one branch plus an exact date (or date range) and delete just the `daily_entries` rows for those dates — independent of which uploaded file originally created them. Useful when one uploaded file covered many dates/months and only a single day needs correcting. It shows a live preview count of how many entries match before deleting, gated behind a confirm dialog.

Manual Entry (the old inline-editable table) was **removed entirely** as part of this — Daily Entry is XLSX-upload-only now, for every role.

---

## 12. Google Sheets Sync

### Setup

1. Create a Google Cloud project → enable Sheets API → create a Service Account → download the JSON key.
2. Share the target Spreadsheet with the service account email (Editor role).
3. In-app Settings: enter Spreadsheet ID + path to the JSON key, then **Test Connection**.

### Tabs (one push function per tab in `sheets.ts`, all via the shared `writeTab()` helper — clears the whole tab then rewrites, so there's never leftover garbage from a previous format)

`Entries` · `Settings` · `Branches` · `KPIRates` · `QtyTiers` · `Roster` (single tab, `Month` column — see §10) · `CommissionConfig` · `Users` (real password — see §17) · `Supervisors` · `MonthlyBranchTargets`

### Push vs. Pull

- `sheets:syncToCloud` — pushes only `daily_entries WHERE synced = 0`.
- `sheets:pushConfig` — pushes every config tab (not Entries).
- `sheets:forceSyncAll` — full reset: clears `Entries` tab, marks every entry unsynced, re-pushes everything (entries + all config tabs). Use this after a schema/format change to wipe any stale-format rows out of the Sheet.
- `sheets:pullFromCloud` (`pullAllFromCloud` internally) — pulls every tab back into the local DB. Each tab has **exactly one** canonical parser function (e.g. `pullCommissionConfigsFromSheet`, `pullRosterFromSheet`) shared between the dedicated pull buttons and the full pull — there used to be duplicate, subtly-different parsers for the same tab in two files, which silently corrupted data by reading columns in the wrong order. If you add a new push format, **grep for any other reader of that tab before assuming there's only one.**

### Sync status indicator (every screen, every role)

`TopBar` shows a small status pill next to the existing "Updated Xm ago" freshness timestamp: a red "Sheets not connected" pill (if this device has no Sheets config at all) or a red "Sync failed" pill (if the most recent automatic sync attempt failed). Fed by the startup sync result via the app store. This is visible to **every role**, not just Admin/HR — a device with no Settings access (e.g. Accountant Officer, Sales Supervisor) previously had no way to know data might be stale; now it gets a visible signal instead of silently-empty/stale data.

### CRITICAL Security Rule

**The service account JSON file must never be committed to git.** `credentials/` is gitignored — never remove that entry. If it's ever accidentally committed: revoke the key in Google Cloud Console immediately, generate a new one, and scrub git history.

---

## 13. Screens — What Each Page Does

| Route | Screen | Purpose |
|-------|--------|---------|
| `/login` | Login | Username + password. After login, routes to the **first menu item the user's own role actually has** (`getHomeRoute` walks `NAV_ITEMS` in order against the user's permissions) — not always Dashboard. Accountant Officer lands on Daily Entry, Accountant Manager lands on Sale Report, HR Support lands on Roster, since none of them have a Dashboard menu item. |
| `/dashboard` | Dashboard | MTD KPI gauge, top performers, quick stats |
| `/entry` | DailyEntry | XLSX upload only (Manual Entry removed) — see §11 for the approval flow |
| `/reports` | Reports | Monthly performance table per rep; tabs for overview/supervisor/performance/commission/customer-type; rep/sup row → profile modal with trend chart (one Total Weight bar in grams, Jewelry+Bar combined, plus one Quantity line — same style across Month/Week/Day for reps and Month-only for supervisors) |
| `/sale-report` | SaleReport | Period comparisons, by-branch/by-type breakdowns, weekly/daily trend charts, weekday %-contribution heatmap |
| `/executive` | Executive | Company-wide KPI, branch comparison (legacy — most of this overlaps Reports now) |
| `/kpi-settings` | KpiSettings | Per-branch Jewelry/Bar rates, Qty tiers, branch point targets, commission rates, KPI formula constants, score simulator |
| `/upload-history` | UploadHistory | Branch coverage matrix, upload log, **Sales Upload Records — Approval** panel (accountant_manager/admin only, §11) |
| `/roster` | Roster | Reps tab (month-aware roster CRUD + XLSX upload, now shows a Target column) + Sup tab (read-only supervisor list for the month) — see §10 |
| `/settings` | Settings | Google Sheets config + Force Full Sync, email config |
| `/users` | UserManagement | User CRUD + per-user permission overrides |
| `/audit-log` | AuditLog | Event log — login/logout/user changes/sales-upload, plus roster, KPI Settings, commission config, and supervisor changes; filterable by event type |
| `/analytics` | — | **Removed** — redirects to `/reports`. Screen file (`src/screens/Analytics/`) still exists but is unreachable dead code. |

Menu visibility per role is `ROLE_DEFAULTS` (§8) — not a hardcoded per-route role list.

---

## 14. Frontend State Management

### `auth.store.ts` (Zustand, persisted)
`{ token, user: AuthUser | null, permissions: string[], isAuthenticated, branches, login()/logout() }` — `permissions` is re-fetched from the backend on every `AppShell` mount (not trusted from a stale persisted value), so a backend `ROLE_DEFAULTS` change takes effect without a manual logout.

### `app.store.ts` (Zustand, persisted)
`{ selectedBranchId(s), selectedYear, selectedMonth, dateFrom, dateTo, ... }` — UI filter state, persisted across refreshes.

---

## 15. Build & Deploy

```bash
npm run dev          # hot reload renderer; restart needed for electron/* changes
npm run typecheck     # see §18 — currently a near no-op, don't fully trust a clean result
npm run dist:win      # build + package as Windows installer (NSIS, electron-builder.yml)
```

sql.js needs `sql-wasm.wasm` — `electron-builder.yml`'s `extraResources` copies it into the packaged app. If missing, the app crashes on startup with a WASM-loading error (caught and shown via the startup error screen in `App.tsx`, with details written to `startup-error.log` in the app's userData folder).

### Version Bumping Rule

Bump `version` in `package.json` on every change and mention the version in the commit message. Patch for fixes, minor for features, major for breaking changes.

---

## 16. Default Credentials

Seeded by `seedDatabase()` on a truly fresh install (empty DB, no `app_settings.schema_version` row):

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin1234` | Admin |
| `sup_mm` / `sup_vc` / `sup_it` / `sup_vt` | `sup1234` | Sales Supervisor, one per branch |
| `bm_mm` / `bm_vc` / `bm_it` / `bm_vt` | `bm1234` | Branch Manager, one per branch |
| `acct_off_mm` / `acct_off_vc` / `acct_off_it` / `acct_off_vt` | `acctoff1234` | Accountant Officer, one per branch |
| `acct_mgr` | `acctmgr1234` | Accountant Manager |
| `hr` | `hr1234` | HR |
| `hr_support` | `hrsup1234` | HR Support |
| `top_manager` | `top1234` | Top Manager |

**Change every password before real production use** — via User Management, or directly in the Users Google Sheet tab (see §17, this writes plaintext + gets re-hashed on next pull).

---

## 17. Security Notes

### What's secured

- Every IPC handler calls `requireAuth`/`requireAdmin` — no unauthenticated backend access.
- `contextBridge` + `nodeIntegration: false` — renderer cannot touch Node.js directly.
- Parameterized SQL everywhere via `prepare(db, sql).run(...)` — no SQL injection.
- Sessions expire after 8 hours.

### Deliberate tradeoff: plaintext passwords are pushed to the Users Sheet tab

`users.password_plain` was added in schema v20 **at the explicit request of this app's owner** — they wanted to be able to read a forgotten password directly off the Sheet instead of doing a reset, and accepted the risk that anyone with access to that Sheet (or the local `.db` file) can now read every account's real password.

- **Login itself still checks `password_hash` (bcrypt)** — `password_plain` is never used to authenticate. This means stealing the local DB file alone doesn't trivially compromise login *unless* the thief also reads `password_plain` directly from the same file, which they can (it's right there in plaintext).
- Pulling from Sheets re-hashes whatever plaintext it reads (`bcrypt.hashSync`) before writing `password_hash` — so a Sheet edit still produces a working bcrypt hash, it doesn't bypass hashing.
- **If you ever revert this decision:** drop `password_plain` from `pushUsers()`'s SELECT and the Sheet's column list, stop writing it in `auth:createUser`/`auth:updateUser`, and tell the Sheet's editors to manually clear the existing plaintext history out of Sheets version history too (Google Sheets keeps edit history even after a cell is cleared).
- **Restrict who can open the Users Sheet tab.** That's now the single point where a leak exposes every account's real password.

### Other things to be careful about

1. **Service account JSON must never be in git** (see §12).
2. **No remote network exposure** — all IPC is in-process inside Electron; the only outbound network calls are to the Google Sheets API.

---

## 18. Known Gaps / Technical Debt

Found while working on this codebase — not fixed because they're outside whatever task surfaced them, flagging so the next person doesn't waste time rediscovering them.

### `npm run typecheck` is close to a no-op

The root `tsconfig.json` uses TypeScript project references with `"files": []`. Plain `tsc --noEmit` on that config does **not** build the referenced projects (`tsconfig.node.json` / `tsconfig.web.json`) — it just sees zero files and exits 0 immediately. A clean `npm run typecheck` does **not** mean the code type-checks.

To actually check, run both referenced projects directly:
```bash
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
```
Doing this surfaces ~60 pre-existing errors, mostly:
- `src/global.d.ts`'s `Window.api` interface is missing roughly half of what `preload.ts` actually exposes (e.g. `getCommissionReport`, `getBranchMetricRates`, `getTeamPerformance`, `checkAppReady`, and more were never typed). Calls to these compile fine at runtime (it's just a type-checking gap), but TS can't catch a typo or signature mismatch on them.
- Several Recharts `Tooltip`/`Legend` `formatter` callbacks have signatures that don't match the installed Recharts version's types (cosmetic — charts work fine at runtime).
- `electron/db/query.ts` / `electron/db/schema.ts`: a couple of raw sql.js calls pass a `bigint` or single non-array value where the installed `@types/sql.js` wants `SqlValue[]`.
- `electron/ipc/sales.ts`: a few `unknown`-typed values passed where `Value` is expected.

None of this is from any change documented above — confirmed by running the per-project check before and after each change in this session and diffing. Worth a dedicated cleanup pass (start with filling in `global.d.ts`, since that's the highest-value fix — it would have caught several real bugs earlier).

### `src/screens/Analytics/` is dead code

Menu/route removed (§13), file left in place. Delete outright if you're sure it won't come back.

### `src/screens/Executive/`, `entries.ts`'s `entry:create/updateSalesman`, `target:*`

Functionally overlapping with newer features (Reports tabs, Roster, KPI Settings + `staff_monthly_targets`) but not removed — still reachable, not actively maintained. Don't build new features on top of them; check whether the newer equivalent already covers your need first.

---

## 19. How to Add a New Feature

### Add a New IPC Handler

1. Open the relevant file in `electron/ipc/` (or create one and register it in `electron/ipc/index.ts`).
2. ```typescript
   ipcMain.handle('domain:action', async (_e, token: string, ...args) => {
     const user = requireAuth(token)  // or requireAdmin(token)
     // your logic — re-derive scope from `user`, never trust client-passed branch/role filters
     return result
   })
   ```
3. Expose it in `electron/preload.ts`'s `contextBridge.exposeInMainWorld` block.
4. Add the signature to `src/global.d.ts` (the file is incomplete — see §18 — but please don't make it more incomplete).
5. Call `window.api.yourNewMethod(token, ...)` from React.

### Add a New Screen

1. `src/screens/YourScreen/index.tsx`
2. Route in `src/App.tsx`
3. Add the screen's menu key to `MENU_KEYS` in `src/types/index.ts`, give it a label in `MENU_LABELS`, and add it to whichever roles' `ROLE_DEFAULTS` should see it — **in both `src/types/index.ts` and `electron/ipc/auth.ts`** (see §8's gotcha).
4. Add a nav item in `src/components/layout/Sidebar.tsx`.

### Add a Database Column/Table

1. Add to `BASE_TABLES` in `electron/db/schema.ts` (fresh installs).
2. Add a migration block, bump `SCHEMA_VERSION`:
   ```typescript
   if (currentVersion < 21) {
     try { db.run(`ALTER TABLE some_table ADD COLUMN new_col TEXT`) } catch { /* already exists */ }
     db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '21')`).run()
   }
   ```
3. Update the TypeScript interface in `src/types/index.ts`.

### Change KPI Scoring Rules

- Jewelry/Bar multiplier or Qty tiers: KPI Settings UI — no code change needed.
- Add a 4th KPI metric: insert a row into `kpi_metrics`, update `computeKpiScore()` in `kpi.ts`, update whatever report SQL needs to aggregate the new metric.

### Push a New Sheet Tab

Add a `push*`/`pull*From Sheet` pair in `sheets.ts`, both reading/writing the **same column order** — re-read §12's pull-vs-push warning before assuming a quick copy-paste is safe; two independent writers/readers for the same tab is exactly how the Roster and CommissionConfig tabs got corrupted earlier in this project.

---

*SalesTrack Pro — KPV Gold & Jewelry Sales Performance System*
*GuideBook last updated: 2026-06-19 · Schema v20 · App v1.7.88*
