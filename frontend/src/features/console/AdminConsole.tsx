import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { FanSwitch } from '@/components/FanWindow'
import { PageFx } from '@/components/PageFx'
import { RoleBadge } from '@/components/RoleBadge'
import { Skeleton } from '@/components/Skeleton'
import type { Subject } from '@/features/lessons/labels'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { MAIN_ORIGIN, panelSendsFan } from '@/lib/adminHost'
import { useAuth } from '@/lib/auth/AuthContext'
import { routeOn, useModules } from '@/lib/modules'
import { useUIStore } from '@/store/uiStore'

import { useStaffList } from '@/features/admin/staffApi'
import './console.css'
import './i18n'

/* admin.kuragoniy.uz — the administration's whole work, apart from the
   teaching (owner, 2026-11-26: "to'liq ajratish"): the Boshqaruv sections
   (the console's own, both fans at once) and the Ma'muriyat, content and
   requests pages of the platform, each in the Fizika or STEAM window
   picked on top. The same account teaches at kuragoniy.uz (owner,
   2026-11-27: one login for both). */

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
const HomeMonitoring = named(() => import('@/features/monitoring/Monitoring'), 'HomeMonitoring')
const ViewAsPanel = named(() => import('./ViewAsPanel'), 'ViewAsPanel')

/** A section of the console itself (/:bolim) … */
interface Section {
  slug: string
  label: string
  sub: string
  icon: keyof typeof IC
  page: ReactNode
  /** the developer's only */
  devOnly?: boolean
}
/** … or a page of the platform shown in the console (its own path). */
interface PageLink {
  to: string
  label: string
  icon: keyof typeof IC
  /** of one fan window only */
  fan?: Subject
}
type Item = Section | PageLink
const isSection = (x: Item): x is Section => 'slug' in x

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Ma'muriyat",
    items: [
      { slug: 'monitoring', label: 'Monitoring', sub: "Platformaning bugungi holati, so'rovlar va maktablar", icon: 'chart', page: <HomeMonitoring /> },
      { to: '/statistics', label: 'Statistika', icon: 'chart' },
      { to: '/timetable', label: 'Jadvallar', icon: 'timetable' },
      { to: '/manage/schools', label: 'Hamkor maktablar', icon: 'school' },
      { to: '/manage/equipment', label: 'Jihozlar jadvali', icon: 'flask', fan: 'fizika' },
      { to: '/equipment-sheet', label: "Jihozlar varag'i", icon: 'grid', fan: 'steam' },
      { to: '/reports', label: 'Dars hisobotlari', icon: 'file' },
      { to: '/obuna', label: 'Obunalar', icon: 'calendar' },
      { to: '/shop', label: "Do'kon", icon: 'cards' },
    ],
  },
  {
    title: 'Kontent',
    items: [
      { to: '/lessons', label: 'Darslar', icon: 'lessons' },
      { to: '/lessons?bolim=chamadonlar', label: 'Kerakli jihozlar', icon: 'cards', fan: 'steam' },
      { to: '/library', label: 'Kutubxona', icon: 'book' },
      { to: '/qollanmalar', label: "Qo'llanmalar", icon: 'file' },
      { to: '/training', label: 'Malaka oshirish', icon: 'cap' },
      { to: '/guide', label: "Yo'riqnoma", icon: 'book' },
    ],
  },
  {
    title: 'Aloqa',
    items: [
      { to: '/help', label: 'Yordam markazi', icon: 'help' },
      { to: '/mehmon', label: 'Mehmon ustoz', icon: 'users' },
      { to: '/feed', label: 'Ustozlar lentasi', icon: 'megaphone' },
      { to: '/achievements', label: 'Reyting va nishonlar', icon: 'star' },
      { to: '/notifications', label: 'Bildirishnomalar', icon: 'bell' },
    ],
  },
  {
    title: 'Tekshirish',
    items: [
      { slug: 'korinish', label: "Ko'rinish", sub: "Platformani o'qituvchi, o'quvchi, admin ko'zi bilan ko'rish", icon: 'eye',
        page: <ViewAsPanel />, devOnly: true },
    ],
  },
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

const SECTIONS = GROUPS.flatMap((g) => g.items).filter(isSection)
export const FIRST_SECTION = SECTIONS[0].slug

