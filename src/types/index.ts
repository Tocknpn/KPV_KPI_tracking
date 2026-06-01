// ── Auth ──────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'supervisor' | 'executive'

export interface AuthUser {
  id: number
  username: string
  fullName: string
  role: UserRole
  branchId: number | null
}

export interface Branch {
  id: number
  name: string
  code: string
}

export interface Salesman {
  id: number
  full_name: string
  nickname: string
  branch_id: number
  branch_name: string
  position: string
  department: string
  active: number
}

// ── Entries ───────────────────────────────────────────────────────────────
export interface DailyEntry {
  id: number
  salesman_id: number
  salesman_name: string
  nickname: string
  position: string
  entry_date: string
  jewelry_weight_g: number
  bar_weight_g: number
  quantity: number
  target_jewelry: number
  target_bar: number
  target_qty: number
  synced: number
}

// ── Targets ───────────────────────────────────────────────────────────────
export interface Target {
  salesman_id: number
  full_name: string
  nickname: string
  position: string
  target_id: number
  jewelry_weight_g: number
  bar_weight_g: number
  quantity: number
}

// ── KPI ───────────────────────────────────────────────────────────────────
export interface KpiMetric {
  id: number
  name: string
  unit: string
  color_token: string
  active: number
  display_order: number
}

export interface KpiTierConfig {
  id: number
  metric_id: number
  metric_name: string
  unit: string
  branch_id: number | null
  branch_name: string | null
  label: string
  effective_from: string
  effective_to: string | null
  is_active: number
}

export interface KpiTier {
  id: number
  config_id: number
  threshold_pct: number
  score: number
  tier_order: number
}

// ── Reports ───────────────────────────────────────────────────────────────
export interface DashboardStats {
  mtd: { total_jewelry: number; total_bar: number; total_qty: number }
  targets: { target_jewelry: number; target_bar: number; target_qty: number }
  projectedJewelry: number
  projectedBar: number
  projectedQty: number
  daysInMonth: number
  dayOfMonth: number
  kpiScoreJewelry: number
  kpiScoreBar: number
  kpiScoreQty: number
  topPerformers: Array<{
    id: number; full_name: string; nickname: string; position: string
    total_jewelry: number; total_bar: number; total_qty: number
  }>
}

export interface MonthlyReportRow {
  id: number
  full_name: string
  nickname: string
  position: string
  target_jewelry: number; target_bar: number; target_qty: number
  actual_jewelry: number; actual_bar: number; actual_qty: number
  pctJewelry: number; pctBar: number; pctQty: number; avgPct: number
  dailyNeeded: { jewelry: number; bar: number; qty: number }
  eomProjected: { jewelry: number; bar: number; qty: number }
  kpiScore: { jewelry: number; bar: number; qty: number }
}

export interface ExecutiveBranchRow {
  branch_id: number; branch_name: string; code: string
  actual_jewelry: number; actual_bar: number; actual_qty: number
  target_jewelry: number; target_bar: number; target_qty: number
}

export interface SyncLog {
  id: number; synced_at: string; direction: string
  records_count: number; status: string; error_message: string | null
}

export interface EmailConfig {
  id: number
  recipients: string[]
  frequency: string
  dispatch_time: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass: string
  from_address: string
  metrics: string[]
  enabled: number
}
