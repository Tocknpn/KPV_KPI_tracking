// Phase 0 dictionary — shared app chrome only (Sidebar nav, portal labels, TopBar).
// Wording for confirmed terms (Dashboard/KPI Report/Sale Report/Settings) pulled straight
// from USER_HANDBOOK_LAO.html so the app and the handbook never disagree on a term. The
// rest follow the same plain, direct register the handbook uses (not Thai-flavored).
export type Lang = 'en' | 'lo'

export const translations = {
  // Sidebar nav
  nav_dashboard:        { en: 'Dashboard',        lo: 'ໜ້າຫຼັກ' },
  nav_daily_entry:      { en: 'Daily Entry',      lo: 'ບັນທຶກຍອດຂາຍ' },
  nav_kpi_report:       { en: 'KPI Report',       lo: 'ລາຍງານ KPI' },
  nav_sale_report:      { en: 'Sale Report',      lo: 'ລາຍງານຍອດຂາຍ' },
  nav_upload_history:   { en: 'Upload History',   lo: 'ປະຫວັດການອັບໂຫລດ' },
  nav_roster:           { en: 'Roster',           lo: 'ບັນຊີພະນັກງານ' },
  nav_audit_log:        { en: 'Audit Log',        lo: 'ບັນທຶກການເຄື່ອນໄຫວ' },
  nav_settings:         { en: 'Settings',         lo: 'ການຕັ້ງຄ່າ' },
  nav_kpi_settings:     { en: 'KPI Settings',     lo: 'ການຕັ້ງຄ່າ KPI' },

  // Sidebar portal labels
  portal_admin:         { en: 'Admin Portal',               lo: 'ລະບົບແອດມິນ' },
  portal_executive:      { en: 'Executive Portal',           lo: 'ລະບົບຜູ້ບໍລິຫານ' },
  portal_manager:        { en: 'Manager Portal',             lo: 'ລະບົບຜູ້ຈັດການ' },
  portal_accountant_officer: { en: 'Accountant Officer Portal', lo: 'ລະບົບພະນັກງານບັນຊີ' },
  portal_accountant_manager: { en: 'Accountant Manager Portal', lo: 'ລະບົບຫົວໜ້າບັນຊີ' },
  portal_hr:             { en: 'HR Portal',                  lo: 'ລະບົບຝ່າຍບຸກຄະລາກອນ' },
  portal_supervisor:      { en: 'Supervisor Portal',          lo: 'ລະບົບຫົວໜ້າທີມ' },

  // TopBar
  sync_status:           { en: 'Sync Status',  lo: 'ສະຖານະການຊິ້ງຂໍ້ມູນ' },
  sync_live:             { en: 'Live',          lo: 'ອອນລາຍ' },
  sync_pending:          { en: 'pending',       lo: 'ກຳລັງລໍ' },
  sync_unsynced:         { en: 'unsynced',      lo: 'ຍັງບໍ່ໄດ້ຊິ້ງ' },
  topbar_refresh_tooltip: { en: 'Refresh data from Google Sheets', lo: 'ດຶງຂໍ້ມູນລ່າສຸດຈາກ Google Sheets' },
  topbar_logout:          { en: 'Logout',       lo: 'ອອກຈາກລະບົບ' },
  topbar_zoom_tooltip:    { en: 'UI zoom',      lo: 'ຂະຫນາດໜ້າຈໍ' },
  topbar_updated:         { en: 'Updated',      lo: 'ອັບເດດ' },

  // Language switch UI
  lang_button_label:      { en: 'EN',  lo: 'ລາວ' },
  lang_confirm_to_lo:      { en: 'Switch the whole app to Lao language?', lo: 'ສະຫຼັບແອັບທັງໝົດເປັນພາສາລາວ?' },
  lang_confirm_to_en:      { en: 'Switch the whole app to English?',      lo: 'ສະຫຼັບແອັບທັງໝົດເປັນພາສາອັງກິດ?' },

  // ── Phase 1: Dashboard ──────────────────────────────────────────────────
  dash_overview:           { en: 'Dashboard Overview', lo: 'ພາບລວມໜ້າຫຼັກ' },
  dash_all_branches:       { en: 'All Branches',       lo: 'ທຸກສາຂາ' },
  dash_my_branch:          { en: 'My Branch',          lo: 'ສາຂາຂອງຂ້ອຍ' },
  dash_branch_singular:    { en: 'Branch',             lo: 'ສາຂາ' },
  dash_branches_suffix:    { en: 'Branches',           lo: 'ສາຂາ' },
  dash_jewelry_mtd:        { en: 'Jewelry Weight (MTD)', lo: 'ນ້ຳໜັກຄຳ (ເດືອນນີ້)' },
  dash_bar_mtd:            { en: 'Bar Weight (MTD)',     lo: 'ນ້ຳໜັກຄຳແທ່ງ (ເດືອນນີ້)' },
  dash_qty_mtd:            { en: 'Quantity (MTD)',       lo: 'ຈຳນວນຊິ້ນ (ເດືອນນີ້)' },
  dash_unit_baht:          { en: 'Baht',  lo: 'ບາດ' },
  dash_unit_pcs:           { en: 'pcs',   lo: 'ຊິ້ນ' },
  dash_kpi_score:          { en: 'KPI Score',  lo: 'ຄະແນນ KPI' },
  dash_total_kpi:          { en: 'Total KPI',  lo: 'KPI ລວມ' },
  dash_pts:                { en: 'pts',        lo: 'ຄະແນນ' },
  dash_of_target:          { en: 'of',         lo: 'ຈາກ' },
  dash_target:             { en: 'target',     lo: 'ເປົ້າ' },
  dash_jewelry:            { en: 'Jewelry',    lo: 'ຄຳ' },
  dash_bar:                { en: 'Bar',        lo: 'ຄຳແທ່ງ' },
  dash_qty:                { en: 'Qty',        lo: 'ຈຳນວນ' },
  dash_top10_performers:   { en: 'Top 10 Performers', lo: '10 ອັນດັບຍອດຍິ່ງ' },
  dash_view_all:           { en: 'View All →',  lo: 'ເບິ່ງທັງໝົດ →' },
  dash_col_sales_member:   { en: 'Sales Member', lo: 'ພະນັກງານຂາຍ' },
  dash_col_position:       { en: 'Position',     lo: 'ຕຳແໜ່ງ' },
  dash_col_jewelry_baht:   { en: 'Jewelry (Baht)', lo: 'ຄຳ (ບາດ)' },
  dash_col_bar_baht:       { en: 'Bar (Baht)',     lo: 'ຄຳແທ່ງ (ບາດ)' },
  dash_col_qty:            { en: 'Qty',          lo: 'ຈຳນວນ' },
  dash_col_actual_pts:     { en: 'Actual Pts',   lo: 'ຄະແນນຕົວຈິງ' },
  dash_col_pct_kpi:        { en: '%KPI',         lo: '%KPI' },
  dash_sales_rep:          { en: 'Sales Rep',    lo: 'ພະນັກງານຂາຍ' },
  dash_no_entries:         { en: 'No entries for this period yet.', lo: 'ຍັງບໍ່ມີຂໍ້ມູນສຳລັບໄລຍະນີ້.' },
} satisfies Record<string, Record<Lang, string>>

export type TranslationKey = keyof typeof translations
