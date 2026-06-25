# SKILL.md — KPV Sale Performance Tracking: Sync Architecture

Read this FIRST before touching anything in `electron/ipc/sheets.ts`, `electron/ipc/upload.ts`,
`electron/ipc/roster.ts`, `electron/ipc/entries.ts`, or `electron/db/schema.ts`. It exists so a
future session doesn't have to re-derive this from scratch or re-read the whole chat history.

Last updated: 2026-06-25, app version 1.9.39.

## What this app is

Electron desktop app (React frontend, `better-sqlite3` local DB per device) for tracking daily
sales/KPI/commission across 4 branches. Each device has its OWN local SQLite file. Google Sheets
is the shared backend every device pushes to and pulls from. **There is no live/real-time sync —
it's local-first, periodic pull, manual or event-triggered push.**

## The one rule that explains every bug we've hit in this area

**Pull is upsert-only. It never deletes a local row just because that row disappeared from the
Sheet.** Every single bug found in this area (Entries not reflecting deletes, Roster reps never
disappearing after a permanent delete, Sup Roster going empty after a reconnect) traces back to
this one fact. Adds and edits always work fine via pull, because the Sheet always contains the
CURRENT value for any key that still exists — pull just upserts it. Deletes don't work via pull
alone, because there's no "this key used to exist, now it's gone" signal for pull to react to.

Two fixes exist for this, used depending on the table's sync model (see below):
1. **Tombstone row** — append a marker row saying "X was deleted" to a Sheet tab; pull reads the
   marker and does a scoped, single-key local delete. Used for Entries and Roster reps.
2. **Don't have the problem** — tables that only support Edit/Add (no delete button exists in the
   UI at all) can't hit this bug, because there's no action that produces an asymmetric delete.

## Sync model per table — two patterns

**Append-only (never cleared, ever):** `Entries`, `AuditLog`, `UploadLog`, `RosterDeletions`.
New rows only ever get appended. Safe under concurrent writers from multiple devices. Pull reads
the whole tab and replays rows in order — last row for a given key wins.

