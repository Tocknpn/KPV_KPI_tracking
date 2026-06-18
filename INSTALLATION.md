# SalesTrack Pro — Installation Guide (30+ Devices)

> For the person setting up the go-live rollout. Read this fully before installing on the first device.

---

## 1. One-Time Prep (do this once, before touching any device)

1. **Build the installer** on the dev machine:
   ```bash
   npm run dist:win
   ```
   Output: `dist/SalesTrack Pro Setup x.y.z.exe`

2. **Confirm Google Sheets is set up** — if not done yet, follow `GOOGLE_SHEETS_SETUP.md` first. You need, before installing anywhere:
   - The Google Sheet ID
   - The service account `.json` key file
   - The Sheet shared with the service account email (Editor role)

3. **Decide the real start date** (e.g. "June 1") and plan the data wipe (§4 below) for the night before go-live — not before, not after.

4. Copy these 2 things somewhere you can reach from every device during install:
   - `SalesTrack Pro Setup x.y.z.exe`
   - The service account `.json` key file

---

## 2. Per-Device Install Steps (repeat for each of the ~30 machines)

1. Copy `SalesTrack Pro Setup x.y.z.exe` onto the machine (USB drive, shared network folder, or however you move files there) and run it.
2. Launch SalesTrack Pro.
3. On the **Login screen**, click the small connect icon (top-right corner). It's always there, on every device, every time — not just the first run.
   - It first asks for a password: **`KPV@KPV2026`**. This isn't a real security boundary (anyone with the .exe could find it in the source) — it's a deliberate speed bump so an accidental click can't immediately open the door to wiping/switching a device's database. Write it down somewhere the admin team can find it; if lost, it's also recorded here.
   - After unlocking: paste the Google Sheet ID (same ID on every device — this is what makes them all share data) and the path of the service account `.json` key file on **this machine** — copy the key file onto each device too, it must exist locally; don't point at a network path that might not always be reachable.
   - Click **Test Connection & Sync** (or **Switch Database & Sync** if this device was already connected to something else) — this verifies the connection AND pulls every real account/branch/roster/entry down into this device's local database, before anyone logs in. If the device was already connected to a *different* Sheet, this first **wipes all local data** (entries, roster, configs, non-admin users) before pulling — anything not yet synced is lost, so don't use this casually on a live device.
4. Log in with a real account now synced from the Sheet. (If the Sheet has no real users yet — i.e. this is the very first device, ever — log in with the seeded default `admin`/`admin1234` instead, then create real accounts via Settings → Users tab and let normal auto-sync push them out to everyone else.)

Repeat for all 30 devices. **The Sheet ID and the JSON key must be identical across every device** — that's the entire mechanism that keeps them all in sync.

---

## 3. Creating Real User Accounts

Two ways:

- **Centrally, once:** log in as admin on one device → Settings → Users tab → create every real user (their role, branch, supervisor link). Each save auto-pushes to the Sheet immediately — on every other device, log in (which auto-pulls from Sheets on login) and the new accounts appear.
- **Per-branch:** create just that branch's local users on that device — same auto-push, no extra step needed.

Either way, **passwords are stored in plaintext on the `Users` Sheet tab** (a deliberate choice made for this app — see `README.md` §17) — restrict who can open that Sheet.

---

## 4. Clearing Sample/Test Data Before Go-Live

**Do this once, on one device, right before go-live — not on all 30 devices.** After the wipe + a push, every other device picks up the clean state on next login.

What gets wiped: all daily entries, targets, commission configs, roster history, upload logs, audit logs, sessions, every non-admin user, KPI rates/tiers, monthly branch targets, and HR's monthly confirmation history — i.e. everything that's "sample data" or stale demo setup. What's kept: the 4 real branches (their point targets reset to 0 until re-set) and the `admin` account. This is the same wipe that runs every time the database connection on the Login screen is changed (or reconnected) — not a separate one-off script.

This is a destructive, irreversible action on whichever device you run it on. **Tell me when you're ready for go-live and I'll run it with you watching** — the wipe script also pushes the cleared state straight to the Sheet as part of the same step (there's no "push everything" button in the app anymore — it was removed — it could push leftover test/seed data over the real Sheet with no guardrail), so every other device inherits the clean state on next login.

After that: Accountant Officers start uploading real June daily sales via XLSX, HR sets up the real roster, and the app is live.

---

## 5. Quick Verification Checklist (per device, after setup)

```
□ App opens, shows "Connecting to Google Sheets…" then loads (confirms Sheets reachable)
□ Logged in as the right role for this device/branch
□ Dashboard shows the expected branch's data (not someone else's, not stale sample data)
□ Settings → Connection Settings tab shows the correct Sheet ID
□ Push to Sheets / Pull from Sheets both run without error
```

---

## 6. Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Stuck on "Starting up…" forever | First-run WASM load blocked by antivirus, or a corrupted DB file | Wait up to 45s (there's a built-in timeout that shows an error if it's truly stuck) — if it errors, check `startup-error.log` in the app's data folder |
| "Could not sync — using last saved data" at login | No internet, or Sheets not configured yet on this device | Check Settings → Sheets config; app still lets you in with whatever was last saved locally |
| New user created on Device A doesn't show on Device B | Device A pushed but Device B hasn't pulled yet | Device B: log out and back in (auto-pulls on login), or Settings → Pull from Sheets |
| Roster/Sheet shows old garbage rows after an app update | Local DB had stale-format rows from before a fix | Ask the dev to push a one-off fix — there's no bulk "push everything" button in the app anymore (it could push leftover test/seed data over the real Sheet with no guardrail) |

---

*See also: `README.md` (architecture + full feature reference), `GOOGLE_SHEETS_SETUP.md` (cloud setup), `GO_LIVE_GUIDEBOOK.md` (per-role daily workflow).*
