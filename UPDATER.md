# Auto-Update Setup — electron-updater + GitHub Releases

Goal: build new version → publish → every installed device gets an in-app "Update available" prompt, click → updates, no manual installer resend.

## Phase 1 — Wiring (code) — DONE 2026-06-19
- [x] `npm install electron-updater`
- [x] Add `publish` block — added to `electron-builder.yml` (not package.json — config lives there) with placeholder `owner: YOUR_GITHUB_USERNAME, repo: salestrack-pro`. **Must edit before Phase 3.**
- [x] Update-check logic in `electron/main.ts` — checks on launch (skipped in dev), `autoDownload: false`, forwards `update-available`/`update-downloaded` to renderer, two new IPC handlers (`updater:download`, `updater:install`)
- [x] In-app banner — `src/App.tsx`, shows "Update available" → click Update → downloads → "Restart & Update" → installs
- Wiring: `electron/preload.ts` (`onUpdateAvailable`, `onUpdateDownloaded`, `downloadUpdate`, `installUpdate`) + `src/global.d.ts` types

## Phase 2 — GitHub setup (your side, not code) — DONE 2026-06-20
- [x] Repo already existed: `Tocknpn/KPV_KPI_tracking` — wired into `electron-builder.yml`
- [x] PAT generated (regenerated after first one got exposed in a screenshot — old one revoked)
- [x] `GH_TOKEN` set as User env var on build machine

## Phase 3 — First real publish
- [ ] Bump version, run `npm run dist:win -- --publish always`
- [ ] Confirm release + `latest.yml` appear on GitHub

## Phase 4 — End-to-end test
- [ ] Install current version on a spare/test device
- [ ] Bump version, build+publish v2
- [ ] Open v1 app, confirm update prompt shows, update, confirm v2 installs + local DB untouched

## Phase 5 — Rollout
- [ ] Becomes normal release flow going forward — every future version is just Phase 3's one command

---
## Status log
- 2026-06-19: Plan created. Phase 1 done — code wired, untested (needs real GitHub repo to test against).
- 2026-06-20: Phase 2 done — repo (Tocknpn/KPV_KPI_tracking) + token wired in. Next: Phase 3 (first publish).
