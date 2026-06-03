import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'

interface UserRow {
  id: number; username: string; full_name: string
  role: string; branch_id: number | null; branch_name: string | null; active: number
}

interface FormState {
  username: string; password: string; fullName: string
  role: string; branchId: string; active: number
}

const EMPTY_FORM: FormState = { username: '', password: '', fullName: '', role: 'supervisor', branchId: '', active: 1 }

const ROLE_BADGE: Record<string, 'info' | 'gold' | 'neutral'> = {
  admin: 'info', supervisor: 'gold', executive: 'neutral'
}

export default function UserManagement() {
  const { token, branches } = useAuthStore()
  const [users, setUsers]     = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<'create' | 'edit' | null>(null)
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
    if ((form.role === 'supervisor') && !form.branchId) { setError('Supervisor must have a branch assigned.'); return }

    setSaving(true); setError('')
    try {
      if (modal === 'create') {
        const res = await window.api.createUser(token, {
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          branchId: form.branchId ? Number(form.branchId) : null,
        })
        if (!res.success) { setError(res.error ?? 'Failed to create user'); return }
        showToast(`User "${form.username}" created.`)
      } else if (modal === 'edit' && editId) {
        await window.api.updateUser(token, editId, {
          fullName: form.fullName.trim(),
          role: form.role,
          branchId: form.branchId ? Number(form.branchId) : null,
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
        })
        showToast(`User "${form.username}" updated.`)
      }
      closeModal()
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u: UserRow) {
    if (!token) return
    if (!confirm(`Deactivate user "${u.username}"? They will no longer be able to log in.`)) return
    await window.api.deleteUser(token, u.id)
    showToast(`User "${u.username}" deactivated.`)
    load()
  }

  async function handleRestore(u: UserRow) {
    if (!token) return
    await window.api.updateUser(token, u.id, { active: 1 })
    showToast(`User "${u.username}" restored.`)
    load()
  }

  const needsBranch = form.role === 'supervisor'

  return (
    <AppShell title="User Management" allowedRoles={['admin']}>
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in text-body-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">User Management</h2>
          <p className="text-on-surface-variant text-body-md mt-1">
            {users.filter(u => u.active).length} active users · {users.filter(u => !u.active).length} deactivated
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-error-container/30 rounded-xl mr-4">
          <span className="material-symbols-outlined text-error text-sm">admin_panel_settings</span>
          <span className="font-label-md text-label-md text-error">Admin Only</span>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary text-white px-5 py-2.5 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-primary"
        >
          <span className="material-symbols-outlined text-sm">person_add</span>
          Add User
        </button>
      </div>

      {/* User Table */}
      <GlassCard elevated className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                {['User','Full Name','Role','Branch','Status','Actions'].map(h => (
                  <th key={h} className="px-6 py-4 text-left font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
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
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-error' : u.role === 'executive' ? 'bg-primary' : 'bg-secondary'}`}>
                        {u.username.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-bold text-body-sm">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-body-sm">{u.full_name}</td>
                  <td className="px-6 py-3">
                    <StatusBadge label={u.role} variant={ROLE_BADGE[u.role] ?? 'neutral'} />
                  </td>
                  <td className="px-6 py-3 text-body-sm text-on-surface-variant">
                    {u.branch_name ?? <span className="italic text-on-surface-variant/50">All branches</span>}
                  </td>
                  <td className="px-6 py-3">
                    {u.active
                      ? <StatusBadge label="Active" variant="success" />
                      : <StatusBadge label="Inactive" variant="error" />}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      {u.active ? (
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 text-error hover:bg-error-container/30 rounded-lg transition-colors"
                          title="Deactivate"
                        >
                          <span className="material-symbols-outlined text-sm">person_off</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(u)}
                          className="p-1.5 text-tertiary hover:bg-tertiary-fixed/30 rounded-lg transition-colors"
                          title="Restore"
                        >
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

      {/* Role Legend */}
      <div className="mt-6 flex gap-6 text-body-sm text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-error inline-block" />
          <span><strong>Admin</strong> — full access incl. KPI Settings &amp; User Management</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-secondary inline-block" />
          <span><strong>Supervisor</strong> — branch-level: entry, reports, settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-primary inline-block" />
          <span><strong>Executive</strong> — read-only: analytics &amp; executive view</span>
        </div>
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
                <input
                  type="text"
                  value={form.fullName}
                  onChange={e => setField('fullName', e.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
                  placeholder="e.g. Somchai Phommachan"
                  autoFocus
                />
              </div>

              {/* Username — only editable on create */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setField('username', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  readOnly={modal === 'edit'}
                  className={`w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none ${modal === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  placeholder="e.g. sup_mm"
                />
              </div>

              {/* Password */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">
                  Password {modal === 'edit' && <span className="text-on-surface-variant font-normal">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 pr-10 text-body-sm outline-none"
                    placeholder={modal === 'create' ? 'Set a password' : '••••••• (unchanged)'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showPwd ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="font-label-md text-label-md block mb-2 text-primary">Role *</label>
                <div className="flex gap-2">
                  {(['supervisor', 'executive', 'admin'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => { setField('role', r); if (r !== 'supervisor') setField('branchId', '') }}
                      className={`flex-1 py-2 rounded-lg font-label-md text-label-md capitalize border transition-all ${form.role === r ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Branch — only for supervisor */}
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">
                  Branch {needsBranch ? '*' : <span className="text-on-surface-variant font-normal">(not required for admin/executive)</span>}
                </label>
                <select
                  value={form.branchId}
                  onChange={e => setField('branchId', e.target.value)}
                  disabled={!needsBranch}
                  className={`w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none ${!needsBranch ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <option value="">— Select branch —</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Active toggle (edit only) */}
              {modal === 'edit' && (
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-primary">Active Account</span>
                  <button
                    type="button"
                    onClick={() => setField('active', form.active ? 0 : 1)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${form.active ? 'bg-primary' : 'bg-surface-container-highest'}`}
                  >
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
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant font-label-md hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-primary text-white font-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-60 shadow-primary"
              >
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
