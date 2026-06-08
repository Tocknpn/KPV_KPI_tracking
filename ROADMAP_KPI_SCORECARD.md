# KPV Sales Performance — KPI Scorecard Roadmap

## Current System (v1.3.x — Sales KPI Phase)

The current system tracks three sales KPIs per representative per day:

| KPI | Metric | Scoring |
|-----|--------|---------|
| Jewelry | Weight sold (Baht) | Baht × points_per_unit (B2C: 15, B2B: 20) |
| Gold Bar | Weight sold (Baht) | Baht × points_per_unit (B2C: 7.5, B2B: 10) |
| Quantity | Pieces sold | Actual qty × tier multiplier |

**Individual KPI %** = Total Score ÷ `staff_monthly_targets.point_target` × 100

**Commission (LAK)** = (Jewelry × rate_j) + (Bar × rate_b) + (Qty × rate_q) — rates differ by B2C/B2B per month

---

## Future Phase: 4-Pillar KPI Scorecard

> **Status:** Roadmap only — no code changes needed yet.
> This phase begins after the Sales KPI system is fully stable across all branches.

### Scorecard Pillars

| Pillar | Weight | Data Source | Owner |
|--------|--------|-------------|-------|
| Sales Performance | 50% | Current `daily_entries` system | Already built |
| NPS (Net Promoter Score) | 25% | Survey platform / HR export | Future |
| SOP Compliance | 15% | Inspection checklist system | Future |
| Training & Development | 10% | LMS / HR training records | Future |

### Final Scorecard Formula

```
Total Score = (Sales KPI % × 0.50)
            + (NPS Score %  × 0.25)
            + (SOP Score %  × 0.15)
            + (Training %   × 0.10)
```

### Data Schema (future — do not add yet)

```sql
-- NPS scores per rep per month
CREATE TABLE nps_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
  year_month  TEXT NOT NULL,           -- YYYYMM
  score       REAL NOT NULL DEFAULT 0, -- 0–100
  UNIQUE(salesman_id, year_month)
);

-- SOP compliance per rep per month
CREATE TABLE sop_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
  year_month  TEXT NOT NULL,
  score       REAL NOT NULL DEFAULT 0, -- 0–100
  UNIQUE(salesman_id, year_month)
);

-- Training completion per rep per month
CREATE TABLE training_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
  year_month  TEXT NOT NULL,
  score       REAL NOT NULL DEFAULT 0, -- 0–100
  UNIQUE(salesman_id, year_month)
);
```

### UI Changes (future)

1. **Individual Scorecard Screen** — shows 4 pillars side-by-side with progress rings
2. **Scorecard Summary Report** — replaces `report:monthly` or adds a tab
3. **KPI Settings** — add pillar weight editor (must sum to 100%)
4. **Upload/Sync** — NPS/SOP/Training scores imported via CSV or pulled from external system

### Implementation Order (when ready)

1. Confirm data sources for NPS, SOP, Training with HR team
2. Add schema v11 with the 3 new tables above
3. Build upload handler for each pillar score (CSV import)
4. Update `computeKpiScore` to support 4-pillar weighted formula
5. Build Scorecard screen and update Reports with 4-pillar view
6. Update commission formula if commissions should reflect full scorecard (TBD)

---

## Version History Reference

| Version | Feature |
|---------|---------|
| v1.0.x | Core daily entry, targets, KPI scoring |
| v1.1.x | Google Sheets sync, email reports |
| v1.2.x | Role system (supervisor/branch_manager/executive), team view, rep codes |
| v1.3.x | B2C/B2B staff split, individual point targets, commission system |
| v2.0.x | 4-Pillar KPI Scorecard ← **this roadmap** |
