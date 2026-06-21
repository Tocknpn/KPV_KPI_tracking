# 5. User Manual

## Logging in

Enter username + password, click Sign In. The app pulls the latest data from Google Sheets
automatically before letting you in — if there's no internet, it still lets you in using
whatever was last saved on this device, with a small notice.

After signing in, you land on the first menu item your own role actually has — not always
Dashboard. For example, Accountant Officer lands on Daily Entry, Accountant Manager lands on
Sale Report, and HR Support lands on Roster, since none of those roles have a Dashboard menu
item.

A small status indicator next to the "Updated Xm ago" timestamp (top-right of every screen)
warns you if Google Sheets sync isn't set up on this device, or if the most recent automatic
sync attempt failed — this shows for every role, even ones without access to Settings.

### Switching/connecting to a different Google Sheet (Test vs Production)

Small icon, top-right corner of the Login screen, **always visible**. Click it, enter the
password (`KPV@KPV2026` — a misclick guard, not a real secret, write it down somewhere the
admin team can find it), then paste the Sheet ID and the service account `.json` file path.
**Warning: this wipes everything on this device first**, then pulls fresh from whichever
Sheet you just connected to. Don't do this casually on a live device.

## Dashboard

Your personal/team KPI snapshot for the current month. Shows the estimated month-end
projection based on how much of the month has passed so far.

## Daily Entry Upload (Accountant Officer / Accountant Manager)

1. Click **Template** — downloads a pre-filled `.xlsx` with this month's reps (your branch
   only, unless you're an Accountant Manager — then it's every branch).
2. Fill in the **Date**, **Jewelry (Baht)**, **Bar (Baht)**, **Qty** columns. Leave everything
   else as-is.
3. Click **Upload Roster** — wait, this screen is Upload Daily Entry, click **Upload**.
4. If a row errors (wrong branch, duplicate date), it's listed — fix and re-upload just
   those rows.

### Fixing a bad upload (Accountant Manager / Admin) — Upload History

In Upload History's "Sales Upload Records — Approval" panel, you have two ways to fix a
mistake:
- **Delete & Allow Resubmit** (per batch) — deletes every entry from that one uploaded file,
  letting the Officer re-upload corrected data for those exact rep/date slots.
- **Delete by Branch + Date** — for when only one day inside a larger file is wrong. Pick the
  branch and an exact date (or a date range), see a live preview count of matching entries,
  confirm, and only those daily entries are deleted — regardless of which file originally
  uploaded them.

## Roster (HR / HR Support / Top Manager)

Two tabs: **Reps** and **Sup**.

### Reps tab

- **Add Rep** — manually add one rep.
- **Upload Roster** — bulk upload a `.xlsx` with many reps at once. Every row needs an
  `Effective_Date` — that's what decides which month the row counts for, there's no separate
  month picker.
- **Template** button gives you a blank/pre-filled file in the exact format the upload
  expects, including the optional `Sup_Code` column (safer than matching by name).
- A **Target** column shows each rep's monthly KPI point target — their individual override
  if one's been set, otherwise the branch+staff-type default.
- Inactive reps are hidden by default (footer shows how many are hidden). Check **"Show
  Inactive"** in the filter bar to reveal them — only then do **Reactivate** and a permanent
  **Delete** button (trash icon) appear next to each one. Delete is blocked if that rep has
  any uploaded daily entries on record — deactivate instead in that case.
- Switching the month dropdown at the top shows the roster *exactly as uploaded/edited for
  that month* — if nothing was ever uploaded for the selected month, the table shows empty
  with "No roster uploaded for {Month} {Year}" instead of quietly showing an older month's
  data. You must explicitly touch every month, even if it's unchanged from the month before.
  (This only affects what this screen displays — KPI Report and other calculations still use
  the nearest earlier month automatically.)

### Sup tab

Read-only list of supervisors for the selected month — Sup Code, Name, Branch, Type, live Rep
headcount, Target, and Status. Use this to confirm both reps and supervisors are accounted for
without leaving the Roster screen.

## KPI Settings (Admin sees Defaults / HR sees Monthly — different views, same screen)

- **Admin**: sets the *standing* values — Jewelry/Bar rates, Qty Tiers, Branch Targets,
  Commission rates — that any month without its own override falls back to. No month picker;
  Defaults apply forever until changed again.
- **HR**: picks a month, clicks **Use Defaults** to pull Admin's standing values in as a
  starting point, adjusts anything that's different this month, clicks **Save All**. This
  also marks the month "Confirmed."
- The banner at the top tells you if the month you're viewing has been confirmed yet.

## User Management (Settings → Users tab, Admin only)

- **Add User** — create an account, assign role/branch/team.
- **Key icon** — override which menus this specific user can see, beyond their role's default.
- **Deactivate** (person-off icon) — disables login, keeps the account and its history.
- **Restore** — re-enables a deactivated account.
- **Delete forever** (trash icon) — permanently removes the account. Blocked if that user
  has any upload history on record (use Deactivate instead in that case).

## Reports (KPI Report / Sale Report / Commission)

Pick a month and (if you're allowed to see more than one branch) a branch filter. Switch
between B2C / B2B / All using the chips near the top. Export button gives you Excel or a PDF
snapshot of whatever table is currently on screen.

Clicking a rep or supervisor row opens a profile modal with a trend chart — one bar for Total
Weight (Jewelry + Bar combined, in grams) and one line for Quantity. This is the same chart
style no matter which time view you're on (Month / Week / Day for reps; Month-only for
supervisors).

## App Updates

When a newer version has been published, a blue banner appears at the top of the app:
"Update available — vX.Y.Z" with an **Update** button. Click it to download in the
background — nothing downloads automatically without that click. Once downloaded, the banner
changes to **"Restart & Update"** — click it to close and reopen the app on the new version.
Ignoring the banner is fine; you'll keep using the current version until you click through.
