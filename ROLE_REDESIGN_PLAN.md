# Role & Permission Redesign — Implementation Plan

Status: **Spec agreed, not yet implemented.** Written 2026-06-17 to survive a context/limit reset — read this first before continuing the work.

## 1. Decisions locked in (confirmed with user)

1. **Manual Entry is removed entirely.** Daily Entry becomes XLSX Upload only — no more inline editable table. This applies app-wide, not just for one role.
2. **Top Manager = view-only oversight.** Sees everything (all branches) but cannot upload, approve, or edit anything.
3. **HR = everything except User Management.** Includes KPI Settings, Roster, Settings (Sheets/email config) — just not creating/editing user accounts.
4. **Branch Manager's "Sales Team report All" = all teams/supervisors within their OWN branch** (not all branches). Sale Report stays branch-scoped too, consistent.

## 2. Target role list (replaces current 6-role system)

| # | Role key (new) | Display name | Notes |
|---|---|---|---|
| 1 | `sales_sup` (existing, reused) | Supervisor | Team Report, Team KPI, Team Commission — own team only (`supervisor_id` scope) |
| 2 | `accountant_officer` (**new**) | Accountant Officer | Sales Upload (XLSX, with new restriction below), Sale Report — own branch only |
| 3 | `accountant_manager` (**new**) | Accountant Manager | Sales Modify Approver (new screen/power), Sale Report — ALL branches |
| 4 | `branch_manager` (existing) | Branch Manager | Team report for all teams in own branch, Sale Report — own branch only |
| 5 | `hr` (existing, scope expanded) | HR | Full function except User Management. No Sales Upload. |
| 6 | `hr_support` (**new**) | HR Support | Roster Upload, Commission Payment (see open question below) |
| 7 | `admin` (existing, scope restricted) | Admin | All function + User Management, but **NOT** Sales Upload, KPI Setup, or Roster |
| 8 | `top_manager` (existing, scope expanded) | Top Manager | View-only, all branches, everything except User Management — no write actions anywhere |

