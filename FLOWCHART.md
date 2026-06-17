# KPV Sales Performance — System Flowcharts

> Version: **v1.7.41** — schema v20. Update this header + diagrams whenever app changes screens, roles, or data flow.

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
    SYNC -->|fail / offline / not configured| STALE["'Could not sync — using last saved data.'\n(does not block login)"]
    UPTODATE --> APP["App — role-scoped dashboard"]
    STALE --> APP
```

Every login pulls fresh data first — a device that's been offline, or where someone else made a change on another device, never shows stale numbers without at least trying to catch up.

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
    DECIDE -->|Yes| DELETE["Delete & Allow Resubmit\n→ deletes only THIS batch's daily_entries rows"]
    DELETE --> AUDIT2["audit_logs: sales_upload_deleted"]
    AUDIT2 --> AO2["Officer re-uploads\ncorrected rows — now no conflict"]
    AO2 --> UP

    DECIDE -->|No, batch is fine| DONE["No action needed"]
```

Manual Entry was removed app-wide — Daily Entry is XLSX-upload-only now, for every role.

---

## Diagram 4 — Roster: One Table, Carry-Forward by Month

```mermaid
flowchart TD
    EDIT["HR/Admin edits a rep,\nor uploads roster XLSX\n(Effective_Date decides the month)"] --> ENSURE["ensureMonthMaterialized(year, month)"]
    ENSURE -->|month already has rows| UPSERT["Upsert this rep's row\nfor that month"]
    ENSURE -->|month is new| COPY["Copy nearest earlier month's\nfull row-set forward first"]
    COPY --> UPSERT
    UPSERT --> TABLE[("roster_monthly\nsalesman_id, year_month,\nbranch_id, supervisor_id,\nstaff_type, active")]

    VIEW["Roster screen / report:monthly\nviewing month X"] --> RESOLVE["resolveYm(X) =\nMAX(year_month) <= X"]
    RESOLVE --> TABLE
    TABLE --> SHOW["Shows that resolved month's\nfull snapshot — read-only,\nnever writes"]

    TABLE -.->|push| ROSTERSHEET["Google Sheets: Roster tab\n(one tab, Month column)"]
    ROSTERSHEET -.->|pull, re-hash/parse| TABLE
```

A month nobody touched simply reads as whatever the last edited month said — no "confirm this month, nothing changed" step. Deactivating/transferring a rep next month never changes how a past month's report reads (§ Diagram 5).

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

    KPIPCT --> SUP["Supervisor score = team total × sup_kpi_pct%\n(default 30%, editable)"]
    TOTAL --> COMM["Commission = jewelry×rate + bar×rate + qty×rate\n(LAK, per staff_type per month)"]
```

Editing a rate today never rewrites how a past month already scored — that's why rates/tiers are `year_month`/`effective_from`-`effective_to` scoped instead of one eternal value.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| v1.3.1–v1.3.7 | 2026-06-06 to 09 | Original 4-role design — superseded, see below |
| v1.7.x | 2026-06-17 | 8-role redesign (admin/sales_sup/accountant_officer/accountant_manager/branch_manager/hr/hr_support/top_manager); Manual Entry removed; sales-upload approval workflow added |
| v1.7.x | 2026-06-17 | Roster redesigned to single `roster_monthly` table with carry-forward reads, replacing 3-table event-sourced design |
| v1.7.40 | 2026-06-17 | `report:monthly` fixed to resolve reps/branch/target as-of the viewed month (was reading live roster — drifted when reps transferred/deactivated) |
| v1.7.41 | 2026-06-17 | Login now pulls from Google Sheets before entering the app, with a loading screen |

*Diagrams older than v1.7.x described a 4-role system (admin/branch_manager/supervisor/executive) and Manual Entry — fully replaced, kept only in version history above for context.*
