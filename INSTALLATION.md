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
3. On the **Login screen**, click **"First time on this device? Connect to Google Sheets"**:
   - Paste the Google Sheet ID (same ID on every device — this is what makes them all share data).
   - Browse to / paste the path of the service account `.json` key file on **this machine** — copy the key file onto each device too, it must exist locally; don't point at a network path that might not always be reachable.
   - Click **Test Connection & Sync** — this verifies the connection AND pulls every real account/branch/roster/entry down into this device's local database in one step, before anyone logs in.
   - This link only appears on a device that's never been connected before — once set, it's gone, and changing the connection afterward needs an authenticated admin via Settings (by design, so a stranger can't repoint an already-live device at a different spreadsheet).
4. Log in with a real account now synced from the Sheet. (If the Sheet has no real users yet — i.e. this is the very first device, ever — log in with the seeded default `admin`/`admin1234` instead, then create real accounts via User Management and Force Full Sync them out to everyone else.)

Repeat for all 30 devices. **The Sheet ID and the JSON key must be identical across every device** — that's the entire mechanism that keeps them all in sync.

---

## 3. Creating Real User Accounts

Two ways:

- **Centrally, once:** log in as admin on one device → User Management → create every real user (their role, branch, supervisor link) → Force Full Sync (push) → on every other device, log in (which now auto-pulls from Sheets on login) and the new accounts appear.
- **Per-branch:** create just that branch's local users on that device, then Force Full Sync to publish them to everyone else.

Either way, **passwords are stored in plaintext on the `Users` Sheet tab** (a deliberate choice made for this app — see `README.md` §17) — restrict who can open that Sheet.

---

## 4. Clearing Sample/Test Data Before Go-Live

**Do this once, on one device, right before go-live — not on all 30 devices.** After the wipe + a push, every other device picks up the clean state on next login.

What gets wiped: all daily entries, targets, commission configs, roster history, upload logs, audit logs, sessions, and every non-admin user — i.e. everything that's "sample data" or stale demo accounts. What's kept: the 4 real branches, KPI rates/tiers (your real scoring rules), and the `admin` account.

This is a destructive, irreversible action on whichever device you run it on. **Tell me when you're ready for go-live and I'll run it with you watching, then we Force Full Sync once to push the clean state to the Sheet** so every other device inherits it on next login.

After that: Accountant Officers start uploading real June daily sales via XLSX, HR sets up the real roster, and the app is live.

---

## 5. Quick Verification Checklist (per device, after setup)

```
□ App opens, shows "Connecting to Google Sheets…" then loads (confirms Sheets reachable)
□ Logged in as the right role for this device/branch
□ Dashboard shows the expected branch's data (not someone else's, not stale sample data)
□ Settings → Sheets section shows the correct Sheet ID
□ Force Full Sync runs without error
```

---

## 6. Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Stuck on "Starting up…" forever | First-run WASM load blocked by antivirus, or a corrupted DB file | Wait up to 45s (there's a built-in timeout that shows an error if it's truly stuck) — if it errors, check `startup-error.log` in the app's data folder |
| "Could not sync — using last saved data" at login | No internet, or Sheets not configured yet on this device | Check Settings → Sheets config; app still lets you in with whatever was last saved locally |
| New user created on Device A doesn't show on Device B | Device A pushed but Device B hasn't pulled yet | Device B: log out and back in (auto-pulls on login), or Settings → Pull from Cloud |
| Roster/Sheet shows old garbage rows after an app update | Local DB had stale-format rows from before a fix | Force Full Sync — it clears and rewrites every tab from the local DB's current (now-correct) state |

---

*See also: `README.md` (architecture + full feature reference), `GOOGLE_SHEETS_SETUP.md` (cloud setup), `GO_LIVE_GUIDEBOOK.md` (per-role daily workflow).*
