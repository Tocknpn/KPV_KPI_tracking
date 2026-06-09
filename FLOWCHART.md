# KPV Sales Performance — System Flowcharts

> Version: **v1.3.7** — Update this header + diagram whenever app changes screens, roles, or data flow.

Paste each diagram block into [mermaid.live](https://mermaid.live) to render.

---

## Diagram 1 — User Roles & Screen Access Permissions

```mermaid
flowchart TD
    START([App Launch]) --> LOGIN["/login — Login Screen"]
    LOGIN --> AUTH{"Credentials valid?"}
    AUTH -->|No| LOGIN
    AUTH -->|Yes| ROLE{"Role?"}

    ROLE -->|admin| ADMIN["Admin"]
    ROLE -->|branch_manager| BM["Branch Manager"]
    ROLE -->|supervisor| SUP["Supervisor"]
    ROLE -->|executive| EXEC["Executive"]

    subgraph SCOPE["Data Scope per Role"]
        SC_A["Admin — ALL branches · ALL data · full write"]
        SC_B["Branch Manager — own branch_id only · write"]
        SC_S["Supervisor — own supervisor_id team only · write"]
        SC_E["Executive — ALL branches · read-only"]
    end
    ADMIN --- SC_A
    BM    --- SC_B
    SUP   --- SC_S
    EXEC  --- SC_E

    subgraph NAV["Screens ( /route — Label )"]
        DASH["/dashboard — Dashboard"]
        ENTRY["/daily-entry — Daily Entry"]
        REPORTS["/reports — Reports\n4 tabs: Performance · Customer Type · Supervisor · Commission\nclick rep/sup row → Individual Profile Modal"]
        ANAL["/analytics — Analytics"]
        EXECV["/executive — Executive View"]
        TEAM["/team-performance — Team Performance"]
        UPLOAD["/upload-history — Upload History\nUpload History tab + Roster tab (admin only)"]
        SETT["/settings — Settings\nSheets config · Force Full Sync · Test Data"]
        USERS["/users — User Management"]
        KPISET["/kpi-settings — KPI Settings\nUnified KPI config per month · Score simulator"]
    end

    ADMIN --> DASH & ENTRY & REPORTS & ANAL & EXECV & TEAM & UPLOAD & SETT & USERS & KPISET
    BM    --> DASH & ENTRY & REPORTS & TEAM & UPLOAD & SETT
    SUP   --> DASH & ENTRY & REPORTS & UPLOAD & SETT
    EXEC  --> DASH & ANAL & EXECV & TEAM & REPORTS & UPLOAD & SETT
```

---

## Diagram 2 — Full Data Workflow

```mermaid
flowchart TD
    subgraph INPUT["Data Input"]
        MANUAL["Manual Daily Entry\n/daily-entry screen\nper rep · per day"]
        XLSUP["XLSX/CSV Upload\n/upload-history\nbulk daily entries"]
        ROSTERUP["Roster Upload CSV/XLSX\n/daily-entry (admin)\nrep codes + point targets + staff_type"]
        ROSTERCRUD["Roster Tab CRUD\n/upload-history (admin)\nadd/edit/deactivate reps · set targets"]
        PULL["Pull from Cloud\nSettings → Pull from Cloud\nGoogle Sheets → SQLite\n(restores Entries + CommissionConfig)"]
    end

    MANUAL   -->|"upload:daily IPC"| DEDB
    XLSUP    -->|"upload:daily IPC"| DEDB
    PULL     -->|"sheets.pullFromCloud"| DEDB
    ROSTERUP -->|"upload:roster IPC"| REPDB
    ROSTERCRUD -->|"roster:saveRep / deactivate IPC\n→ pushRosterIfConfigured"| REPDB

    REPDB[("salesmen\nstaff_monthly_targets\nsupervisors")]
    DEDB[("daily_entries\nSQLite\nsynced = 0")]

    DEDB --> KPI

    subgraph KPI["KPI Computation — report:monthly / report:teamPerformance"]
        direction TB
        RATES["kpi_metric_type_rates\nB2C: Jewelry × 15  Bar × 7.5\nB2B: Jewelry × 20  Bar × 10"]
        TIERS["kpi_tier_configs + kpi_tiers\nQty threshold → multiplier\nbranch-specific"]
        INDVTGT["staff_monthly_targets\nB2C default: 5000 pts\nB2B default: 7000 pts"]
        SCORESUM["Score = SUM per day\njewelry×rate_j + bar×rate_b + qty×tier_mult"]
        KPIPCT["KPI% = Score ÷ individual_target × 100"]
        RATES   --> SCORESUM
        TIERS   --> SCORESUM
        SCORESUM --> KPIPCT
        INDVTGT --> KPIPCT
    end

    KPI --> RSCREEN

    subgraph RSCREEN["/reports — Reports Screen (4 Tabs)"]
        PTAB["Performance Tab\nper-rep KPI% · EOM forecast\nB2C / B2B chip filter · supervisor filter"]
        CTTAB["Customer Type Tab\nB2C vs B2B group stats\nside-by-side totals + detail tables"]
        SUPTAB["Supervisor Tab\nsup KPI%, team breakdown"]
        COMMTAB["Commission Tab\nrep + supervisor LAK amounts"]
        REPMODAL["Rep Profile Modal\ntrend chart Month/Week/Day granularity\nhistory table + Commission ₭ column"]
        SUPMODAL["Sup Profile Modal\ntrend chart · history table"]
        PTAB --> REPMODAL
        SUPTAB --> SUPMODAL
    end

    subgraph KPISETT["/kpi-settings — KPI Settings (Admin Only)"]
        KPICFG["Unified KPI Config per month\nJewelry multiplier · Bar multiplier\nQty tier assign"]
        BTGT["Branch KPI Targets\nkpi_point_target per branch"]
        COMMR["Commission Rates LAK\nper staff_type per month\n(saves + pushes CommissionConfig tab)"]
        SUPRATE["Supervisor Score Weight\nsup_kpi_pct — % of team KPI credited to sup score"]
        SIMUL["Score Simulator\ntest any weight/qty against config"]
    end

    KPISETT -.->|"config used by"| KPI
    KPISETT -.->|"commission rates used by"| RSCREEN

    subgraph OUTPUT["Output / Sync"]
        PUSHDATA["Push to Cloud (incremental)\nSettings → Sync to Cloud\nonly synced=0 entries → marks synced=1"]
        FORCESYNC["Force Full Sync\nSettings → Force Full Sync\nresets ALL entries synced=0\nclears Entries tab\npushes ALL entries + 6 config tabs"]
        PUSHCFG["Save Commission Config\ncommission:saveConfig IPC\nwrites CommissionConfig tab in Sheets"]
        PUSHROSTER["Auto Push Roster\nafter any roster:saveRep / deactivate\npushRosterIfConfigured (fire-and-forget)"]
        EMAILRPT["Email Report\nnodemailer\n(email_config required)"]
    end

    DEDB    -->|"synced=0 rows"| PUSHDATA
    DEDB    -->|"all entries"| FORCESYNC
    KPISETT -->|"admin saves rates"| PUSHCFG
    REPDB   -->|"roster change"| PUSHROSTER
    PULL    -.->|"restores data"| REPDB
    RSCREEN -->|"admin action"| EMAILRPT
```

---

## Diagram 3 — What This App Does (Executive Overview)

> One-page brief for top management. Non-technical.

```mermaid
flowchart LR
    subgraph STAFF["Every Working Day"]
        REP["108 Sales Staff\n4 Branches"]
        ENTRY["Record Sales\nGold Jewelry · Gold Bar · Quantity"]
    end

    subgraph SYSTEM["System Automatically"]
        SCORE["Scores Performance\nB2C & B2B rates apply separately"]
        RANK["Ranks Each Staff\nKPI% vs monthly target"]
        CALC["Calculates Commission\nin LAK per staff"]
    end

    subgraph MGMT["Management Gets"]
        REPORT["Live KPI Reports\nper rep · per team · per branch"]
        COMMISSION["Commission Payroll\nstaff + supervisor amounts"]
        CLOUD["Google Sheets Backup\nauto-sync · always accessible"]
    end

    REP --> ENTRY --> SCORE --> RANK --> REPORT
    RANK --> CALC --> COMMISSION
    SCORE --> CLOUD
```

---

## Diagram 4 — Organization & Who Sees What

```mermaid
flowchart TD
    CEO["Executive / CEO\nFull visibility — all 4 branches\nRead-only · no data entry"]

    CEO --> MM["Morning Market\nBranch Manager"]
    CEO --> VC["Vientiane Center\nBranch Manager"]
    CEO --> IT["ITecc\nBranch Manager"]
    CEO --> VT["VangThong\nBranch Manager"]

    MM --> MM_A["Alpha Team\nSupervisor · 9 staff · B2C"]
    MM --> MM_B["Beta Team\nSupervisor · 9 staff · B2C"]
    MM --> MM_G["Gamma Team\nSupervisor · 9 staff · B2B"]

    VC --> VC_A["Alpha Team · B2C"]
    VC --> VC_B["Beta Team · B2C"]
    VC --> VC_G["Gamma Team · B2B"]

    IT --> IT_A["Alpha Team · B2C"]
    IT --> IT_B["Beta Team · B2C"]
    IT --> IT_G["Gamma Team · B2B"]

    VT --> VT_A["Alpha Team · B2C"]
    VT --> VT_B["Beta Team · B2C"]
    VT --> VT_G["Gamma Team · B2B"]

    subgraph TOTAL["Total: 108 Sales Staff"]
        T1["4 Branches × 3 Teams × 9 Staff"]
        T2["B2C Teams — retail customers"]
        T3["B2B Teams — business customers"]
    end
```

---

## Diagram 5 — How KPI Score Becomes Commission

```mermaid
flowchart TD
    SALE["Daily Sales\nper staff member"]

    SALE --> J["Gold Jewelry sold\nBaht weight"]
    SALE --> B["Gold Bar sold\nBaht weight"]
    SALE --> Q["Quantity sold\npieces"]

    J -->|"B2C × 15\nB2B × 20"| PJ["Jewelry Points"]
    B -->|"B2C × 7.5\nB2B × 10"| PB["Bar Points"]
    Q -->|"tier multiplier\nbranch-specific"| PQ["Quantity Points"]

    PJ & PB & PQ --> TOTAL["Total Monthly Score"]

    TOTAL --> KPI["KPI%\nScore ÷ Personal Target × 100"]

    KPI -->|"above 100%"| GREEN["High Performer"]
    KPI -->|"60–100%"| YELLOW["On Track"]
    KPI -->|"below 60%"| RED["Needs Support"]

    TOTAL --> COMM["Commission Payout"]

    subgraph COMM_CALC["Commission Formula"]
        C1["Jewelry Baht × LAK rate\n+ Bar Baht × LAK rate\n+ Qty × LAK rate"]
        C2["Supervisor gets 30%\nof team total"]
    end

    COMM --> C1
    C1 --> C2
```

---

## Change Log

| Version | Date       | Change |
|---------|------------|--------|
| v1.3.1  | 2026-06-06 | Initial flowchart — B2C/B2B split, commission screen, customer type report, individual targets |
| v1.3.1  | 2026-06-06 | Added Diagrams 3–5: executive overview, org hierarchy, KPI-to-commission |
| v1.3.2  | 2026-06-06 | Bidirectional Sheets sync: Settings/Branches/KPIRates/QtyTiers/Roster tabs; auto-pull on startup |
| v1.3.3  | 2026-06-07 | Commission integrated as tab 4 in /reports (no longer separate /commission route); Supervisor tab added |
| v1.3.4  | 2026-06-07 | Schema v9: kpi_metric_type_rates + commission_configs + staff_monthly_targets tables; test data loader in Settings |
| v1.3.5  | 2026-06-07 | Roster CRUD IPC (roster.ts); Roster tab in Upload History (admin only); Force Full Sync in Settings |
| v1.3.6  | 2026-06-08 | Roster tab: month filter + supervisor filter; Individual Profile Modals in Reports (rep + supervisor) |
| v1.3.7  | 2026-06-09 | Modal drill-down granularity (Month/Week/Day); Commission ₭ column in history table; Supervisor Score Weight rename; Unified KPI Config section per month; GitHub Actions manual-only builds |
