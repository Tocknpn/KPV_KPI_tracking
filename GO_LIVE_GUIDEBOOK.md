# SalesTrack Pro — Go-Live Guidebook

> Read this before go-live. Covers what each of the 8 roles should do, day to day, after installation is done.
> For install steps: `INSTALLATION.md`. For architecture/technical reference: `README.md`. For diagrams: `FLOWCHART.md`.

---

## Before You Read Further — The Shape of the System

- Every login pulls the latest data from Google Sheets first (a short "Connecting…" screen) — so don't worry about a device being "out of date," it self-corrects on every login.
- Sales data (Daily Entry) is **upload-only** — no manual typing screen anymore. An Accountant Officer uploads an XLSX file.
- Sales uploads are **approval-gated** — if a file tries to re-submit a date that's already recorded, it gets rejected until an Accountant Manager clears it. This protects KPI/commission numbers from silent overwrites.
- Roster (who works where) is **month-aware** — editing this month never changes how last month's report reads, and a month nobody touched just carries forward automatically.

---

## Role 1 — Admin

**Has:** Dashboard, KPI Report, Sale Report, Analytics*, Upload History, Audit Log, User Management, Settings.
**Does NOT have:** Daily Entry (Sales Upload), KPI Settings, Roster — those are deliberately someone else's job.

*(Analytics menu was removed app-wide — ignore any mention of it elsewhere.)*

### Daily / as-needed routine
1. Log in — check nothing looks broken (sync status, dashboard loads).
2. **Settings → Users tab**: create/deactivate accounts as staff join/leave; assign roles + branches; reset a forgotten password by typing a new one in their edit form (or — since passwords are stored in plaintext on the Users Sheet by deliberate choice — look it up there directly). Each save auto-pushes to the Sheet immediately.
3. **Audit Log**: spot-check periodically for unexpected `sales_upload_deleted` events, failed logins, or permission changes.
4. **Settings → Connection Settings tab**: keep the Google Sheets connection healthy — Push/Pull manually if the "X unsynced" badge isn't clearing on its own. To connect or switch which Sheet this device points at, use the password-gated panel on the Login screen instead (see `INSTALLATION.md`).

### What Admin should NOT try to do
Upload daily sales, change KPI rates/tiers, or touch the roster — those need an Accountant Officer/HR/HR Support account, by design.

---

## Role 2 — Sales Supervisor (`sales_sup`)

**Has:** Dashboard, KPI Report, Sale Report, Upload Status — scoped to **their own team only** (linked via `supervisor_id`).

### Daily routine
1. Log in — see only your team's numbers.
2. **Dashboard**: check today's/MTD KPI % for your team — jewelry/bar/qty contribution, top performers.
3. **KPI Report / Sale Report**: see each team member's progress vs. their monthly target, and the **Est. Month End** projection — sort to find who needs a push.
4. **Upload Status**: confirm the Accountant Officer has actually uploaded today's data for your branch (a 7-day grid, easy to spot a missed day).

### What to do if something looks wrong
You don't upload data yourself — if a number looks off, it's an Accountant Officer/Manager problem. Flag it to them, don't try to fix it in the app.

---

## Role 3 — Accountant Officer

**Has:** Daily Entry (XLSX upload only), Sale Report, Upload History, Upload Status — **own branch only**.

### Daily routine
1. Collect the day's sales data from the branch floor (however your branch currently does this — paper, messaging app, register export).
2. Fill the Daily XLSX template (download it fresh from Daily Entry if rep list changed).
3. Daily Entry → drop the file → **Import Daily Data**.
4. Check the result summary:
   - **All green ("imported and published")** → done.
   - **Some rows rejected** → read the reason. If it says *"existing record for this rep/date"*, **that's not something you can fix yourself** — message your branch's Accountant Manager and ask them to clear that upload batch, then re-upload.
5. If you genuinely made a typo (wrong weight, wrong rep code) on a row that hasn't conflicted yet — fix it in the error modal and resubmit directly.

### Hard rule
You can only upload for your own branch. If a file has rep codes from another branch, expect it to behave oddly — always re-download a fresh template scoped to your branch before uploading.

---

## Role 4 — Accountant Manager

**Has:** Sale Report (all branches), Upload History (incl. the approval panel), Upload Status, Audit Log.

