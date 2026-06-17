> **OUTDATED — describes the old 3-role / Manual Entry system.** See `GO_LIVE_GUIDEBOOK.md` and `README.md` for the current 8-role system. Left here for historical context only.

# SalesTrack Pro — System Overview
> Quick reference for management briefing · v1.0.7

---

## What Is This System?

SalesTrack Pro is a **desktop KPI tracking application** for gold & jewelry sales teams.  
It tracks daily sales performance across 4 branches, calculates KPI scores automatically, and shows each person's % progress toward their monthly target.

**Built for:** Branch supervisors · Area managers · Executives  
**Platform:** Windows desktop app (runs offline, syncs to Google Sheets)

---

## 1. User Roles

| Role | What They Can Do |
|------|-----------------|
| **Admin** | Full access — data entry, KPI settings, user management, all branches |
| **Supervisor** | Their branch only — daily entry, view reports for own branch |
| **Executive** | Read-only — analytics & executive company overview |

> Supervisors log in and only see their own branch. They cannot access other branches or admin settings.

---

## 2. The 3 KPI Metrics

Every salesperson is scored on **3 things every day**:

| Metric | How Points Are Earned |
|--------|-----------------------|
| **Gold Jewelry** | Actual Weight (g) × **15 pts/g** |
| **Gold Bar** | Actual Weight (g) × **7.5 pts/g** |
| **Quantity** | Actual Qty × **Tier Multiplier** (depends on branch & qty sold) |

### Quantity Tier Multipliers

**ITecc, VangThong, Vientiane Center:**

| Qty Sold | Multiplier |
|----------|-----------|
| 900+ pcs | × 5.0 |
| 700–899  | × 4.5 |
| 500–699  | × 4.0 |
| 350–499  | × 3.5 |
| 200–349  | × 3.0 |
| 100–199  | × 2.5 |
| 50–99    | × 2.0 |
| 1–49     | × 1.5 |

**Morning Market** (higher multipliers):

| Qty Sold | Multiplier |
|----------|-----------|
| 900+ pcs | × 6.5 |
| 700–899  | × 6.0 |
| 500–699  | × 5.0 |
| 350–499  | × 4.0 |
| 200–349  | × 3.0 |
| 100–199  | × 2.5 |
| 50–99    | × 2.0 |
| 1–49     | × 1.5 |

---

## 3. KPI Score % — The Main Target

```
Total KPI Points  =  Jewelry Score  +  Bar Score  +  Qty Score

KPI %  =  (Total KPI Points ÷ Branch Point Target) × 100
```

**100% = target met for the month.**

### Branch Point Targets (per person per month)

| Branch | Monthly Point Target |
|--------|---------------------|
| Morning Market | **8,000 pts** |
| VangThong | **7,000 pts** |
| ITecc | **6,000 pts** |
| Vientiane Center | **5,500 pts** |

> These targets are set in **KPI Settings → Branch KPI Point Targets** and can be changed by Admin at any time.

### Example Calculation

```
A salesperson at Morning Market sold in a month:
  Jewelry : 500 g  →  500 × 15    =  7,500 pts
  Bar     : 200 g  →  200 × 7.5   =  1,500 pts
  Qty     : 60 pcs →  60 × 2.0    =    120 pts  (tier: 50-99 × 2.0)
                                   ─────────────
  Total Score                      =  9,120 pts

  KPI %  = 9,120 ÷ 8,000 × 100  =  114%  ✓ TARGET HIT
```

---

## 4. Daily Data Entry

### Option A — Manual Entry
- Go to **Daily Entry → Manual Entry**
- Select the date
- Type each person's jewelry (g), bar (g), qty directly in the table
- Auto-saves on every cell change

### Option B — XLSX Upload (recommended for bulk)
- Go to **Daily Entry → Daily XLSX Upload**
- Download the template (pre-filled with staff names & IDs)
- Fill in the numbers in Excel (supports Lao text)
- Upload the file — system imports all rows automatically

> **Same for monthly targets:** use **Target XLSX Upload** tab to upload target data for the month.

---

## 5. Dashboard

The Dashboard gives a real-time snapshot for the selected branch/period:

