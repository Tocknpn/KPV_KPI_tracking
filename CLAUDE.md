# SalesTrack Pro — Project Instructions

Gold/jewelry sales KPI tracker: Electron + React + better-sqlite3 main app (`electron/`, `src/`), plus a separate Next.js web portal (`web/`, not yet in active development — skip unless explicitly asked).

## Standing instruction: route through the subagent team before editing

This project has five specialist subagents plus a tester, defined in `.claude/agents/*.md`. **Read `.claude/agents/Agents.md` first** for the full routing table and collaboration model.

**Before making a code change**, check which domain the touched files fall into and delegate to that subagent — do not edit these files directly in the main session:

| Files | Subagent |
|---|---|
| `electron/ipc/sheets.ts`, `upload.ts`, `roster.ts`, `electron/db/history.ts` | `sync-roster-specialist` |
| `electron/ipc/kpi.ts`, `reports.ts`, `sales.ts`, `commission.ts`, `electron/db/fiscalMonth.ts` | `kpi-report-specialist` |
| `electron/db/schema.ts`, `connection.ts`, `seed.ts` | `schema-specialist` |
| `src/screens/*`, `src/components/ui/*`, `src/i18n/translations.ts`, `src/utils/dates.ts` | `ui-builder` |

This overrides the general default of only spawning subagents when explicitly asked — for this project, delegating by domain is the expected default, not an opt-in.

A task spanning multiple domains gets split across the relevant specialists (parallel if independent, sequential if one depends on another's output — e.g. schema before the report logic that reads the new column). Small, purely exploratory reads (grepping to understand something before deciding how to route) don't need a subagent — the delegation rule is about who makes the actual edit.

**After a specialist's change, hand off to `tester`** before reporting the task done. No change is complete on a clean type-check alone — this codebase has no automated test suite, so `tester`'s direct-database and build verification is the only real confirmation step.

## Key domain facts (also in the relevant specialist's own file — see there for detail)

- **Fiscal month, not calendar month**: a "month" runs the 26th of the prior calendar month through the 25th of the current one. Always use `fiscalRangeForLabel`/`fiscalMonthOf` (`electron/db/fiscalMonth.ts` / `src/utils/dates.ts`), never hand-rolled date math.
- **No automated test suite** — verification is manual (build + direct SQLite queries + app walkthroughs), owned by `tester`.
- Read `SKILL.md` at the repo root before any sync/roster work — it's the project's own decision log for that domain's gotchas (tombstones, carry-forward vs. exact-month resolution).