### Daily / as-needed routine
1. Upload History → **"Sales Upload Records — Approval"** panel — this is your main job screen.
2. Review batches across all branches: who uploaded, when, how many records.
3. When an Accountant Officer tells you a re-upload is needed (a typo, a wrong file, etc.):
   - Find their batch in the panel.
   - **Delete & Allow Resubmit** — this clears exactly that batch's rows (nothing else) and re-opens those rep/dates for the officer to re-upload.
   - This is logged to Audit Log automatically (`sales_upload_deleted`) — that's the "on watch" requirement satisfied; you don't need to manually record anything elsewhere.
4. **Sale Report**: monitor all-branch sales trends, weekday heatmap, period comparisons.

### Important
Deleting a batch is irreversible inside the app (it's gone from local + will be gone from the Sheet on next sync) — confirm with the Accountant Officer *before* deleting, not after.

---

## Role 5 — Branch Manager

**Has:** Dashboard, KPI Report, Sale Report, Upload Status — **own branch, all teams within it**.

### Daily routine
1. Dashboard: your branch's overall KPI% and top performers across *all* your teams (not just one supervisor's).
2. KPI Report / Sale Report: compare teams within your branch against each other.
3. Upload Status: confirm your branch's Accountant Officer is keeping daily uploads current.

---

## Role 6 — HR

**Has:** Dashboard, KPI Report, Sale Report, Upload History, Upload Status, Roster, KPI Settings, Audit Log, Settings — **all branches**. **Does NOT have** User Management or Sales Upload.

### Monthly / as-needed routine
1. **Roster**: the org-chart job — add new hires, deactivate departures, move reps between branches/supervisors/staff-type, all month-aware (pick the month at the top before editing, if backdating/future-dating a change).
2. **KPI Settings**: set/adjust Jewelry & Bar rates per branch, Qty tier thresholds, branch point targets, commission rates, the KPI formula constants, supervisor score weight — all month-scoped so a change today never rewrites a past month's score.
3. **Sale Report / KPI Report**: company-wide oversight, same data Top Manager sees, but HR can also act on it (adjust targets/rates if something's structurally wrong).

### Hard rule
HR doesn't touch Daily Entry / Sales Upload — that stays with Accountant Officer even if HR notices a gap.

---

## Role 7 — HR Support

**Has:** Roster (**upload only**, not full add/edit/deactivate CRUD), Upload Status.

### Routine
1. When HR hands you a batch of roster changes (new hires, bulk transfers) as an XLSX file: Roster screen → **Upload Roster** → drop file.
2. `Effective_Date` column on that file decides which month the change counts from — get this right, it's the only thing controlling it.
3. You cannot add/edit/deactivate individual reps inline — that's HR/Admin only. If you need a one-off single change, ask HR.

*(Commission Payment tracking for this role is not yet built — flag to your admin/dev if you need it before go-live.)*

---

## Role 8 — Top Manager

**Has:** Dashboard, KPI Report, Sale Report, Upload History, Roster, KPI Settings, Audit Log, Settings — **all branches, view-only**. **Does NOT have** User Management.

> **Known gap at the moment:** the Roster menu item shows for Top Manager but the screen currently blocks them (admin/hr only, even for viewing) — this is a known bug, not yet fixed. Everything else view-only works as expected.

### Routine
Log in periodically (daily/weekly, your call) → Dashboard/Sale Report/KPI Report for a company-wide read. No data entry, no corrections — if something looks wrong, it's HR's (rates/roster) or Accountant Manager's (sales data) job to fix, not yours.

---

## Quick Reference — Who Fixes What

| Problem | Who fixes it |
|---|---|
| Wrong sales number for today | Accountant Officer re-uploads (if no conflict) or asks Accountant Manager to clear the batch first |
| Rep missing from roster / wrong branch | HR (or HR Support if it's a bulk file HR already prepared) |
| KPI % looks wrong for a whole branch | Check KPI Settings (HR) — rate/tier/target might be misconfigured for that month |
| Forgot password | Admin resets it, or look it up on the Users Sheet tab directly |
| Can't see a menu you think you should have | Admin → Settings → Users tab → that user's permission overrides |
| Sheet shows old/garbage data after an app update | Ask the dev to push a one-off fix — no bulk "push everything" button exists anymore (removed as a go-live risk) |

---

*SalesTrack Pro v1.7.41 — KPV Gold & Jewelry Sales Performance System*
