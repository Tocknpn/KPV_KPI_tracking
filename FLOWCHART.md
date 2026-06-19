# KPV Sales Performance — System Flowcharts

> Version: **v1.7.88** — schema v20. Update this header + diagrams whenever app changes screens, roles, or data flow.

Paste each diagram block into [mermaid.live](https://mermaid.live) to render.

---

## Diagram 1 — Login & Startup Flow

```mermaid
flowchart TD
    START([App Launch]) --> INIT["Main process: load SQLite WASM,\nrun schema migrations (45s timeout)"]
    INIT -->|error| ERRSCREEN["Startup error screen\n+ startup-error.log"]
    INIT -->|ready| LOGIN["/login screen"]
    LOGIN --> AUTH{"Credentials valid?"}
    AUTH -->|No| LOGIN
    AUTH -->|Yes| SYNC["Loading screen:\n'Connecting to Google Sheets…'\npulls latest data from cloud"]
    SYNC -->|success| UPTODATE["'Up to date.'"]
    SYNC -->|fail / offline / not configured| STALE["'Could not sync — using last saved data.'\n(does not block login)\nTopBar shows a persistent\n'Sheets not connected' / 'Sync failed' pill"]
    UPTODATE --> HOME["Routed to the FIRST menu item\nthis user's role actually has\n(not always Dashboard)"]
    STALE --> HOME
    HOME --> APP["App — role-scoped screen\ne.g. Accountant Officer -> Daily Entry,\nAccountant Manager -> Sale Report,\nHR Support -> Roster"]
```

Every login pulls fresh data first — a device that's been offline, or where someone else made a change on another device, never shows stale numbers without at least trying to catch up. The post-login landing screen is no longer hardcoded to Dashboard — roles without a Dashboard menu item (Accountant Officer, Accountant Manager, HR Support) used to silently land there anyway even though it wasn't in their sidebar; now they land on the first screen their own menu actually shows. The sync status pill (next to "Updated Xm ago", top-right of every screen) is visible to every role, so a device with no Settings access still gets a visible signal if sync isn't configured or last failed.

---

## Diagram 2 — User Roles & Screen Access

```mermaid
flowchart TD
    LOGIN[Login] --> ROLE{Role?}

    ROLE -->|admin| ADMIN["Admin\nAll branches"]
    ROLE -->|sales_sup| SUP["Sales Supervisor\nOwn team only"]
    ROLE -->|accountant_officer| AO["Accountant Officer\nOwn branch"]
    ROLE -->|accountant_manager| AM["Accountant Manager\nAll branches"]
    ROLE -->|branch_manager| BM["Branch Manager\nOwn branch, all teams"]
    ROLE -->|hr| HR["HR\nAll branches"]
    ROLE -->|hr_support| HRS["HR Support\nAll branches, limited"]
    ROLE -->|top_manager| TM["Top Manager\nAll branches, view-only"]

    subgraph MENUS["Menu keys each role gets (ROLE_DEFAULTS)"]
        M_ADMIN["dashboard · kpi_report · sale_report ·\nupload_history · upload_status ·\naudit_log · user_management · settings\n— NOT daily_entry / kpi_settings / roster"]
        M_SUP["dashboard · kpi_report ·\nsale_report · upload_status"]
        M_AO["daily_entry · sale_report ·\nupload_history · upload_status"]
        M_AM["sale_report · upload_history ·\nupload_status · audit_log"]
        M_BM["dashboard · kpi_report ·\nsale_report · upload_status"]
        M_HR["dashboard · kpi_report · sale_report ·\nupload_history · upload_status ·\nroster · kpi_settings · audit_log · settings\n— NOT user_management / daily_entry"]
        M_HRS["roster (upload only) · upload_status"]
        M_TM["dashboard · kpi_report · sale_report ·\nupload_history · roster · kpi_settings ·\naudit_log · settings — view only, no writes"]
    end

    ADMIN --- M_ADMIN
    SUP --- M_SUP
    AO --- M_AO
    AM --- M_AM
    BM --- M_BM
    HR --- M_HR
    HRS --- M_HRS
    TM --- M_TM
```

`ROLE_DEFAULTS` lives in **two places that must agree**: `src/types/index.ts` (frontend) and `electron/ipc/auth.ts` (backend — what actually gets enforced). Per-user overrides on top of these live in the `user_permissions` table, settable from User Management.

---

## Diagram 3 — Daily Sales Upload & Approval Workflow

```mermaid
flowchart TD
    AO["Accountant Officer\nfills/collects daily XLSX\nfor their own branch"] --> UP["Daily Entry → XLSX Upload"]
    UP --> CHECK{"Existing record\nfor this rep + date?"}
    CHECK -->|No| INSERT["Insert into daily_entries\ntagged with upload_log_id"]
    CHECK -->|Yes| REJECT["Row REJECTED\n'ask Accountant Manager\nto clear the conflicting batch'"]
    INSERT --> AUDIT1["audit_logs: sales_upload_submitted"]
    REJECT --> ERRMODAL["Error modal shows rejected rows\n(officer can fix typos and resubmit,\nbut a true conflict still needs §below)"]

    AUDIT1 --> SHEET1["Auto-push to Google Sheets\n(synced=0 entries)"]

    AM["Accountant Manager"] --> UH["Upload History →\n'Sales Upload Records — Approval'"]
    UH --> REVIEW["Reviews batches by branch/officer/date"]
    REVIEW --> DECIDE{"Bad batch needs\nresubmission?"}
    DECIDE -->|Yes, whole batch| DELETE["Delete & Allow Resubmit\n→ deletes only THIS batch's daily_entries rows"]
    DELETE --> AUDIT2["audit_logs: sales_upload_deleted"]
    AUDIT2 --> AO2["Officer re-uploads\ncorrected rows — now no conflict"]
    AO2 --> UP

    DECIDE -->|Yes, just one day\nwithin a multi-date file| BYDATE["Delete by Branch + Date tool\nPick branch + exact date (or range)\nLive preview count shown"]
    BYDATE --> CONFIRM["Confirm dialog"]
    CONFIRM --> DELETE2["Deletes only daily_entries\nfor that branch + date(s)\n— independent of upload_log_id"]
    DELETE2 --> AUDIT2

    DECIDE -->|No, batch is fine| DONE["No action needed"]
```

Manual Entry was removed app-wide — Daily Entry is XLSX-upload-only now, for every role. The **Delete by Branch + Date** tool is separate from the per-batch **Delete & Allow Resubmit** button — it targets specific dates regardless of which uploaded file originally created those rows, useful when one uploaded file spanned many dates and only one day needs correcting.

---

## Diagram 4 — Roster: One Table, Carry-Forward by Month

```mermaid
flowchart TD
    EDIT["HR/Admin edits a rep,\nor uploads roster XLSX\n(Effective_Date decides the month)"] --> ENSURE["ensureMonthMaterialized(year, month)"]
    ENSURE -->|month already has rows| UPSERT["Upsert this rep's row\nfor that month"]
    ENSURE -->|month is new| COPY["Copy nearest earlier month's\nfull row-set forward first"]
    COPY --> UPSERT
    UPSERT --> TABLE[("roster_monthly\nsalesman_id, year_month,\nbranch_id, supervisor_id,\nstaff_type, active")]

    VIEW["report:monthly / KPI Report\nviewing month X"] --> RESOLVE["resolveYm(X) =\nMAX(year_month) <= X"]
    RESOLVE --> TABLE
    TABLE --> SHOW["Shows that resolved month's\nfull snapshot — read-only,\nnever writes"]

    ROSTERVIEW["Roster screen itself,\nviewing month X"] --> EXACT{"Does month X\nhave its own rows?"}
    EXACT -->|Yes| TABLE
    EXACT -->|No| EMPTY["Empty table:\n'No roster uploaded for {Month} {Year}'\n(no carry-forward on this screen)"]

    TABLE -.->|push| ROSTERSHEET["Google Sheets: Roster tab\n(one tab, Month column)"]
    ROSTERSHEET -.->|pull, re-hash/parse| TABLE
```

A month nobody touched simply reads as whatever the last edited month said for every report/calculation — no "confirm this month, nothing changed" step. **The Roster screen's own display is the one exception**: it shows an exact-month-only view so HR can see at a glance whether a month was actually uploaded, instead of silently inheriting an older month's data. Deactivating/transferring a rep next month never changes how a past month's report reads (§ Diagram 5).

The Roster screen also has a **Sup tab** alongside the existing Reps tab — a read-only list of supervisors for the selected month (Sup Code, Name, Branch, Type, live Rep headcount, Target, Status), so HR can check both reps and supervisors are accounted for without leaving the screen. The Reps tab now also shows each rep's **Target** column (individual override if set, else branch+staff-type default), and the old "Show Inactive" toggle was removed — inactive reps are always hidden now.

---

## Diagram 5 — Why Past Reports Stay Stable Over Time

```mermaid
flowchart LR
    SALE["Daily sale entry\n(Jan, 2026)"] --> STAMP["daily_entries row stamps\nbranch_id + staff_type\nAT THE TIME OF SALE"]
    STAMP --> SCORE["KPI score = always computed\nfrom the entry's OWN stamped values\n— never re-derived from current roster"]

    ROSTERJAN["roster_monthly: Jan snapshot\n(headcount, who's on which branch)"] --> TARGETJAN["Branch point target for Jan\n= headcount(Jan) × per-person rate"]

    TRANSFER["Rep transfers branch in March"] -.->|does NOT touch| STAMP
    TRANSFER -.->|does NOT touch| ROSTERJAN

    SCORE --> REPORT["Dashboard / Executive / Team Performance /\nReports screen — viewing January\n(today, or next year — same numbers)"]
    TARGETJAN --> REPORT
```

---

## Diagram 6 — KPI Scoring Engine

```mermaid
flowchart TD
    SALE["Daily Sale\nper rep, per day"]
    SALE --> J["Jewelry weight (Baht)"]
    SALE --> B["Bar weight (Baht)"]
    SALE --> Q["Quantity (pcs)"]

    J -->|"rate lookup:\nbranch+month > branch+standing >\nglobal+month > global+standing"| PJ["Jewelry Score = weight × rate"]
    B -->|"same priority rule"| PB["Bar Score = weight × rate"]
    Q -->|"tier lookup, same priority rule,\nfirst tier where qty >= threshold"| PQ["Qty Score = qty × tier multiplier"]

    PJ & PB & PQ --> TOTAL["Total KPI Points"]
    TOTAL --> KPIPCT["KPI % = Total Points ÷ Branch Point Target × 100"]

    KPIPCT --> SUP["Supervisor score = team total × sup_kpi_pct%\n(default 30%, editable)\nTeam target falls back to branch target\nwhen no per-rep override exists\n(fixed: used to always show 0.0%)"]
    TOTAL --> COMM["Commission = jewelry×rate + bar×rate + qty×rate\n(LAK, per staff_type per month)"]
```

Editing a rate today never rewrites how a past month already scored — that's why rates/tiers are `year_month`/`effective_from`-`effective_to` scoped instead of one eternal value.

Clicking a rep or supervisor row on KPI Report opens a profile modal with a trend chart — one bar for Total Weight (Jewelry + Bar combined, grams) and one line for Quantity, in the same style regardless of which time view is selected (Month / Week / Day for reps; Month-only for supervisors). Month view previously showed a different chart shape (separate Jewelry/Bar bars plus a KPI% line) — now consistent across all views.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| v1.3.1–v1.3.7 | 2026-06-06 to 09 | Original 4-role design — superseded, see below |
| v1.7.x | 2026-06-17 | 8-role redesign (admin/sales_sup/accountant_officer/accountant_manager/branch_manager/hr/hr_support/top_manager); Manual Entry removed; sales-upload approval workflow added |
| v1.7.x | 2026-06-17 | Roster redesigned to single `roster_monthly` table with carry-forward reads, replacing 3-table event-sourced design |
| v1.7.40 | 2026-06-17 | `report:monthly` fixed to resolve reps/branch/target as-of the viewed month (was reading live roster — drifted when reps transferred/deactivated) |
| v1.7.41 | 2026-06-17 | Login now pulls from Google Sheets before entering the app, with a loading screen |
| v1.7.x | 2026-06-18/19 | Roster screen: added Sup tab, Target column on Reps tab, removed Show Inactive toggle, month filter no longer carries data forward (exact-month-only display) |
| v1.7.x | 2026-06-18/19 | Upload History: added "Delete by Branch + Date" tool with live preview count, separate from per-batch Delete & Allow Resubmit |
| v1.7.x | 2026-06-18/19 | Audit Log now also records Roster, KPI Settings, Commission config, and Supervisor changes |
| v1.7.x | 2026-06-18/19 | KPI Report profile modal: trend chart unified to one Total Weight bar + one Quantity line across all time views; fixed Supervisor Team KPI % always showing 0.0% |
| v1.7.x | 2026-06-18/19 | Post-login landing page now routes to the first menu item the user's role actually has, instead of always defaulting to Dashboard |
| v1.7.x | 2026-06-18/19 | Sync status pill added next to "Updated Xm ago" on every screen, visible to all roles, for "not configured" / "last sync failed" |

*Diagrams older than v1.7.x described a 4-role system (admin/branch_manager/supervisor/executive) and Manual Entry — fully replaced, kept only in version history above for context.*