The generic `accountant` role is retired — existing users with that role need manual reassignment to `accountant_officer` or `accountant_manager` by Admin after rollout (can't auto-decide which).

## 3. Menu/permission matrix (draft — confirm before coding)

Existing `MENU_KEYS`: `dashboard, daily_entry, kpi_report, sale_report, analytics, upload_history, roster, kpi_settings, audit_log, user_management, settings`

Need one more concept beyond simple menu on/off: **branch scope** (own branch / all branches / own team) per role, already partially exists via `user.branch_id` / `user.supervisor_id` — extend the same pattern to the 2 new roles.

| Menu | sales_sup | accountant_officer | accountant_manager | branch_manager | hr | hr_support | admin | top_manager |
|---|---|---|---|---|---|---|---|---|
| dashboard | ✓ own team | – | – | ✓ own branch | ✓ all | – | ✓ all | ✓ all (view) |
| daily_entry (upload) | – | ✓ own branch | – (approver, not uploader) | – | – (no upload) | – | – | – |
| kpi_report | ✓ own team | – | – | ✓ own branch (all teams) | ✓ all | – | ✓ all | ✓ all (view) |
| sale_report | – | ✓ own branch | ✓ all branches | ✓ own branch | ✓ all | – | ✓ all | ✓ all (view) |
| analytics | – | – | – | – | ✓ all | – | ✓ all | ✓ all (view) |
| upload_history | – | – | ✓ (sees upload records to approve/delete) | – | ✓ all | – | ✓ all | ✓ all (view) |
| roster | – | – | – | – | ✓ all | ✓ upload only | – (excluded) | ✓ all (view) |
| kpi_settings | – | – | – | – | ✓ all | – | – (excluded) | ✓ all (view) |
| audit_log | – | – | ✓ (their own approve/delete actions) | – | ✓ all | – | ✓ all | ✓ all (view) |
| user_management | – | – | – | – | – | – | ✓ | – |
| settings | – | – | – | – | ✓ all | – | ✓ all | ✓ all (view) |

**Open question to confirm later:** does Top Manager's "view-only" mean they see the SAME screens as everyone else just with buttons disabled, or do we build a read-only variant? Recommend: reuse existing screens, just hide/disable action buttons (Upload/Approve/Edit/Add/Delete) based on role — far less work than separate read-only views.

## 4. Sales Modify approval workflow (the sensitive part)

**Current behavior (to be replaced):** `upload:daily` does DELETE-then-INSERT per (salesman_id, entry_date) — silently overwrites existing data, no approval, no real audit trail.

**New behavior:**
1. Accountant Officer uploads XLSX via Daily Entry.
2. For each row, backend checks if `daily_entries` already has a row for that `(salesman_id, entry_date)`:
   - **No existing row** → insert normally, tag with `upload_log_id` (new column, see schema below).
   - **Existing row found** → **reject the row**, add to error list: *"Existing record for this rep/date — ask Accountant Manager to clear it before re-uploading."* Reuse the error-modal UI already built for the daily-upload error-fix flow (`ErrorRow`/error modal in `DailyEntry`/`Roster` — same pattern, just a new rejection reason).
3. Accountant Manager gets a new view (likely a tab on `Upload History`, since that's closest to its existing audience) listing **daily upload batches** (`upload_logs WHERE upload_type='daily'`): uploaded by, branch, date range, record count, timestamp.
4. Manager action: **"Delete & Allow Resubmit"** on a batch → deletes all `daily_entries` rows where `upload_log_id = that batch's id`, logs to `audit_logs` (event_type `sales_upload_deleted`), batch disappears from the list (or marked cleared). This re-opens those exact rep+date slots for the Officer to re-upload corrected values.
5. Every upload (success) and every manager-delete also writes to `audit_logs` — "on watch" requirement. `logAudit()` helper already exists (`auth.ts`) but `upload.ts` doesn't call it yet — needs wiring.

**Schema change needed:** `daily_entries` gains `upload_log_id INTEGER REFERENCES upload_logs(id)` (nullable — NULL for any pre-existing/legacy rows, including ones from the now-removed Manual Entry). `upload:daily` sets it on insert; the new delete-batch handler filters by it.

**Open question:** should Accountant Manager's delete action be all-or-nothing per batch, or able to clear individual rep+date rows within a batch? Recommend all-or-nothing first (simpler, matches "delete the upload file" language in the spec) — can refine later if too coarse.

## 5. Other new/changed features mentioned

- **PDF export** for KPI Report (currently only CSV export exists, added earlier this session). Need a PDF generation approach — likely `window.print()`-to-PDF via a print-styled view, or a library (`jspdf`/`html2canvas`). Needs its own design pass.
- **Commission Payment** (HR Support's second capability) — doesn't exist as a concept yet. Likely: add a "paid" flag + paid_at timestamp to commission records (rep and/or supervisor), with a "Mark as Paid" action restricted to HR Support (and probably HR/Accountant Manager too). Needs its own design pass — not detailed here yet.
- **Remove Manual Entry** — delete the manual-entry tab/table/handlers from `DailyEntry` screen and retire `entry:save`/`entry:saveBatch`/`entry:getEntries` IPC handlers (or leave handlers but remove all UI access — recommend full removal per the decision in §1, cleaner).

## 6. Implementation checklist (suggested order)

1. **Schema migration** (next version after current): 
   - Add `daily_entries.upload_log_id` (nullable).
   - No new role enum needed at DB level (role is just a TEXT column already) — just update `ROLE_DEFAULTS` in both `src/types/index.ts` AND the duplicated copy in `electron/ipc/auth.ts` (remember: these two have drifted out of sync before — bug we already hit once this session).
2. **Type updates**: `UserRole` in `src/types/index.ts` gets `accountant_officer`, `accountant_manager`, `hr_support` added; drop/deprecate plain `accountant`.
3. **Backend `upload:daily` rework**: existing-row conflict detection + rejection + `upload_log_id` tagging + `logAudit()` calls.
4. **New backend handlers**: list daily upload batches (for Accountant Manager), delete-batch-and-clear.
5. **Frontend**: 
   - Remove Manual Entry tab from `DailyEntry` screen.
   - New "Sales Upload Records" panel (likely inside `UploadHistory`) for Accountant Manager — list + delete action.
   - Role-based button hiding for Top Manager (view-only) across affected screens.
6. **User Management UI**: add the 3 new roles to role picker, branch/team assignment fields already mostly exist (reuse `ROLES_NEEDING_BRANCH`/`ROLES_NEEDING_SUPERVISOR` pattern, just add the new roles to the right list).
7. **Sidebar/menu visibility**: update `ROLE_DEFAULTS` (both copies!) per the matrix in §3.
8. **PDF export** — separate task, lower priority, design later.
9. **Commission Payment tracking** — separate task, lower priority, design later.
10. **Migrate existing `accountant`-role users** — flag for Admin to manually reassign after rollout (can't be automated safely).

## 7. Known risk / gotcha to remember

`ROLE_DEFAULTS` is defined in **two places** that must stay in sync: `src/types/index.ts` (frontend) and `electron/ipc/auth.ts` (backend — this is the one that actually computes live permissions). We already hit a real bug this session from these drifting apart. When implementing the new role matrix, update both, in the same commit.
