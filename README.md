# SalesTrack Pro
### Gold & Jewelry Sales Performance Tracking System
> Windows Desktop App · Electron + React · SQLite local DB · Google Sheets cloud sync

---

## Table of Contents
1. [Quick Start](#1-quick-start)
2. [User Accounts & Roles](#2-user-accounts--roles)
3. [Screen Guide](#3-screen-guide)
4. [KPI Scoring System](#4-kpi-scoring-system)
5. [Testing Guide — Run Full Test](#5-testing-guide--run-full-test)
6. [Google Sheets Sync Setup](#6-google-sheets-sync-setup)
7. [Email Automation Setup](#7-email-automation-setup)
8. [Build Installer (.exe)](#8-build-installer-exe)
9. [Data Backup & Reset](#9-data-backup--reset)

---

## 1. Quick Start

### Prerequisites
- Windows 10/11 (64-bit)
- Node.js 20+ installed

### Run in development
```powershell
cd "c:\Users\advice\KPV sale performance tracking"
npm install
npm run build
npx electron out/main/main.js
```

### Default login
| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin1234` | Admin (full access) |
| `sup_mm` | `sup1234` | Supervisor – Morning Market |
| `sup_vc` | `sup1234` | Supervisor – Vientiane Center |
| `sup_it` | `sup1234` | Supervisor – ITecc |
| `sup_vt` | `sup1234` | Supervisor – VangThong |
| `ceo` | `ceo1234` | Executive (read-only) |

---

## 2. User Accounts & Roles

### Role permissions

| Feature | Admin | Supervisor | Executive |
|---------|-------|------------|-----------|
| Dashboard | ✅ All branches | ✅ Own branch only | ✅ Read-only |
| Daily Entry | ✅ | ✅ Own branch | ❌ |
| Reports | ✅ | ✅ Own branch | ❌ |
| Branch Analytics | ✅ | ❌ | ✅ |
| Executive View | ✅ | ❌ | ✅ |
| Settings | ✅ | ✅ (no KPI tab) | ✅ (view only) |
| **KPI Settings** | ✅ Admin only | ❌ | ❌ |
| **User Management** | ✅ Admin only | ❌ | ❌ |

### Create a new user (Admin)
1. Login as `admin`
2. Sidebar → **User Management**
3. Click **Add User**
4. Fill: Full Name, Username, Password, Role, Branch
5. **Supervisor** must have a branch assigned
6. **Admin / Executive** — branch is optional (they see all)

### Change a password
1. User Management → find user → click **Edit** (pencil icon)
2. Enter new password in Password field → Save
3. Leave password blank = keep existing

---

## 3. Screen Guide

### Dashboard (Supervisor / Admin)
- **4 KPI hero cards** — MTD totals: Jewelry Weight, Bar Weight, Quantity, and overall average % hit
- **Radial gauges** — Month-to-Date % of monthly target for each KPI
- **KPI Score cards** — computed score per KPI based on tier config
- **Top 5 Performers** table — sorted by total weight sold
- Branch selector (Admin) — click `MM / VC / IT / VT` to switch branches

### Daily Performance Entry (Supervisor / Admin)
- Select **date** (top right date picker)
- Edit cells inline — click any cell in Jewelry/Bar/Qty columns
- **Auto-saves** to local SQLite immediately (no need to click Save)
- Status icons:
  - ☁️ (green check) = saved and synced to Google Sheets
  - 💾 (amber) = saved locally, not yet synced
  - ⏳ (grey) = no data entered yet
- **Upload CSV** — drag a CSV file onto the dropzone (format below)
- **Sync to Cloud** button — pushes all unsynced entries to Google Sheets

#### CSV format for batch entry upload
```csv
salesman_id,entry_date,jewelry_weight_g,bar_weight_g,quantity
1,2026-06-01,125.5,300.0,3
2,2026-06-01,80.0,150.0,2
```
> Get salesman IDs from: Admin → Settings → (inspect DB) or from the Reports table

### Team Performance Reports (Supervisor / Admin)
- Monthly table per salesman: Target vs MTD vs % Hit vs EOM Projection
- **% Hit badge colors**: Green ≥100% | Grey ≥75% | Amber ≥50% | Red <50%
- **EOM Projection** = (MTD ÷ days elapsed) × days in month
- Export to PDF / CSV (UI buttons — implementation in next version)
- Filter by month/year using top dropdowns

### Branch Performance Analytics (Admin / Executive)
- **Selling trends bar chart** — daily jewelry + bar weight for current month
- **Branch % contribution** — which branch sells most
- **Branch Comparison table** — total weight, quantity, % of company total

### Executive View (Admin / Executive)
- Company-wide revenue/weight overview across all 4 branches
- **Radial gauge** — overall % of monthly target hit
- **Branch KPI bar chart** — MTD vs target per branch
- **Branch rankings table** — sorted by total weight sold

### KPI Settings (Admin only)
- Select **KPI Metric** (Jewelry Weight / Bar Weight / Quantity)
- Select **Scope**: Global (all branches) or specific branch
- **Tier Table**: rows of `If actual/target ≥ X% → Award Y score`
- **Score Simulator**: enter actual + target → see what score tier is hit
- Multiple configs with effective date ranges (seasonal changes)

### User Management (Admin only)
- Full CRUD: create, edit, deactivate, restore users
- Role assignment: admin / supervisor / executive
- Branch assignment (supervisors only)

---

## 4. KPI Scoring System

Each KPI metric uses a **tiered percentage scoring** system:

```
Score = lookup(actual / target × 100) against tier table
```

Default tier table (applies to all branches, all KPIs):

| If actual/target ≥ | Score awarded |
|--------------------|---------------|
| 100% | 100 pts |
| 80% | 80 pts |
| 60% | 60 pts |
| 40% | 40 pts |
| 20% | 20 pts |
| < 20% | 0 pts |

**Example**: Salesman has Jewelry target = 1000g. MTD actual = 850g.
- PCT = 850/1000 × 100 = **85%**
- Hits tier ≥80% → **Score = 80 pts**

### Customize tiers (Admin → KPI Settings)
1. Select KPI → select branch scope (Global or specific branch)
2. Click **New Config** or select existing config
3. Add/edit tier rows (threshold%, score)
4. Click **Sort** to order descending (required for correct evaluation)
5. Set effective date range for seasonal configs
6. Click **Create/Update Config**
7. Use **Score Simulator** to verify: enter actual + target → check result

---

## 5. Testing Guide — Run Full Test

### Step A — Reset & load test data
1. Login as `admin / admin1234`
2. Go to **Settings** (sidebar)
3. Click **Load Test Data** (amber button)
4. Confirms: 20 salesmen, targets, 10 days of entries loaded

### Step B — Verify data in Dashboard
1. Still logged as admin → **Dashboard**
2. Click branch tabs `MM / VC / IT / VT` — each should show different numbers
3. Check radial gauges show % values (not 0%)
4. Top 5 Performers table should list salesmen

### Step C — Test each branch as Supervisor
Log in as each supervisor and verify their view is branch-locked:

| Login | Branch seen |
|-------|-------------|
| `sup_mm / sup1234` | Morning Market only |
| `sup_vc / sup1234` | Vientiane Center only |
| `sup_it / sup1234` | ITecc only |
| `sup_vt / sup1234` | VangThong only |

For each supervisor:
1. Dashboard → confirm correct branch name in header
2. Daily Entry → set today's date → confirm salesmen from that branch appear
3. Edit a few cells (Jewelry/Bar/Qty) → confirm auto-save (status icon changes)
4. Reports → confirm % Hit and EOM Projection calculating

### Step D — Verify KPI Score calculation
1. Login admin → **KPI Settings**
2. Select **Jewelry Weight** → Global config → **Score Simulator**
3. Enter: Actual = 800g, Target = 1000g → click Simulate
4. Expected: PCT = 80% → Score = 80 pts ✅
5. Enter: Actual = 950g, Target = 1000g → Simulate
6. Expected: PCT = 95% → Score = 80 pts (hits ≥80% tier, not ≥100%) ✅
7. Enter: Actual = 1050g, Target = 1000g → Simulate
8. Expected: PCT = 105% → Score = 100 pts (≥100% tier) ✅

### Step E — Test per-branch KPI override
1. KPI Settings → Jewelry Weight → select branch: **Morning Market**
2. Click **New Config**
3. Add tiers: ≥100%→120pts, ≥80%→90pts, ≥60%→60pts, <60%→0pts
4. Save → Simulate with same values as Step D
5. MM branch now uses different multipliers than others ✅

### Step F — Executive view test
1. Login `ceo / ceo1234`
2. Executive View → should see all 4 branches in rankings
3. Branch Analytics → selling trends chart should show bars
4. Try to access Daily Entry → should redirect (no access) ✅

### Step G — Sync to Cloud (if Google Sheets configured)
1. Login admin → **Sync to Cloud** button (top right)
2. If not configured: error toast → go to Settings → configure Sheet ID + service account
3. If configured: shows "Synced X records" toast
4. Settings → Sync Logs → latest entry shows SUCCESS

---

## 6. Google Sheets Sync Setup

### One-time setup (Admin)

**Step 1 — Create a Google Cloud Service Account**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project (or use existing) → **Enable Google Sheets API**
3. IAM & Admin → Service Accounts → Create Service Account
4. Download JSON key → save to e.g. `C:\credentials\salestrack-sa.json`

**Step 2 — Share your Google Sheet with the service account**
1. Open your Google Sheet
2. Share → paste the service account email (from the JSON: `client_email` field)
3. Give **Editor** access

**Step 3 — Configure in app**
1. Login admin → **Settings**
2. External Sheet Sync section:
   - **Spreadsheet ID**: copy from Sheet URL — the long string between `/d/` and `/edit`
   - **Service Account JSON Path**: full path to the downloaded JSON file
3. Click **Save Config** → then **Force Sync**
4. Check Sync Log for SUCCESS

**Google Sheet tab structure expected:**
- `Entries` tab: app writes daily entries here (Date, Branch, SalesmanID, Name, Jewelry, Bar, Qty)
- `Roster` tab: optional — app can pull salesman list from here

---

## 7. Email Automation Setup

1. Login admin → **Settings** → Email Report Settings
2. **Recipients**: type email + press Enter to add
3. **Frequency**: Daily / Weekly / Monthly
4. **Dispatch Time**: 24h time (e.g. 08:00)
5. **SMTP settings** (example for Gmail):
   - Host: `smtp.gmail.com` · Port: `587`
   - User: your Gmail address
   - Password: Gmail App Password (not your Google password — generate at myaccount.google.com → Security → App Passwords)
   - From: same Gmail address
6. **Enable** toggle → ON
7. Click **Save All Changes**
8. Click **Send Test Email** to verify

---

## 8. Build Installer (.exe)

### One-time setup — Enable Windows Developer Mode
```
Windows Settings → System → For developers → Developer Mode → On
```
Or open terminal as Administrator.

### Build command
```powershell
cd "c:\Users\advice\KPV sale performance tracking"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist:win
```

Output file: `dist\SalesTrack Pro Setup 1.0.0.exe`

### What the installer does
- Standard Windows NSIS installer dialog
- User picks install directory (default: `C:\Program Files\SalesTrack Pro\`)
- Creates Start Menu + Desktop shortcuts
- Registers uninstaller in Windows Control Panel → Apps
- First launch creates DB at `%APPDATA%\SalesTrack Pro\data\salestrack.db`

### Distribute to other PCs
1. Copy `SalesTrack Pro Setup 1.0.0.exe` to target PC
2. Double-click → install
3. Launch → login as `admin / admin1234`
4. Admin goes to Settings → configure Google Sheets (if using cloud sync)
5. Admin goes to User Management → create accounts for supervisors

---

## 9. Data Backup & Reset

### Backup location
```
C:\Users\[username]\AppData\Roaming\SalesTrack Pro\data\salestrack.db
```

### Backup (copy the file)
```powershell
Copy-Item "$env:APPDATA\SalesTrack Pro\data\salestrack.db" "C:\Backup\salestrack_$(Get-Date -Format 'yyyyMMdd').db"
```

### Full reset (delete DB — app reseeds on next launch)
```powershell
Remove-Item "$env:APPDATA\SalesTrack Pro\data\salestrack.db"
```
> ⚠️ This deletes ALL data permanently. Back up first.

### Restore from backup
```powershell
Copy-Item "C:\Backup\salestrack_20260601.db" "$env:APPDATA\SalesTrack Pro\data\salestrack.db"
```

---

## Project File Structure
```
KPV sale performance tracking/
├── electron/               ← Electron main process (Node.js)
│   ├── main.ts             ← App window, IPC registration
│   ├── preload.ts          ← window.api bridge
│   ├── db/                 ← SQLite layer (sql.js WASM)
│   │   ├── connection.ts   ← DB init + persist
│   │   ├── schema.ts       ← Table definitions
│   │   ├── seed.ts         ← Default + test data
│   │   └── query.ts        ← better-sqlite3 API shim
│   └── ipc/                ← Business logic handlers
│       ├── auth.ts         ← Login, sessions, users
│       ├── entries.ts      ← Daily performance entry
│       ├── targets.ts      ← Monthly targets
│       ├── kpi.ts          ← Scoring engine
│       ├── reports.ts      ← Dashboard, monthly, executive
│       ├── sheets.ts       ← Google Sheets sync
│       ├── email.ts        ← Nodemailer + cron scheduler
│       └── admin.ts        ← Test data seeder
├── src/                    ← React renderer (UI)
│   ├── screens/            ← One folder per screen
│   ├── components/         ← Shared UI + layout
│   ├── store/              ← Zustand state (auth, app)
│   └── types/              ← TypeScript interfaces
├── resources/              ← icon.ico for installer
├── electron.vite.config.mjs
├── tailwind.config.ts      ← Design tokens (all colors, spacing)
├── electron-builder.yml    ← Windows installer config
└── README.md               ← This file
```