```
┌────────────────────────────────────────────────────────┐
│  Jewelry MTD (g)   │  Bar MTD (g)   │  Quantity MTD    │
│  raw actual weight │ raw actual     │ total pcs sold   │
├────────────────────────────────────────────────────────┤
│  KPI Score Panel                    │  Top 5 Performers│
│  ● Total KPI % gauge                │  (ranked by      │
│  ● Jewelry / Bar / Qty contribution │   total weight)  │
│  ● Raw pts + % breakdown            │                  │
└────────────────────────────────────────────────────────┘
```

- **Admin/Executive**: top-right dropdown → select one, multiple, or ALL branches
- **Supervisor**: sees only their branch (no selector shown)

---

## 6. Reports — Monthly Tracking

Go to **Reports** to see every salesperson's performance for the selected month.

### Table Columns

| Column | Meaning |
|--------|---------|
| Representative | Name & position |
| Branch | Branch name (shown in multi-branch view) |
| Jewelry (g) | Total jewelry weight sold this month |
| Bar (g) | Total bar weight sold this month |
| Qty (pcs) | Total quantity sold this month |
| **KPI Score %** | `Total Points ÷ Branch Target × 100` |
| **Est. Month End** | Projected KPI% if current pace continues |

- All columns are **sortable** (click header to sort ↑↓)
- Default sort: KPI Score % descending (top performers first)
- **Est. Month End** = `Current KPI% ÷ Days Passed × Total Days in Month`

---

## 7. Analytics

Go to **Analytics** for branch-level visual insights:

- **Pie chart** — which branch contributes what % of total weight
- **Line chart** — daily or weekly trend for Jewelry vs Bar weight
  - Toggle: **By Day** (each day as a data point) or **By Week** (Sun–Sat week groupings)
- **Branch Comparison Matrix** — table with each branch's totals and % share

---

## 8. Executive View

Go to **Executive View** for the highest-level company summary:

- Total company weight MTD vs overall target
- Branch % hit (each branch's progress vs its own target)
- **Branch KPI Comparison chart** — Actual vs Target side-by-side per branch with % labels
- Branch rankings table (sorted by total weight)

---

## 9. KPI Settings (Admin Only)

All scoring rules are configurable without changing code:

| Setting | Where | What It Controls |
|---------|-------|-----------------|
| Gold Jewelry multiplier | Metric → Jewelry | Default 15 pts/g |
| Gold Bar multiplier | Metric → Bar Weight | Default 7.5 pts/g |
| Qty tier table | Metric → Quantity → select branch | Qty thresholds & multipliers per branch |
| Branch point targets | Branch KPI Point Targets card | Monthly target per person per branch |

> Changes take effect immediately — no restart needed.

---

## 10. Google Sheets Sync

Click **Sync to Cloud** (top-right) to push all local data to a Google Sheet.  
The counter shows how many records are pending sync.

Setup in **Settings → Google Sheets**: enter the Sheet ID and service account key file path.

---

## Quick Login Reference

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin1234` | Admin (full access) |
| `ceo` | `ceo1234` | Executive (read-only) |
| `sup_mm` | `sup1234` | Supervisor — Morning Market |
| `sup_vc` | `sup1234` | Supervisor — Vientiane Center |
| `sup_it` | `sup1234` | Supervisor — ITecc |
| `sup_vt` | `sup1234` | Supervisor — VangThong |

> Change passwords via **User Management** after first login.

---

## File Formats

### Daily XLSX Upload
```
Date (YYYY-MM-DD) | Staff_ID | Full_Name | Branch_ID | Jewelry (g) | Bar (g) | Qty
2026-05-01        | 1        | Somchai   | 1         | 45.5        | 120.0   | 2
```

### Target XLSX Upload
```
Staff_ID | Full_Name | Branch_ID | Year | Month | Jewelry_Target_g | Bar_Target_g | Qty_Target
1        | Somchai   | 1         | 2026 | 5     | 1200             | 1800         | 30
```

> Test files for May 2026 (all branches) are in the `test_data/` folder.

---

*SalesTrack Pro — KPV Gold & Jewelry Sales Performance System*
