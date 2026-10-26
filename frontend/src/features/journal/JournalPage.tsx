import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useClasses, useGrants, useGrantTeachers } from './api'
import { ClassGrid } from './ClassGrid'
import { ClassPicker } from './ClassPicker'
import { ClassModal } from './ClassModal'
import { ClassSummary } from './ClassSummary'
import { EditGrantsPanel } from './EditGrantsPanel'
import { quarterLabel } from './labels'

type Chorak = 1 | 2 | 3 | 4 | 'u'


function useChorak() {
  const [chorak, setChorak] = useState<Chorak>(() => {
    const raw = localStorage.getItem('afmd.chorak')
    return raw === 'u' ? 'u' : (Number(raw) as Chorak) || 1
  })
  const change = (q: Chorak) => {
    setChorak(q)
    localStorage.setItem('afmd.chorak', String(q))
  }
  return [chorak, change] as const
}

/** Class chips + quarter chips + the grid. With `teacherId` it shows that
 * teacher's journal to an administrator: marks and attendance read-only
 * (locks open days), nazorat ishi graded by the administrator. */
function JournalBody({ teacherId, head }: { teacherId?: string; head?: React.ReactNode }) {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const [chorak, changeChorak] = useChorak()
  const { data: classes, isLoading } = useClasses(teacherId)
  // ?class=<id> — coming back from a lesson page lands on that class.
  const [params] = useSearchParams()
  const [openId, setOpenId] = useState<number | null>(() => Number(params.get('class')) || null)
  const [creatingClass, setCreatingClass] = useState(false)

  useEffect(() => {
    if (classes?.length && (openId === null || !classes.some((c) => c.id === openId))) {
      setOpenId(classes[0].id)
    }
  }, [classes, openId])

  if (isLoading) return <div>{head}<Skeleton lines={3} /></div>

  if (!classes?.length) {
    return (
      <div>
        {head}
        {teacherId ? (
          <EmptyState title={t("Sinf qo'shilmagan")} hint={t("Bu o'qituvchining jurnalida hali sinf yo'q.")} />
        ) : (
          <EmptyState
            title={t("Sinf qo'shilmagan")}
            hint={t("Jurnal yuritish uchun avval sinf qo'shing.")}
            action={<button className="btn btn--primary" onClick={() => setCreatingClass(true)}>{t("Sinf qo'shish")}</button>}
          />
        )}
        {creatingClass && <ClassModal cls={null} onClose={() => setCreatingClass(false)} onCreated={setOpenId} />}
      </div>
    )
  }

  const cls = classes.find((c) => c.id === openId) ?? classes[0]

  return (
    <div>
      {head}
      <div className="jbar jbar--compact">
        <ClassPicker classes={classes} value={cls.id} onChange={setOpenId} onAdd={teacherId ? undefined : () => setCreatingClass(true)} />
        <div className="qseg" role="group" aria-label={t('Chorak')}>
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              type="button"
              className={`qseg__b ${chorak === q ? 'is-on' : ''}`}
              aria-pressed={chorak === q}
              aria-label={quarterLabel(q, lang)}
              onClick={() => changeChorak(q as Chorak)}
            >
              <span className="qseg__long">{quarterLabel(q, lang)}</span>
              <span className="qseg__short">{q}</span>
            </button>
          ))}
          <button type="button" className={`qseg__b ${chorak === 'u' ? 'is-on' : ''}`} aria-pressed={chorak === 'u'} onClick={() => changeChorak('u')}>
            {t('Umumiy')}
          </button>
        </div>
      </div>

      {chorak === 'u'
        ? <ClassSummary key={cls.id} cls={cls} teacherId={teacherId} />
        : <ClassGrid key={cls.id} cls={cls} chorak={chorak} teacherId={teacherId} />}

      {creatingClass && <ClassModal cls={null} onClose={() => setCreatingClass(false)} onCreated={setOpenId} />}
    </div>
  )
}

