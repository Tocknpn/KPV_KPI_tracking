import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { MENU_KEYS, MENU_LABELS, ROLE_DEFAULTS, ROLE_LABELS } from '../../types'
import type { UserRole } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────
interface UserRow {
  id: number; username: string; full_name: string
  role: UserRole; branch_id: number | null; branch_name: string | null; active: number
}

interface FormState {
  username: string; password: string; fullName: string
  role: UserRole; branchId: string; active: number
}

// ── Constants ─────────────────────────────────────────────────────────────
const EMPTY_FORM: FormState = {
  username: '', password: '', fullName: '',
  role: 'sales_sup', branchId: '', active: 1,
}

const ROLES_NEEDING_BRANCH: UserRole[] = ['sales_sup', 'accountant', 'branch_manager']

const ROLE_BADGE_VARIANT: Record<UserRole, 'info' | 'gold' | 'neutral' | 'success'> = {
  admin:          'info',
  sales_sup:      'gold',
  accountant:     'neutral',
  branch_manager: 'gold',
  top_manager:    'info',
  hr:             'neutral',
}

const ROLE_AVATAR_COLOR: Record<UserRole, string> = {
  admin:          'bg-error',
  top_manager:    'bg-primary',
  branch_manager: 'bg-primary',
  accountant:     'bg-tertiary',
  sales_sup:      'bg-secondary',
  hr:             'bg-secondary',
}

const ALL_MENU_ITEMS = MENU_KEYS.map(key => ({ key, label: MENU_LABELS[key] }))

