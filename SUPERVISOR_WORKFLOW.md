> **OUTDATED — describes the old single-branch-supervisor / Manual Entry system.** See `GO_LIVE_GUIDEBOOK.md` (Role 2 — Sales Supervisor) for the current workflow. Left here for historical context only.

# Supervisor Daily Workflow
### SalesTrack Pro — Branch Operations Guide
> For slide presentation · Supervisor role

---

## Who Is the Supervisor?

- **One supervisor per branch** (VC / IT / VT / MM)
- **Sees only their own branch** — cannot view other branches
- **No access to:** KPI Settings, User Management, Executive View
- **Main job:** Enter daily sales → monitor team KPI progress

---

## Daily Routine Overview

```
MORNING              DURING DAY           END OF DAY
────────────         ───────────────      ──────────────────
✓ Login              ✓ Collect sales      ✓ Enter sales data
✓ Check Dashboard    ✓ data from team     ✓ Review totals
✓ Note yesterday's                        ✓ Check KPI progress
  KPI scores
```

---

## Step-by-Step Daily Workflow

---

### STEP 1 — Login (Morning)
**Menu: Login Screen**

1. Open SalesTrack Pro on desktop
2. Enter username and password (e.g. `sup_vt` / `sup1234`)
3. System automatically opens **your branch dashboard only**

> ✦ Supervisor cannot see or switch to other branches

---

### STEP 2 — Check Dashboard (Morning ~5 min)
**Menu: Dashboard**

What to look at every morning:
- **KPI Score %** — how far has the team progressed this month?
- **Jewelry / Bar / Qty scores** — which metric needs attention?
- **Top 5 Performers** — who is leading? who is behind?

Key questions to ask:
| If you see... | Action |
|---------------|--------|
| KPI% is low | Push team to focus on high-value items (jewelry/bar) |
| Qty score low | Remind team about quantity volume |
| One person dominating | Encourage others |

---

### STEP 3 — Collect Sales Data (During the Day)
**No system needed — collect from floor**

How supervisors typically collect daily data:
- Paper record at counter
- WhatsApp / Line report from staff at end of shift
- Direct observation at branch

What to record for **each salesperson per day**:
```
┌─────────────────────────────────────────┐
│  Name         : ___________________     │
│  Jewelry Sold : _______ g               │
│  Bar Sold     : _______ g               │
│  Qty Sold     : _______ pcs             │
│  Date         : ___________________     │
└─────────────────────────────────────────┘
```

---

### STEP 4 — Enter Daily Data (End of Day ~10 min)
**Menu: Daily Entry → Manual Entry**

**Option A — Manual Entry (type directly):**
1. Go to **Daily Entry**
2. Confirm the date is correct (top right)
3. For each salesperson: type Jewelry (g), Bar (g), Qty
4. Data saves automatically — no button needed
5. Done ✓

**Option B — XLSX Upload (if using spreadsheet):**
1. Fill in the daily XLSX template
2. Go to **Daily Entry → Daily XLSX Upload**
3. Drop the file → click **Import Daily Data**
4. System shows how many records were imported

> ✦ If you upload the same person + date again, the latest file wins (replaces old data)

---

### STEP 5 — Verify Totals (End of Day ~2 min)
**Still on Daily Entry page — scroll to bottom**

Check the totals bar at the bottom:
```
TOTAL JEWELRY     TOTAL BAR        TOTAL QTY
  1,245.5 g        2,890.0 g        28 pcs
```

- Does this match what you collected from the floor?
- If something is wrong → fix the cell and it auto-saves

---

### STEP 6 — Review KPI Progress (End of Day ~5 min)
**Menu: Reports**

What to check:
1. **KPI Score %** column — who has hit the most % of their target?
2. **Est. Month End** column — is the team on track to hit 100% this month?
3. Sort by **Est. Month End** (click column header) — see who needs support

Reading the Est. Month End:
```
Est. Month End > 100%  →  On track to exceed target ✓
Est. Month End 70-99%  →  Needs to push harder
Est. Month End < 70%   →  Needs immediate attention ⚠
```

---

## Weekly Check (Every Monday ~10 min)

| Task | Menu | What to Look For |
|------|------|-----------------|
| Review weekly trend | Analytics | Is jewelry or bar trending up or down? |
| Identify consistent low performers | Reports | Sort by KPI% ascending |
| Compare to last week | Dashboard | Change month if needed |

---

## Monthly Tasks (Last Week of Month)

| Day | Task | Where |
|-----|------|-------|
| 25th | Check if team will hit target | Reports → Est. Month End |
| 25th | Push underperformers | Identify from KPI% sort |
| Last day | Final data entry — make sure all days are entered | Daily Entry |
| Last day | Screenshot the final Reports page | Reports |
| 1st of new month | Confirm new month data starts fresh | Dashboard |

---

## KPI Score Quick Reference

**How a salesperson earns points:**
```
Jewelry sold (g)  ×  15 pts/g   =  Jewelry Score
Bar sold (g)      ×  7.5 pts/g  =  Bar Score
Qty sold          ×  Tier mult  =  Qty Score
                                   ─────────────
                     TOTAL KPI POINTS

KPI % = Total Points ÷ Branch Target × 100
```

**Branch targets (per person per month):**
```
Morning Market   →  8,000 pts  (highest)
VangThong        →  7,000 pts
ITecc            →  6,000 pts
Vientiane Center →  5,500 pts  (lowest)
```

**Example — VangThong salesperson:**
```
Jewelry: 450g × 15   = 6,750 pts
Bar:     200g × 7.5  = 1,500 pts
Qty:     30 pcs × 3  =    90 pts  (tier: 200-349 × 3.0 fallback)
─────────────────────────────────
Total                = 8,340 pts
KPI %  = 8,340 ÷ 7,000 × 100 = 119% ✓ TARGET EXCEEDED
```

---

## What Supervisor CANNOT Do

| Action | Who Can Do It |
|--------|--------------|
| View other branches | Admin / Executive |
| Change KPI targets | Admin only |
| Change KPI multipliers | Admin only |
| Create/edit users | Admin only |
| View Executive Overview | Admin / Executive |
| Access Analytics | Admin / Executive |

---

## Common Questions

**Q: I entered the wrong number — how do I fix it?**
→ Go to Daily Entry, select the same date, click the cell and retype. It auto-saves.

**Q: I forgot to enter data for 3 days ago — can I go back?**
→ Yes. Change the date picker on Daily Entry to any past date and enter normally.

**Q: The KPI% looks wrong — what to check?**
→ Verify all days of the month are entered. Missing days = lower score.

**Q: My team asks "how many more grams do I need to sell?" — how do I answer?**
→ Go to Reports, find their row, check KPI% and Est. Month End. If Est. < 100%, they need to pace faster.

---

## Daily Entry Checklist

```
□ Login to SalesTrack Pro
□ Check Dashboard — note today's KPI%
□ Collect data from all staff for today
□ Open Daily Entry → confirm date
□ Enter all staff data (jewelry, bar, qty)
□ Verify totals match floor data
□ Open Reports → check Est. Month End
□ Note any staff below 70% for follow-up
□ Log out
```

---

*SalesTrack Pro v1.1.0 — Supervisor Guide · KPV Gold & Jewelry*
