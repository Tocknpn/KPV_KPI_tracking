# SalesTrack Pro — Subagent Team

This project has five specialist subagents, each owning a distinct part of the codebase, plus a Tester that verifies their work. They're real, invocable Claude Code agents — defined in this same folder (`.claude/agents/`), one file per agent, each with its own frontmatter (`name`, `description`, `tools`, `model`). This file is just the index/overview; it carries no frontmatter itself and is not an agent.

## The team

| Agent | Owns | Key files |
|---|---|---|
| **`sync-roster-specialist`** | Google Sheets push/pull, XLSX uploads/templates, roster CRUD, roster history/carry-forward | `electron/ipc/sheets.ts`, `upload.ts`, `roster.ts`, `electron/db/history.ts` |
| **`kpi-report-specialist`** | KPI scoring, all reports, sales trends, commission, fiscal-month date math | `electron/ipc/kpi.ts`, `reports.ts`, `sales.ts`, `commission.ts`, `electron/db/fiscalMonth.ts` |
| **`schema-specialist`** | SQLite schema/migrations, DB init, seed data | `electron/db/schema.ts`, `connection.ts`, `seed.ts` |
| **`ui-builder`** | React screens/components, i18n | `src/screens/*`, `src/components/ui/*`, `src/i18n/translations.ts`, `src/utils/dates.ts` |
| **`tester`** | Verification — builds, type-checks, direct-DB cross-checks, manual walkthroughs | Read-only; no domain files of its own |

## Why this split

The five domains map onto real architectural seams in this codebase, not an arbitrary division:

- **Sync/roster** is its own domain because it's genuinely the highest-risk area — multiple unsynced devices sharing one Google Sheet with no server to arbitrate conflicts, tombstones instead of deletes, and a subtle exact-month-vs-carry-forward distinction that's easy to get backwards. It has its own `SKILL.md` at the repo root for exactly this reason.
- **KPI/reporting** is separated from sync/roster because it's a different kind of risk: not data-loss risk, but silent-wrong-number risk (a rep's score, a manager's commission). It's also where the fiscal-month system (26th–25th cycle) lives, which touches nearly every date-bounded calculation in the app.
- **Schema** is separated because a migration mistake is the hardest thing in this app to walk back — it ships to every device's local database, permanently, the moment they upgrade.
- **UI** is separated because it's a fundamentally different skill (React/Tailwind conventions) from the other three, which are all backend/SQL domains.
- **Tester** is cross-cutting on purpose — it doesn't belong to any one domain because its job is to catch the gap between "the code looks right" and "the app actually does the right thing," which requires stepping outside whichever domain just made the change.

## How they work together

1. **Route by file, not by feature name.** A task usually touches one primary domain — check the table above against the files a task will actually change, not the feature's marketing name. A "Yearly KPI" feature, for instance, is `kpi-report-specialist`'s work even though it also needs a new UI tab (`ui-builder`'s slice of the same task).
2. **Specialists flag cross-domain dependencies instead of guessing.** If `sync-roster-specialist` changes what a roster snapshot looks like, it says so to `kpi-report-specialist` rather than assuming the scoring side is unaffected — and vice versa. None of them silently reach into another domain's files.
3. **New tables/columns always go through `schema-specialist` first.** Even if the need originates in another domain (a new report needs a new target-override table, a new sync field needs a new column), the migration itself is written by `schema-specialist`, who reports back the exact shape landed on.
4. **`tester` is the last stop, always.** No task is done when the code compiles — it's done when `tester` has confirmed it against the build, the live database, or an actual walkthrough. `tester` never fixes what it finds; it reports back to whichever specialist owns the affected file so the fix stays in the right hands.
5. **The coordinating session (you, in the main conversation) is the router.** It decides which specialist(s) a task needs, in what order, and whether they need to run sequentially (schema before KPI, KPI before UI) or can run in parallel (independent, non-overlapping files).
