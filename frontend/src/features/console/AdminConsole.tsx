import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { RoleBadge } from '@/components/RoleBadge'
import { Skeleton } from '@/components/Skeleton'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { MAIN_ORIGIN } from '@/lib/adminHost'
import { useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useStaffList } from '@/features/admin/staffApi'
import './console.css'
import './i18n'

/* admin.kuragoniy.uz — the Boshqaruv paneli: the administration's
   settings as a console of its own (side menu, one section at a time).
   The everyday work (Darslar, Jurnal, Jadval, Statistika) stays on
   kuragoniy.uz; "Platformaga o'tish" goes there. */

function named<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const AdminPage = named(() => import('@/features/admin/AdminPage'), 'AdminPage')
const AdminDataPanel = named(() => import('@/features/admin/AdminPage'), 'AdminDataPanel')
const RolesPage = named(() => import('@/features/admin/RolesPage'), 'RolesPage')
const ModulesPanel = named(() => import('@/features/admin/ModulesPanel'), 'ModulesPanel')
const ProtectionPanel = named(() => import('@/features/admin/ProtectionPanel'), 'ProtectionPanel')
const LicencesPanel = named(() => import('@/features/admin/LicencesPanel'), 'LicencesPanel')
const AcademicYearsPanel = named(() => import('@/features/admin/AcademicYearsPanel'), 'AcademicYearsPanel')
const SitePanel = named(() => import('@/features/admin/SitePanel'), 'SitePanel')
const SecurityLogPage = named(() => import('@/features/manage/ManagePages'), 'SecurityLogPage')

interface Section {
  slug: string
  label: string
  sub: string
  icon: keyof typeof IC
  page: ReactNode
}

const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: 'Odamlar',
    items: [
      { slug: 'foydalanuvchilar', label: 'Foydalanuvchilar', sub: "Xodimlar va o'quvchilar, rol bo'yicha", icon: 'users', page: <AdminPage /> },
      { slug: 'rollar', label: 'Rollar', sub: 'Har bir rol va uning vakolatlari', icon: 'shield', page: <RolesPage /> },
    ],
  },
  {
    title: "O'quv jarayoni",
    items: [
      { slug: 'malumot', label: "Ma'lumot", sub: "Choraklar, darslar importi, e'lonlar", icon: 'file', page: <AdminDataPanel /> },
      { slug: 'yillar', label: "O'quv yillari", sub: "O'quv yili va choraklar sanalari", icon: 'calendar', page: <AcademicYearsPanel /> },
    ],
  },
  {
    title: 'Platforma',
    items: [
      { slug: 'modullar', label: 'Modullar', sub: "Bo'limlarni yoqish va o'chirish", icon: 'grid', page: <ModulesPanel /> },
      { slug: 'himoya', label: 'Himoya', sub: 'Suv belgisi va skrinshotdan himoya', icon: 'lock', page: <ProtectionPanel /> },
      { slug: 'litsenziyalar', label: 'Litsenziyalar', sub: 'Hamkor maktablar litsenziyalari', icon: 'cards', page: <LicencesPanel /> },
      { slug: 'sayt', label: 'Sayt', sub: 'kuragoniy.uz bosh sahifasi va arizalar', icon: 'globe', page: <SitePanel /> },
    ],
  },
  {
    title: 'Xavfsizlik',
    items: [
      { slug: 'xavfsizlik', label: 'Xavfsizlik jurnali', sub: 'Kirishlar va muhim amallar', icon: 'eye', page: <SecurityLogPage /> },
    ],
  },
]

const SECTIONS = GROUPS.flatMap((g) => g.items)
export const FIRST_SECTION = SECTIONS[0].slug