// ── Permission modal ───────────────────────────────────────────────────────
function PermissionModal({
  user, token, onClose,
}: { user: UserRow; token: string; onClose: () => void }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  const defaults = new Set<string>(ROLE_DEFAULTS[user.role] ?? [])

  useEffect(() => {
    window.api.getUserPermissions(token, user.id)
      .then((perms: string[]) => {
        const map: Record<string, boolean> = {}
        for (const k of MENU_KEYS) map[k] = perms.includes(k)
        setEnabled(map)
        setLoading(false)
      })
      .catch(console.error)
  }, [user.id])

  function resetToDefaults() {
    const map: Record<string, boolean> = {}
    for (const k of MENU_KEYS) map[k] = defaults.has(k)
    setEnabled(map)
  }

  async function handleSave() {
    setSaving(true)
    const allStates = MENU_KEYS.map(k => ({ menu_key: k, enabled: enabled[k] ?? false }))
    await window.api.saveUserPermissions(token, user.id, allStates)
    setSaving(false)
    setToast('Permissions saved')
    setTimeout(() => { setToast(''); onClose() }, 800)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Menu Permissions</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-label-md text-label-md text-on-surface-variant">{user.full_name}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary">{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-body-sm text-on-surface-variant mb-4">
          <span className="inline-block w-3 h-3 rounded bg-primary/20 mr-1" />Blue = role default · Toggle to override per user.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="material-symbols-outlined animate-spin-slow text-2xl text-primary">sync</span>
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {ALL_MENU_ITEMS.map(({ key, label }) => {
              const isDefault = defaults.has(key)
              const isOn = enabled[key] ?? false
              const isOverride = isOn !== isDefault
              return (
                <div
                  key={key}
                  onClick={() => setEnabled(p => ({ ...p, [key]: !p[key] }))}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors
                    ${isDefault ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-surface-container'}
                    ${isOverride ? 'ring-1 ring-secondary/40' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-label-md text-label-md text-on-surface">{label}</span>
                    {isDefault && <span className="text-[9px] font-bold uppercase text-primary/60">default</span>}
                    {isOverride && <span className="text-[9px] font-bold uppercase text-secondary">override</span>}
                  </div>
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                    <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all ${isOn ? 'left-[23px]' : 'left-[3px]'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {toast && (
          <div className="mt-3 bg-tertiary-container text-on-tertiary-container px-4 py-2 rounded-lg text-body-sm text-center font-bold">
            {toast}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={resetToDefaults}
            className="flex-1 py-2 rounded-lg border border-outline-variant text-on-surface-variant text-label-md hover:bg-surface-container transition-colors">
            Reset to Defaults
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-label-md flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-60 transition-all shadow-primary">
            {saving ? <span className="material-symbols-outlined text-sm animate-spin-slow">sync</span> : <span className="material-symbols-outlined text-sm">save</span>}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function UserManagement() {
  const { token, branches } = useAuthStore()
  const [users, setUsers]     = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null)
  const [permUser, setPermUser] = useState<UserRow | null>(null)
  const [editId, setEditId]   = useState<number | null>(null)
  const [form, setForm]       = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [toast, setToast]     = useState('')
  const [showPwd, setShowPwd] = useState(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    if (!token) return
    setLoading(true)
    const data = await window.api.getUsers(token) as UserRow[]
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  function openCreate() {
    setForm(EMPTY_FORM); setEditId(null); setError(''); setShowPwd(false); setModal('create')
  }

  function openEdit(u: UserRow) {
    setForm({ username: u.username, password: '', fullName: u.full_name, role: u.role, branchId: String(u.branch_id ?? ''), active: u.active })
    setEditId(u.id); setError(''); setShowPwd(false); setModal('edit')
  }

  function closeModal() { setModal(null); setError(''); setShowPwd(false) }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!token) return
    if (!form.username.trim() || !form.fullName.trim()) { setError('Username and full name required.'); return }
    if (modal === 'create' && !form.password) { setError('Password required for new user.'); return }
    if (ROLES_NEEDING_BRANCH.includes(form.role) && !form.branchId) {
      setError(`Branch is required for ${ROLE_LABELS[form.role]} role.`); return
    }

    setSaving(true); setError('')
    try {
      if (modal === 'create') {
        const res = await window.api.createUser(token, {
          username:  form.username.trim(),
          password:  form.password,
          fullName:  form.fullName.trim(),
          role:      form.role,
          branchId:  form.branchId ? Number(form.branchId) : null,
        })
        if (!res.success) { setError(res.error ?? 'Failed to create user'); return }
        showToast(`User "${form.username}" created.`)
      } else if (modal === 'edit' && editId) {
        await window.api.updateUser(token, editId, {
          fullName:  form.fullName.trim(),
          role:      form.role,
          branchId:  form.branchId ? Number(form.branchId) : null,
          active:    form.active,
          ...(form.password ? { password: form.password } : {}),
        })
        showToast(`User "${form.username}" updated.`)
      }
      closeModal(); load()
    } finally { setSaving(false) }
  }

  async function handleDeactivate(u: UserRow) {
    if (!token) return
    if (!confirm(`Deactivate user "${u.username}"? They cannot log in until restored.`)) return
    await window.api.deleteUser(token, u.id)
    showToast(`User "${u.username}" deactivated.`); load()
  }

  async function handleRestore(u: UserRow) {
    if (!token) return
    await window.api.updateUser(token, u.id, { active: 1 })
    showToast(`User "${u.username}" restored.`); load()
  }

  const needsBranch = ROLES_NEEDING_BRANCH.includes(form.role)

  // Grouped users for display
  const active   = users.filter(u => u.active)
  const inactive = users.filter(u => !u.active)

  return (
    <AppShell title="User Management" allowedRoles={['admin']}>
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in text-body-sm">
          {toast}
        </div>
      )}

      {/* Permission modal (layered above user modal) */}
      {permUser && (
        <PermissionModal user={permUser} token={token!} onClose={() => { setPermUser(null); load() }} />
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">User Management</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {active.length} active · {inactive.length} deactivated · 6 roles available
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-error-container/30 rounded-xl">
            <span className="material-symbols-outlined text-error text-sm">admin_panel_settings</span>
            <span className="font-label-md text-label-md text-error">Admin Only</span>
          </div>
          <button onClick={openCreate}
            className="bg-primary text-white px-5 py-2.5 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-primary">
            <span className="material-symbols-outlined text-sm">person_add</span>
            Add User
          </button>
        </div>
      </div>

      {/* User Table */}
      <GlassCard elevated className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {['User','Full Name','Role','Branch','Status','Actions'].map(h => (
                  <th key={h} className="px-5 py-4 text-left font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin-slow text-2xl block mx-auto mb-2">sync</span>
                  Loading users...
                </td></tr>
              ) : users.map(u => (
                <tr key={u.id} className={`transition-colors group hover:bg-surface-container/20 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase ${ROLE_AVATAR_COLOR[u.role] ?? 'bg-primary'}`}>
                        {u.username.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-bold text-body-sm">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-body-sm">{u.full_name}</td>
                  <td className="px-5 py-3">
                    <StatusBadge label={ROLE_LABELS[u.role] ?? u.role} variant={ROLE_BADGE_VARIANT[u.role] ?? 'neutral'} />
                  </td>
                  <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                    {u.branch_name ?? <span className="italic text-on-surface-variant/50">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {u.active
                      ? <StatusBadge label="Active" variant="success" />
                      : <StatusBadge label="Inactive" variant="error" />}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(u)} title="Edit user"
                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => setPermUser(u)} title="Edit permissions"
                        className="p-1.5 text-secondary hover:bg-secondary/10 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-sm">key</span>
                      </button>
                      {u.active ? (
                        <button onClick={() => handleDeactivate(u)} title="Deactivate"
                          className="p-1.5 text-error hover:bg-error-container/30 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-sm">person_off</span>
                        </button>
                      ) : (
                        <button onClick={() => handleRestore(u)} title="Restore"
                          className="p-1.5 text-tertiary hover:bg-tertiary-fixed/30 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-sm">person</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Role legend */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
        {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
          <div key={role} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${ROLE_AVATAR_COLOR[role]}`} />
            <span><strong>{label}</strong> — {ROLE_DEFAULTS[role].join(', ').replaceAll('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-slide-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                {modal === 'create' ? 'Create New User' : `Edit — ${form.username}`}
              </h3>
              <button onClick={closeModal} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-5">
              {/* Full Name */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">Full Name *</label>
                <input type="text" value={form.fullName} onChange={e => setField('fullName', e.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
                  placeholder="e.g. Somchai Phommachan" autoFocus />
              </div>

              {/* Username */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">Username *</label>
                <input type="text" value={form.username}
                  onChange={e => setField('username', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  readOnly={modal === 'edit'}
                  className={`w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none ${modal === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="e.g. sup_mm" />
              </div>

              {/* Password */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">
                  Password {modal === 'edit' && <span className="text-on-surface-variant font-normal">(leave blank to keep)</span>}
                </label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 pr-10 text-body-sm outline-none"
                    placeholder={modal === 'create' ? 'Set a password' : '••••• (unchanged)'} />
                  <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-sm">{showPwd ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="font-label-md text-label-md block mb-2 text-primary">Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                    <button key={r} type="button"
                      onClick={() => {
                        setField('role', r)
                        if (!ROLES_NEEDING_BRANCH.includes(r)) setField('branchId', '')
                      }}
                      className={`py-2 px-1 rounded-lg font-label-md text-[11px] border transition-all ${form.role === r ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary'}`}>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Branch */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">
                  Branch {needsBranch ? '*' : <span className="text-on-surface-variant font-normal">(not required)</span>}
                </label>
                <select value={form.branchId} onChange={e => setField('branchId', e.target.value)}
                  disabled={!needsBranch}
                  className={`w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none ${!needsBranch ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <option value="">— Select branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Active toggle (edit only) */}
              {modal === 'edit' && (
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-primary">Active Account</span>
                  <button type="button" onClick={() => setField('active', form.active ? 0 : 1)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${form.active ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                    <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200 ${form.active ? 'left-[27px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-error-container text-on-error-container px-4 py-3 rounded-lg text-body-sm">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-60 shadow-primary">
                {saving ? <span className="material-symbols-outlined text-sm animate-spin-slow">sync</span> : <span className="material-symbols-outlined text-sm">save</span>}
                {modal === 'create' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