/** The menu item a page path belongs to (the longest matching link). */
function pageItem(pathname: string, search: string): PageLink | undefined {
  const links = GROUPS.flatMap((g) => g.items).filter((x): x is PageLink => !isSection(x))
  const here = `${pathname}${search}`
  const exact = links.find((l) => l.to.includes('?') && here.startsWith(l.to))
  if (exact) return exact
  return links
    .filter((l) => !l.to.includes('?') && (pathname === l.to || pathname.startsWith(`${l.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

export function AdminConsole() {
  const { t } = useTranslation()
  const { bolim } = useParams()
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useUIStore()
  const fan = useUIStore((s) => s.subject)
  const { on } = useModules()
  const [menuOpen, setMenuOpen] = useState(false)
  // people waiting for approval, beside Foydalanuvchilar
  const { data: staff } = useStaffList()
  const waiting = (staff ?? []).filter((u) => !u.approved && u.role !== 'admin' && u.role !== 'boshliq').length

  const section = SECTIONS.find((s) => s.slug === bolim)
  const page = section ? undefined : pageItem(location.pathname, location.search)
  const inFan = panelSendsFan(location.pathname)
  const title = section ? t(section.label) : page ? t(page.label)
    : location.pathname.startsWith('/settings') ? t('Sozlamalar') : t('Boshqaruv paneli')

  useEffect(() => {
    // the Boshqaruv sections have the panel's own accent; the platform's
    // pages the open fan window's
    document.documentElement.setAttribute('data-fan', inFan ? fan : 'panel')
  }, [inFan, fan])
  useEffect(() => {
    document.title = `${title} — ${t('Boshqaruv paneli')}`
    setMenuOpen(false)
  }, [title, t, location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  if ((bolim && !section) || (section?.devOnly && !user?.is_dev_superuser)) return <Navigate to={`/${FIRST_SECTION}`} replace />

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }
  const shows = (x: Item) => isSection(x)
    ? !x.devOnly || !!user?.is_dev_superuser
    : (!x.fan || x.fan === fan) && routeOn(x.to.split('?')[0], on)

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
          {GROUPS.filter((g) => g.items.some(shows)).map((g) => (
            <div key={g.title} className="acon__group">
              <p className="acon__gt">{t(g.title)}</p>
              {g.items.filter(shows).map((s) => isSection(s) ? (
                <NavLink key={s.slug} to={`/${s.slug}`} className={({ isActive }) => `acon__link ${isActive ? 'is-on' : ''}`}>
                  <span className="acon__ic" aria-hidden="true">{IC[s.icon]}</span>
                  <span className="acon__lt">{t(s.label)}</span>
                  {s.slug === 'foydalanuvchilar' && waiting > 0 && (
                    <span className="acon__badge" title={t('Tasdiq kutmoqda')}>{waiting}</span>
                  )}
                </NavLink>
              ) : (
                <Link key={s.to} to={s.to} className={`acon__link ${page === s ? 'is-on' : ''}`}>
                  <span className="acon__ic" aria-hidden="true">{IC[s.icon]}</span>
                  <span className="acon__lt">{t(s.label)}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* the same account teaches there */}
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
            <h1>{title}</h1>
            {section && <p>{t(section.sub)}</p>}
          </div>
          <div className="acon__tools">
            {/* the platform's pages: in the Fizika or the STEAM window */}
            {inFan && <FanSwitch stay />}
            <button type="button" className="acon__tool" title={t('Rejim')} aria-label={t('Rejim')} onClick={toggleTheme}>
              {theme === 'dark' ? themeIconMoon() : themeIconSun()}
            </button>
            {user && (
              <Link className="acon__me" to="/settings/profile" title={t('Sozlamalar')}>
                <Avatar name={user.name} photo={user.photo} className="acon__av" />
                <span className="acon__who">
                  <b>{user.name}</b>
                  <RoleBadge user={user} />
                </span>
              </Link>
            )}
            <button type="button" className="acon__tool" title={t('Chiqish')} aria-label={t('Chiqish')} onClick={signOut}>{IC.logout}</button>
          </div>
        </header>

        <main className="acon__page">
          <Suspense fallback={<Skeleton lines={6} />}><PageFx>{section ? section.page : <Outlet />}</PageFx></Suspense>
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
