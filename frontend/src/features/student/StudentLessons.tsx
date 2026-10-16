import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { PageHead, PercentPill } from '@/features/portal/ui'
import { trTitle } from '@/features/student/tr'
import { useUIStore } from '@/store/uiStore'

import { useStudentLessons, type StudentLesson } from './api'

function stepState(l: StudentLesson) {
  const p = l.progress
  if (p.completed) return { label: 'Tugatildi', tone: 'ok' }
  if (p.video_done || p.theory_done || p.best_percent != null) return { label: 'Davom etmoqda', tone: 'mid' }
  if (p.opened) return { label: 'Ochilgan', tone: 'info' }
  return { label: 'Yangi', tone: 'muted' }
}

export function StudentLessons() {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const { data, isLoading } = useStudentLessons()

  if (isLoading) return <Skeleton lines={6} />
  const lessons = data ?? []
  const byChorak = [1, 2, 3, 4].map((ch) => ({ ch, items: lessons.filter((l) => l.chorak === ch) })).filter((g) => g.items.length)

  return (
    <div>
      <PageHead title={t('Darslar')} sub={t("Qisqa nazariya va formulalarni o'qing, videodarsni ko'ring, so'ng test va masalalarni yeching.")} />
      {!lessons.length && <EmptyState title={t("Hozircha darslar yo'q")} hint={t("O'qituvchilar darslarni tayyorlab, e'lon qilishi bilan shu yerda ko'rinadi.")} />}
      {byChorak.map((g) => (
        <section key={g.ch} className="lgroup">
          <h3 className="lgroup__title">{g.ch}-{t('chorak')}</h3>
          <div className="lcards">
            {g.items.map((l) => {
              const st = stepState(l)
              return (
                <Link key={l.id} to={`/s/lessons/${l.id}`} className="lcard">
                  <span className="lcard__week">{l.hafta}-{t('hafta')}</span>
                  <span className="lcard__title">{trTitle(l, lang)}</span>
                  <span className="lcard__steps" aria-label={t('Bosqichlar')}>
                    <span className={l.progress.theory_done ? 'is-done' : ''}>{t('Nazariya')}</span>
                    <span className={l.progress.video_done ? 'is-done' : ''}>{t('Video')}</span>
                    <span className={l.progress.best_percent != null ? 'is-done' : ''}>{t('Test')}</span>
                  </span>
                  <span className="lcard__foot">
                    <span className={`pill pill--${st.tone}`}>{t(st.label)}</span>
                    {l.progress.best_percent != null && <PercentPill value={l.progress.best_percent} />}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