/** Administrators: every teacher with classes, to open their journal. */
function TeacherList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading } = useGrantTeachers(true)
  const [q, setQ] = useState('')
  if (isLoading) return <Skeleton lines={4} />
  const needle = q.trim().toLowerCase()
  const list = (data ?? []).filter((p) => p.classes.length > 0 && (!needle || p.name.toLowerCase().includes(needle)
    || p.classes.some((c) => c.label.toLowerCase().includes(needle))))
  return (
    <div className="jpick">
      <input className="input jpick__q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t("O'qituvchi yoki sinf")} aria-label={t('Qidirish')} />
      {list.length ? (
        <ul className="jpick__list">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="jpick__b" onClick={() => navigate(`/journal?teacher=${encodeURIComponent(p.id)}`)}>
                <span className="jteach__av" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
                <span className="jpick__txt">
                  <b>{p.name}</b>
                  <small>{p.classes.map((c) => c.label).join(' · ')}</small>
                </span>
                <span className="jpick__go" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('Topilmadi')} hint={t("Sinf qo'shgan o'qituvchi topilmadi.")} />
      )}
    </div>
  )
}

type AdminMode = 'mine' | 'teachers' | 'access'
const modeOf = (tab: string | null): AdminMode => (tab === 'access' ? 'access' : tab === 'teachers' ? 'teachers' : 'mine')

export function JournalPage() {
  const { t } = useTranslation()
  const viewMode = useUIStore((s) => s.viewMode)
  const { user } = useAuth()
  const navigate = useNavigate()
  const admin = isAdminInView(user, viewMode)
  const [params, setParams] = useSearchParams()
  // ?tab=access — where the "permission asked" notification points;
  // ?tab=teachers — the teachers' journals; ?teacher=<id> — an
  // administrator in that teacher's journal (grading nazorat ishi).
  const viewing = admin ? params.get('teacher') : null
  const [adminMode, setAdminMode] = useState<AdminMode>(() => modeOf(params.get('tab')))
  const pendingGrants = useGrants('pending', admin)
  const teachers = useGrantTeachers(!!viewing)

  const changeMode = (m: AdminMode) => {
    setAdminMode(m)
    if (params.has('tab') || params.has('teacher')) setParams({}, { replace: true })
  }
  const waiting = pendingGrants.data?.length ?? 0

  // Administrators: their own journal, the teachers' journals, or permissions for past days.
  const ModeBar = admin ? (
    <div className="chips" style={{ marginBottom: 14 }}>
      <button className={`chip ${adminMode === 'mine' && !viewing ? 'is-on' : ''}`} onClick={() => changeMode('mine')}>
        {IC.user} {t('Mening jurnalim')}
      </button>
      <button className={`chip ${adminMode === 'teachers' || viewing ? 'is-on' : ''}`} onClick={() => changeMode('teachers')}>
        {IC.users} {t("O'qituvchilar jurnali")}
      </button>
      <button className={`chip ${adminMode === 'access' && !viewing ? 'is-on' : ''}`} onClick={() => changeMode('access')}>
        {IC.lock} {t('Ruxsatlar')} {waiting > 0 && <span className="chip__count">{waiting}</span>}
      </button>
    </div>
  ) : null

  if (viewing) {
    const name = teachers.data?.find((p) => p.id === viewing)?.name ?? ''
    return (
      <JournalBody
        key={viewing}
        teacherId={viewing}
        head={
          <>
            {ModeBar}
            <div className="jview">
              <button type="button" className="btn btn--sm" onClick={() => { setAdminMode('teachers'); navigate('/journal?tab=teachers') }}>
                {IC.back} {t("O'qituvchilar")}
              </button>
              <span className="jview__t">{IC.eye} <b>{name}</b> {t('jurnali')}</span>
            </div>
          </>
        }
      />
    )
  }

  if (admin && adminMode === 'teachers') {
    return (
      <div>
        {ModeBar}
        <TeacherList />
      </div>
    )
  }

  if (admin && adminMode === 'access') {
    return (
      <div>
        {ModeBar}
        <EditGrantsPanel />
      </div>
    )
  }

  return <JournalBody head={ModeBar} />
}
