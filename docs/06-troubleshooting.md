# 6. Troubleshooting — Common Human-Error Cases

| Symptom | Likely cause | Fix |
|---|---|---|
| "Rep code belongs to a different branch" on upload | Accountant Officer's file has a rep from another branch | Remove that row from the file, re-upload. Only an Accountant Manager can upload across branches. |
| "Existing record for this rep/date" on upload | This rep/date was already uploaded once | Ask an Accountant Manager to delete that upload batch (Upload History), then re-upload your corrected file. |
| Numbers look wrong / using old rates | HR hasn't confirmed this month's KPI Settings yet | Check the warning banner on Dashboard/KPI Report — go to KPI Settings, select the month, click Use Defaults + Save All. |
| Supervisor's name/branch missing on a rep | The supervisor named in the roster file doesn't exist yet | Should auto-create now from the roster upload itself — if it's still missing, check the `Sup_Code`/`Team_Sup_Name` spelling matches exactly. |
| Roster upload says "Missing Effective_Date" | That column was left blank in the file | Every row needs a real date (`YYYY-MM-DD`) — it decides which month the row counts for. |
| Can't find a menu you used to have | Permissions changed, or your role's defaults changed | Ask Admin to check Settings → Users → your account's key icon for menu overrides. |
| "Cannot permanently delete" a user | That user has upload history on record | Use Deactivate instead — permanent delete is blocked specifically to protect upload history from disappearing. |
| Switched Google Sheet and now everything's gone | Expected — switching wipes local data before pulling the new Sheet's data | If this was a mistake, reconnect to the original Sheet ID to pull that data back (assuming nothing important was created locally since the switch). |
| Two devices show different numbers | One of them hasn't logged in (pulled) recently | Log out and back in on the stale device — login always pulls fresh data first. |
| Upload template is missing some reps | Template reflects the roster *as of the current month* | If a rep was deactivated or transferred out, they won't appear — check the Roster screen for that month to confirm who should be there. |
| Accidentally deleted an upload batch | Acc Manager action, irreversible | The entries are gone — re-upload the correct file again from scratch. |
| Branch target shows 0 for one type (B2C or B2B) | Admin never filled in that side after a data wipe/reset | Go to KPI Settings (Admin) → Branch Point Target Defaults → fill in both B2C and B2B for that branch. |
| "Save failed" with no other detail | Session expired, or a backend validation error | Log out and back in, then retry. If it persists, note the exact error text and escalate — it now shows the real reason instead of failing silently. |

## General rule of thumb

If a number looks wrong, check in this order: **1) is this month's Roster uploaded? 2) is
this month's KPI Settings confirmed? 3) is the Daily Entry actually uploaded for those
dates?** — 90% of "wrong number" cases trace back to one of these three being incomplete for
the month in question, not a bug.
