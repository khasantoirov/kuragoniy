import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { homePathFor, useAuth } from '@/lib/auth/AuthContext'
import { useViewAs, useViewAsUser } from '@/lib/viewAs'
import { useUIStore } from '@/store/uiStore'

import './role.css'

// the pupil picker belongs to Sozlamalar → Ko'rish rejimi; its own chunk
const ViewAsPupilModal = lazy(() => import('@/features/settings/ViewAsPupilModal').then((m) => ({ default: m.ViewAsPupilModal })))

/* Dasturchi → Rol: the developer looks at the platform as another role —
   their own account as Admin or Boshliq, or a chosen teacher, pupil,
   school ma'muriyat or kuzatuvchi exactly as that person sees it. Read-only
   on the server (backend common/viewas.py; pupils: view_as_pupil). */

type PersonRole = 'teacher' | 'maktab' | 'kuzatuvchi'
type Pick = 'dev' | 'role:admin' | 'role:boshliq' | PersonRole | 'student'

const CHOICES: { k: Pick; label: string; sub: string; icon: keyof typeof IC }[] = [
  { k: 'dev', label: 'Dasturchi', sub: "O'z hisobingiz — hamma narsa", icon: 'settings' },
  { k: 'role:admin', label: 'Admin', sub: "Ma'muriyat oynasi (o'z hisobingizda)", icon: 'shield' },
  { k: 'role:boshliq', label: 'Boshliq', sub: "Rahbar oynasi (o'z hisobingizda)", icon: 'chart' },
  { k: 'teacher', label: "O'qituvchi", sub: "Tanlangan o'qituvchi ko'rgandek", icon: 'user' },
  { k: 'student', label: "O'quvchi", sub: "Sinf → o'quvchi, uning oynasi", icon: 'cap' },
  { k: 'maktab', label: 'Direktor/zavuch', sub: "Hamkor maktab ma'muriyati", icon: 'school' },
  { k: 'kuzatuvchi', label: 'Kuzatuvchi', sub: 'Inspektor / metodist', icon: 'eye' },
]

interface Person {
  id: string
  name: string
  role: string
  subjects: string[]
  schools: string[]
}

/** Switching the view: nothing of the previous one stays in the cache, the
 *  signed-in user is fetched again (the server now answers as the viewed
 *  account) and the app opens that account's home. */
function useSwitchView() {
  const { refreshMe } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const setView = useViewAsUser((s) => s.set)
  const clearView = useViewAsUser((s) => s.clear)
  const stopPupil = useViewAs((s) => s.stop)

  const reload = async () => {
    queryClient.clear()
    const me = await refreshMe()
    navigate(homePathFor(me), { replace: true })
  }
  return {
    enter: async (key: string) => {
      const res = await api.post<{ key: string; label: string }>('/accounts/view-as/', { key })
      stopPupil()
      setView(res.data)
      await reload()
    },
    leave: async () => {
      clearView()
      stopPupil()
      await reload()
    },
  }
}

/** The top bar's "Rol" button — the developer's only (and, while looking
 *  through someone, the way back). */
export function RoleSwitch() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user || !(user.is_dev_superuser || user.viewing)) return null
  return (
    <>
      <button type="button" className={`roleswitch ${user.viewing ? 'is-viewing' : ''}`} onClick={() => setOpen(true)}
        title={t('Rolni almashtirish')} aria-label={t('Rolni almashtirish')}>
        {IC.eye}
        <span>{user.viewing ? t('Ko\'rinish') : t('Rol')}</span>
      </button>
      {open && <RolePicker onClose={() => setOpen(false)} />}
      {user.viewing && <ViewingBar label={user.viewing.label} onPick={() => setOpen(true)} />}
    </>
  )
}

/** The strip that says whose window this is, on every page while viewing. */
function ViewingBar({ label, onPick }: { label: string; onPick: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { leave } = useSwitchView()
  const [busy, setBusy] = useState(false)
  return createPortal(
    <div className="viewbar" role="status">
      <span className="viewbar__ic" aria-hidden="true">{IC.eye}</span>
      <span className="viewbar__t">
        <b>{label}</b>
        <small>{t("Ko'rinish rejimi — faqat ko'rish")}</small>
      </span>
      <button type="button" className="viewbar__b" onClick={onPick}>{t('Almashtirish')}</button>
      <button type="button" className="viewbar__b viewbar__b--out" disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await leave()
          } catch (err) {
            toast(t(errText(err)), 'error')
          }
          setBusy(false)
        }}>
        {IC.close} {t('Chiqish')}
      </button>
    </div>,
    document.body,
  )
}

function RolePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { user } = useAuth()
  const { enter, leave } = useSwitchView()
  const [role, setRole] = useState<PersonRole | null>(null)
  const [pupils, setPupils] = useState(false)
  const [busy, setBusy] = useState(false)
  const current: Pick = user?.viewing
    ? (user.viewing.key.startsWith('role:') ? (user.viewing.key as Pick) : (user.role as Pick))
    : 'dev'

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try {
      await job()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }

  const choose = async (k: Pick) => {
    if (k === 'dev') return run(leave)
    if (k === 'role:admin' || k === 'role:boshliq') return run(() => enter(k))
    if (k === 'student') {
      // the pupil view is the administration's own (Ko'rish rejimi): it runs
      // from the developer's account, so step out of any other view first
      setBusy(true)
      try {
        if (user?.viewing) await leave()
        setPupils(true)
      } catch (err) {
        toast(t(errText(err)), 'error')
      }
      setBusy(false)
      return
    }
    setRole(k)
  }

  if (pupils) {
    return (
      <Suspense fallback={null}>
        <ViewAsPupilModal onClose={() => { setPupils(false); onClose() }} />
      </Suspense>
    )
  }

  if (role) return <PersonPicker role={role} busy={busy} onBack={() => setRole(null)} onClose={onClose}
    onPick={(id) => run(() => enter(id))} />

  return (
    <Modal title={t('Rol tanlash')} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>{t('Yopish')}</button>}>
      <p className="prose prose--note">
        {t("Platformani boshqa rol ko'zi bilan ko'rasiz. Dasturchidan boshqa har qanday ko'rinishda server hech narsani o'zgartirmaydi — faqat ko'rish.")}
      </p>
      <div className="rolepick">
        {CHOICES.map((c) => (
          <button key={c.k} type="button" className={`rolepick__c ${current === c.k ? 'is-on' : ''}`} disabled={busy}
            onClick={() => choose(c.k)}>
            <span className="rolepick__ic" aria-hidden="true">{IC[c.icon]}</span>
            <span className="rolepick__t">
              <b>{t(c.label)}</b>
              <small>{t(c.sub)}</small>
            </span>
            {current === c.k ? <span className="rolepick__now">{t('hozir')}</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  )
}

const PERSON_TITLES: Record<PersonRole, string> = {
  teacher: "O'qituvchini tanlang",
  maktab: 'Direktor/zavuchni tanlang',
  kuzatuvchi: 'Kuzatuvchini tanlang',
}

function PersonPicker({ role, busy, onBack, onClose, onPick }: {
  role: PersonRole
  busy: boolean
  onBack: () => void
  onClose: () => void
  onPick: (id: string) => void
}) {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['view-as', role, fan],
    queryFn: async () => (await api.get<Person[]>('/accounts/view-as/', { params: { role } })).data,
  })
  const needle = q.trim().toLowerCase()
  const people = (data ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle)
    || p.schools.some((s) => s.toLowerCase().includes(needle)))

  return (
    <Modal title={t(PERSON_TITLES[role])} onClose={onClose}
      footer={<button className="btn" onClick={onBack}>{IC.back} {t('Orqaga')}</button>}>
      {role === 'teacher' && (
        <p className="prose prose--note">{t("Shu fan oynasidagi o'qituvchilar. Uning jurnali, jadvali va sahifalari u ko'rgandek ochiladi — faqat ko'rish.")}</p>
      )}
      <div className="search">
        <span className="search__ic" aria-hidden="true">{IC.search}</span>
        <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ism bo\'yicha qidirish…')} autoComplete="off" />
      </div>
      {isLoading ? <Skeleton lines={4} /> : people.length ? (
        <ul className="viewas-pick">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" className="viewas-pick__b" disabled={busy} onClick={() => onPick(p.id)}>
                <b>{p.name}</b>
                {p.schools.length > 0 && <span className="muted"> — {p.schools.join(', ')}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="prose prose--note">{t("Bu rolda hech kim yo'q.")}</p>
      )}
    </Modal>
  )
}