**Full-rewrite/snapshot (cleared + rewritten on every push):** `Roster`, `SupervisorRoster`,
`Branches`, `KPIRates`, `QtyTiers`, `CommissionConfig`, `Users`, `Supervisors`,
`MonthlyBranchTargets`, `KpiSubmissions`. Each push sends the device's ENTIRE current local table
for that data. `writeTab()` in sheets.ts has a guard: refuses to wipe the tab with an empty local
write if the Sheet already has real rows (protects against a device with an empty/stale local
copy accidentally erasing everyone else's data).

## Tombstone tables (the delete-fix)

- **`entry_deletions`** (salesman_id + entry_date, no FK once written) — written by
  `upload:deleteDailyBatch` and `upload:deleteDailyEntriesByDate` in upload.ts. Pushed as a row in
  the `Entries` tab itself with an extra `Deleted` column = `1`. Pull (`pullAllFromCloud`'s Daily
  Entries section) sees `Deleted=1` for a key and does `DELETE FROM daily_entries WHERE
  salesman_id=? AND entry_date=?` — scoped to that one row, never a bulk wipe.
- **`roster_deletions`** (rep_code, no FK — salesman row is already gone by the time this is
  written) — written by `roster:permanentlyDelete`. Pushed to its own `RosterDeletions` tab.
  Pull (after the normal Roster pull, so the tombstone has final say) does a scoped delete of
  exactly that rep_code's `roster_monthly` + `salesmen` rows — skips if the rep somehow still has
  local `daily_entries` (same guard the original delete handler uses, to avoid an FK crash).

**If you ever add a new hard-delete button for some other table**: it needs the same treatment —
a tombstone table + a tab/column to carry it + a pull-side scoped delete. Don't just `DELETE FROM
x` locally and call it done; that's exactly the bug class this whole doc is about.

## Safety guards already in place — don't remove these

- `writeTab()` (sheets.ts): skip clear+rewrite if local push is empty but remote already has data.
- `sheets:forceSyncAll`: refuses to run if local `daily_entries` count is less than the Sheet's row
  count (catches a freshly-reconnected device with an incomplete pull from nuking the Sheet).
- `sheets:bootstrapConnect` (switch database / fresh install): wraps its full local wipe in
  `db.pragma('foreign_keys = OFF')` ... `finally { db.pragma('foreign_keys = ON') }` — this
  replaced a fragile manually-ordered DELETE sequence that kept breaking every time a new FK-linked
  table got added. Don't go back to manual ordering; just make sure any NEW table added to that
  wipe list is added to the DELETE list too (FK pragma off means order within the list no longer
  matters, but every table still needs to actually be in the list or it survives the wipe).
- Delete actions (`upload:deleteDailyBatch`, `upload:deleteDailyEntriesByDate`) **await** their
  push and return `{ cloudSynced, cloudSyncError }` instead of fire-and-forget — because an
  Accountant Officer waiting to re-upload depends on the delete actually having reached the Sheet
  first. Regular add/edit pushes stay fire-and-forget (lower stakes, retried by the next periodic
  pull/push naturally surfacing the unsynced count).
- `entry:getUnsyncedCount` counts BOTH `daily_entries WHERE synced=0` AND `entry_deletions WHERE
  synced=0` — a delete tombstone stuck unpushed must show up in this count, or the "unsynced"
  badge lies.
- Supervisor auto-create on pull: both `pullRosterFromSheet` (Roster tab) and
  `pullSupervisorRosterFromSheet` (SupervisorRoster tab) will CREATE a missing supervisor from the
  row's own data (name/branch/staff_type/sup_code) if no match exists, instead of silently
  skipping the link. This was added because the dedicated `Supervisors` tab being stale/empty used
  to mean supervisor links could never recover even though the other two tabs had everything
  needed to reconstruct them.

## Known accepted gaps (as of 2026-06-25, v1.9.39 — NOT fixed, user said hold off)

- **`auth:permanentlyDeleteUser`** — real hard-delete button, admin-only. No tombstone. A deleted
  account can keep working on a device that doesn't re-pull users table changes via deletion logic
  (pull only adds/updates, same root cause as above). This is the only remaining real
  delete-asymmetry gap in the whole app — every other table either has a tombstone now, or has no
  delete button at all (verified by grepping every `permanentlyDelete`/hard-delete handler in
  electron/ — only two exist: roster (fixed) and users (not fixed)).
- **`targets` table** (Sales Target Upload feature) — real production data, never pushed/pulled at
  all. Same wipe-on-reinstall risk Upload History had before it got fixed.
- **`user_permissions`** (per-user menu overrides) — local-only, never synced.
- Intentionally local-only (not gaps, deliberate): `sessions` (security), `email_config` (has SMTP
  password), `sync_logs` (diagnostic only), most of `app_settings` (device-local prefs).

## Things that turned out NOT to be gaps (don't re-flag these)

- KPI Rates, Qty Tiers, Commission Config, Monthly Branch Targets — **no delete button exists in
  the UI for any of these.** Checked KpiSettings screen directly: the only delete-looking icon is
  for removing a tier row while editing a tier list before Save — that's part of Edit, not a
  standalone delete. Can't have a delete-sync bug for an action that doesn't exist.
- Branches — fixed set of 4, no add/delete UI, edit-only.

## Versioning rule

Bump the patch version in `package.json` and mention the version in the commit message on every
app change, however small. (Standing instruction — not just for this session.)

## Decision log (chronological, this debugging session)

- v1.9.31 — `forceSyncAll` guard: refuse to clear Entries tab if local count < remote count.
- v1.9.32 → v1.9.34 — Chased FK-order bugs in `bootstrapConnect`'s wipe one table at a time, then
  replaced the whole approach with `foreign_keys = OFF` wrapping the wipe transaction.
- v1.9.35 — Added cloud sync for `upload_logs` (Upload History screen) — was local-only, wiped on
  every reinstall/reconnect.
- v1.9.36 — `entry_deletions` tombstone: Entries deletes now propagate cross-device.
- v1.9.37 — `roster_deletions` tombstone: Roster permanent-delete now propagates cross-device.
- v1.9.38 — Delete actions now await their push and surface `cloudSynced`/`cloudSyncError`;
  `entry:getUnsyncedCount` now includes `entry_deletions`.
- v1.9.39 — Supervisor auto-create on pull (Roster + SupervisorRoster tabs), fixing a case where
  Sup Roster could go permanently empty after a reconnect even though the Sheet had full history.

## If something looks broken in this area again

1. Is it an add/edit, or a delete? Add/edit bugs are almost always "did the push actually fire and
   succeed" (check `sync_logs` table, check for a swallowed `.catch(() => {})`). Delete bugs are
   almost always "is there a tombstone for this table, and is pull actually checking it."
2. Check whether the affected table is append-only or full-rewrite (see lists above) — that
   determines whether "last row wins" ordering or "writeTab guard" reasoning applies.
3. Check `db.pragma('foreign_keys')` state and the wipe-list in `bootstrapConnect` if it's an
   FK error during reconnect/switch-database.
