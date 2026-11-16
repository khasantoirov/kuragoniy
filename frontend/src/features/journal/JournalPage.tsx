import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { IC } from '@/icons'
import { isAdminInView, isSchoolAdmin, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useClasses, useGrantTeachers } from './api'
import { ClassGrid } from './ClassGrid'
import { ClassPicker } from './ClassPicker'
import { ClassModal } from './ClassModal'
import { ClassSummary } from './ClassSummary'
import { type ChorakView, readPick, rememberPick, shownChorak, useChorakNow } from './calendar'
import { quarterLabel } from './labels'

type Chorak = ChorakView

/** Statistika › Jurnal — the teachers' journals and the permissions. */
const TEACHERS_JOURNALS = '/statistics?bolim=jurnal'

/** The chorak on view: the calendar's own (Boshqaruv → O'quv yillari →
 * Choraklar) unless one was picked by hand within the same chorak. */
function useChorak() {
  const now = useChorakNow()
  const [pick, setPick] = useState(readPick)
  const change = (q: Chorak) => setPick(rememberPick(q, now))
  return [shownChorak(pick, now), change] as const
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

export function JournalPage() {
  const { t } = useTranslation()
  const viewMode = useUIStore((s) => s.viewMode)
  const { user } = useAuth()
  const navigate = useNavigate()
  const admin = isAdminInView(user, viewMode)
  // a school's ma'muriyat: their school's teachers' journals, read-only
  const schoolAdmin = isSchoolAdmin(user)
  const [params] = useSearchParams()
  // ?teacher=<id> — an administrator in that teacher's journal (grading nazorat ishi)
  const viewing = admin || schoolAdmin ? params.get('teacher') : null
  const teachers = useGrantTeachers(!!viewing && admin)

  // The teachers' journals and the past-day permissions live in
  // Statistika › Jurnal now; old links (notifications) land there.
  const tab = params.get('tab')
  if (admin && (tab === 'access' || tab === 'teachers')) {
    return <Navigate to={`${TEACHERS_JOURNALS}&qism=${tab === 'access' ? 'ruxsatlar' : 'oqituvchilar'}`} replace />
  }
  if (schoolAdmin && !viewing) return <Navigate to="/my-school" replace />

  if (viewing) {
    const name = teachers.data?.find((p) => p.id === viewing)?.name ?? params.get('name') ?? ''
    return (
      <JournalBody
        key={viewing}
        teacherId={viewing}
        head={
          <div className="jview">
            <button type="button" className="btn btn--sm" onClick={() => {
              if (schoolAdmin) return navigate(-1)
              navigate(`${TEACHERS_JOURNALS}&qism=oqituvchilar`)
            }}>
              {IC.back} {schoolAdmin ? t('Orqaga') : t("O'qituvchilar")}
            </button>
            <span className="jview__t">{IC.eye} <b>{name}</b> {t('jurnali')}</span>
          </div>
        }
      />
    )
  }

  return <JournalBody />
}
