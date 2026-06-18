# 3. Daily / Monthly Routine, By Role

## Accountant Officer — every working day

```mermaid
flowchart TD
    A[Open app, log in] --> B[Go to Daily Entry Upload]
    B --> C[Click Export Template]
    C --> D["Gets .xlsx pre-filled with this month's\nreps for their branch only — date + 3 KPI columns blank"]
    D --> E[Fill in Date, Jewelry, Bar, Qty for each rep]
    E --> F[Upload the file back]
    F --> G{Any rep from another branch in the file?}
    G -->|Yes| H[Blocked — fix the file, remove that rep, re-upload]
    G -->|No| I{Rep/date already has a record?}
    I -->|Yes| J[Blocked — ask Accountant Manager to clear that batch]
    I -->|No| K[Saved. Auto-pushes to Google Sheets]
```

## Accountant Manager — as needed (daily oversight + fixing mistakes)

1. Same upload flow as Officer, but the exported template includes **every branch's** reps
   in one file — can upload sales for any branch.
2. If an Officer made a mistake (wrong file, wrong numbers): go to Upload History, find their
   batch, **delete it**. This re-opens those exact rep/date rows for re-upload.
3. Periodically check Audit Log for unexpected `sales_upload_deleted` events.

## HR — once a month (start of the new month, before anyone uploads anything else)

```mermaid
flowchart TD
    A[New month starts] --> B[Open Roster screen]
    B --> C[Upload roster .xlsx — Effective_Date column drives which month each row counts for]
    C --> D[Open KPI Settings]
    D --> E[Pick the new month]
    E --> F[Click Use Defaults — pulls Admin's standing rates/tiers/targets/commission]
    F --> G{Anything different this month?}
    G -->|Yes| H[Edit just those fields]
    G -->|No| I[Leave as-is]
    H --> J[Click Save All]
    I --> J
    J --> K["Month marked Confirmed — warning banner clears\non Dashboard/KPI Report"]
```

**Important: HR must do this every month, even if nothing changed.** Skipping it leaves the
month "Not Confirmed" — numbers still calculate fine (using the last known values), but the
banner stays up until HR explicitly confirms that month.

## Admin — rarely (only when defaults genuinely need to change)

1. KPI Settings (Admin's view shows **Defaults**, not a month) → adjust the standing
   Jewelry/Bar rates, Qty tiers, Branch targets, or Commission rates that every new month
   will inherit unless HR overrides that month specifically.
2. Settings → Users → create/deactivate accounts, fix permissions, or permanently delete a
   user (only allowed if that user has no upload history on record).
3. Settings → Connection Settings → only touched when actually switching which Google Sheet
   this device points at (Test vs Production) — this is destructive (wipes local data first),
   gated behind the password prompt.

## Everyone else (Supervisor, Branch Manager, Top Manager) — whenever they want

Just open Dashboard / KPI Report / Sale Report. No data entry responsibility — read-only.
