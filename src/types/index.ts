// ── Auth ──────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'supervisor' | 'branch_manager' | 'executive'

export interface AuthUser {
  id: number
  username: string
  fullName: string
  role: UserRole
  branchId: number | null
  supervisorId: number | null
}

export interface Branch {
  id: number
  name: string
  code: string
  kpi_point_target: number
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
  supervisor_name?: string
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
  synced: number
  supervisor_name?: string
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
  points_per_unit: number
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
  daysInMonth: number
  dayOfMonth: number
  kpiScoreJewelry: number
  kpiScoreBar: number
  kpiScoreQty: number
  kpiTotalScore: number
  kpiPointTarget: number
  kpiPct: number
  topPerformers: Array<{
    id: number; full_name: string; nickname: string; position: string
    total_jewelry: number; total_bar: number; total_qty: number
    kpi_total_score: number; kpi_pct: number
  }>
}

export interface MonthlyReportRow {
  id: number
  full_name: string
  nickname: string
  position: string
  branch_id: number
  branch_name: string
  supervisor_name: string | null
  actual_jewelry: number
  actual_bar: number
  actual_qty: number
  kpiPointTarget: number
  kpiScore: { jewelry: number; bar: number; qty: number; total: number; pct: number }
  eomKpiPct: number
}

export interface ExecutiveBranchRow {
  branch_id: number; branch_name: string; code: string
  actual_jewelry: number; actual_bar: number; actual_qty: number
  kpi_score_jewelry: number; kpi_score_bar: number; kpi_score_qty: number
  kpi_total_score: number
  kpi_point_target: number
  per_person_target: number
  kpi_pct: number
  person_count: number
}

export interface Supervisor {
  id: number
  full_name: string
  nickname: string
  branch_id: number
  branch_name: string
  rep_count: number
  active: number
}

export interface SalesmanBrief {
  id: number
  full_name: string
  nickname: string
  position: string
  supervisor_id: number | null
  supervisor_name: string | null
}

export interface TeamPerformanceRow {
  id: number
  full_name: string
  nickname: string
  branch_id: number
  branch_name: string
  rep_count: number
  team_total_score: number
  team_kpi_pct: number
  sup_kpi_pct: number
  sup_score: number
  sup_kpi_pct_ach: number
  branch_target: number
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
