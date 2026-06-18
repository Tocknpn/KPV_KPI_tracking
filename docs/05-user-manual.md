# 5. User Manual

## Logging in

Enter username + password, click Sign In. The app pulls the latest data from Google Sheets
automatically before letting you in — if there's no internet, it still lets you in using
whatever was last saved on this device, with a small notice.

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

## Roster (HR / HR Support / Top Manager)

- **Add Rep** — manually add one rep.
- **Upload Roster** — bulk upload a `.xlsx` with many reps at once. Every row needs an
  `Effective_Date` — that's what decides which month the row counts for, there's no separate
  month picker.
- **Template** button gives you a blank/pre-filled file in the exact format the upload
  expects, including the optional `Sup_Code` column (safer than matching by name).
- Switching the month dropdown at the top shows the roster *as it was* that month, not just
  today's.

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
