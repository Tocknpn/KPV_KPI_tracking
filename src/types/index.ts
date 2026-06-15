// ── Auth ──────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'sales_sup' | 'accountant' | 'branch_manager' | 'top_manager' | 'hr'

export const MENU_KEYS = [
  'dashboard', 'daily_entry', 'kpi_report', 'sale_report', 'analytics',
  'upload_history', 'upload_status', 'kpi_settings', 'audit_log', 'user_management', 'settings',
] as const
export type MenuKey = typeof MENU_KEYS[number]

export const MENU_LABELS: Record<MenuKey, string> = {
  dashboard:       'Dashboard',
  daily_entry:     'Daily Entry Upload',
  kpi_report:      'KPI Report',
  sale_report:     'Sale Report',
  analytics:       'Analytics',
  upload_history:  'Upload History',
  upload_status:   'Upload Status',
  kpi_settings:    'KPI Settings',
  audit_log:       'Audit Log',
  user_management: 'User Management',
  settings:        'Settings',
}

export const ROLE_DEFAULTS: Record<UserRole, MenuKey[]> = {
  admin:          ['dashboard','daily_entry','kpi_report','sale_report','analytics','upload_history','upload_status','kpi_settings','audit_log','user_management','settings'],
  sales_sup:      ['dashboard','kpi_report','upload_status'],
  accountant:     ['dashboard','daily_entry','sale_report','upload_history','upload_status'],
  branch_manager: ['dashboard','kpi_report','sale_report','upload_status'],
  top_manager:    ['dashboard','kpi_report','sale_report','analytics'],
  hr:             ['upload_history','kpi_settings'],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin:          'Admin',
  sales_sup:      'Sales Supervisor',
  accountant:     'Accountant',
  branch_manager: 'Branch Manager',
  top_manager:    'Top Manager',
  hr:             'HR',
}

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
  rep_code: string | null
  full_name: string
  nickname: string
  branch_id: number
  branch_name: string
  position: string
  department: string
  active: number
  staff_type: 'b2c' | 'b2b'
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
  rep_code: string | null
  full_name: string
  nickname: string
  position: string
  branch_id: number
  branch_name: string
  supervisor_name: string | null
  staff_type: string
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
  staff_type?: string
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
  staff_type: string
  rep_count: number
  team_total_score: number
  team_kpi_pct: number
  sup_kpi_pct: number
  sup_score: number
  sup_kpi_pct_ach: number
  branch_target: number
}

export interface CommissionConfig {
  id: number
  staff_type: string
  year_month: string
  jewelry_rate_lak: number
  bar_rate_lak: number
  qty_rate_lak: number
  created_at: string
}

export interface CommissionReportRow {
  id: number
  full_name: string
  nickname: string
  staff_type: string
  branch_id: number
  branch_name: string
  branch_code: string
  supervisor_name: string | null
  actual_jewelry: number
  actual_bar: number
  actual_qty: number
  commission_lak: number
  rate_applied: { jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number } | null
}

export interface CommissionSupervisorRow {
  id: number
  full_name: string
  nickname: string
  staff_type: string
  branch_id: number
  branch_name: string
  branch_code: string
  team_commission_lak: number
  supervisor_commission_lak: number
  sup_pct: number
}

export interface RepHistoryPoint {
  year: number; month: number; year_month: string
  actual_jewelry: number; actual_bar: number; actual_qty: number
  kpi_score_jewelry: number; kpi_score_bar: number; kpi_score_qty: number
  kpi_total_score: number; kpi_pct: number
  point_target: number; days_with_entries: number; commission_lak: number
}

export interface RepDailyEntry {
  entry_date: string
  jewelry_weight_g: number
  bar_weight_g: number
  quantity: number
}

export interface RepHistoryProfile {
  id: number; rep_code: string; full_name: string; nickname: string
  branch_id: number; branch_name: string; branch_code: string
  supervisor_id: number | null; supervisor_name: string | null
  staff_type: string; active: number
  history: RepHistoryPoint[]
}

export interface SupHistoryPoint {
  year: number; month: number; year_month: string
  actual_jewelry: number; actual_bar: number; actual_qty: number
  team_total_score: number; team_kpi_pct: number; team_point_target: number
  rep_count: number
}

export interface SupHistoryProfile {
  id: number; full_name: string; nickname: string
  branch_id: number; branch_name: string; branch_code: string
  staff_type: string; active: number; rep_count: number
  history: SupHistoryPoint[]
}

export interface RosterRow {
  id: number
  rep_code: string
  full_name: string
  nickname: string
  branch_id: number
  branch_name: string
  branch_code: string
  supervisor_id: number | null
  supervisor_name: string | null
  staff_type: 'b2c' | 'b2b'
  active: number
  year_month: string | null
  point_target: number | null
}

export interface StaffMonthlyTarget {
  id: number
  salesman_id: number
  year_month: string
  point_target: number
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