export function AdminConsole() {
  const { t } = useTranslation()
  const { bolim } = useParams()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useUIStore()
  const [menuOpen, setMenuOpen] = useState(false)
  // people waiting for approval, beside Foydalanuvchilar
  const { data: staff } = useStaffList()
  const waiting = (staff ?? []).filter((u) => !u.approved && u.role !== 'admin' && u.role !== 'boshliq').length

  const section = SECTIONS.find((s) => s.slug === bolim)

  useEffect(() => {
    // the panel has its own accent, whichever fan window was last open
    document.documentElement.setAttribute('data-fan', 'panel')
  }, [])
  useEffect(() => {
    document.title = section ? `${t(section.label)} — ${t('Boshqaruv paneli')}` : t('Boshqaruv paneli')
    setMenuOpen(false)
  }, [section, t])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  if (!section) return <Navigate to={`/${FIRST_SECTION}`} replace />

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`acon ${menuOpen ? 'is-menu' : ''}`}>
      <aside className="acon__side" aria-label={t('Boshqaruv paneli')}>
        <div className="acon__brand">
          <img src="/logo.png" alt="" width={36} height={36} />
          <span>
            <b>KO'RAGONIY EDU</b>
            <small>{t('Boshqaruv paneli')}</small>
          </span>
          <button type="button" className="acon__x" aria-label={t('Yopish')} onClick={() => setMenuOpen(false)}>{IC.close}</button>
        </div>

        <nav className="acon__nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="acon__group">
              <p className="acon__gt">{t(g.title)}</p>
              {g.items.map((s) => (
                <NavLink key={s.slug} to={`/${s.slug}`} className={({ isActive }) => `acon__link ${isActive ? 'is-on' : ''}`}>
                  <span className="acon__ic" aria-hidden="true">{IC[s.icon]}</span>
                  <span className="acon__lt">{t(s.label)}</span>
                  {s.slug === 'foydalanuvchilar' && waiting > 0 && (
                    <span className="acon__badge" title={t('Tasdiq kutmoqda')}>{waiting}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <a className="acon__site" href={MAIN_ORIGIN}>
          <span className="acon__ic" aria-hidden="true">{IC.external}</span>
          <span>{t("Platformaga o'tish")}</span>
        </a>
      </aside>
      <button type="button" className="acon__scrim" aria-label={t('Yopish')} tabIndex={-1} onClick={() => setMenuOpen(false)} />

      <div className="acon__main">
        <header className="acon__top">
          <button type="button" className="acon__tool acon__burger" aria-label={t('Menyu')} onClick={() => setMenuOpen(true)}>{IC.menu}</button>
          <div className="acon__title">
            <h1>{t(section.label)}</h1>
            <p>{t(section.sub)}</p>
          </div>
          <div className="acon__tools">
            <button type="button" className="acon__tool" title={t('Rejim')} aria-label={t('Rejim')} onClick={toggleTheme}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
            {user && (
              <div className="acon__me">
                <Avatar name={user.name} photo={user.photo} className="acon__av" />
                <span className="acon__who">
                  <b>{user.name}</b>
                  <RoleBadge user={user} />
                </span>
              </div>
            )}
            <button type="button" className="acon__tool" title={t('Chiqish')} aria-label={t('Chiqish')} onClick={signOut}>{IC.logout}</button>
          </div>
        </header>

        <main className="acon__page">
          <Suspense fallback={<Skeleton lines={6} />}>{section.page}</Suspense>
        </main>
      </div>
    </div>
  )
}

/** Signed in, but not someone the panel is for (e.g. made a teacher while
 *  the panel was open — the server refuses them at the next refresh). */
export function NotForPanel() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="acon-deny">
      <div className="acon-deny__card">
        <img src="/logo.png" alt="" width={48} height={48} />
        <h1>{t('Boshqaruv paneli')}</h1>
        <p>{t("Boshqaruv paneliga faqat administratorlar kiradi. Platformaga kuragoniy.uz orqali kiring.")}</p>
        <div className="acon-deny__acts">
          <a className="btn btn--primary" href={MAIN_ORIGIN}>{t("Platformaga o'tish")}</a>
          <button type="button" className="btn" onClick={async () => { await logout(); navigate('/login', { replace: true }) }}>{t('Chiqish')}</button>
        </div>
      </div>
    </div>
  )
}
