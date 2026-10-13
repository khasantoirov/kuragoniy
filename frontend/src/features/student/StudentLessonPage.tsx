import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { Formula } from '@/features/portal/formula'
import { AttemptReview, QuizRunner, type AttemptPayload, type AttemptResult } from '@/features/portal/quiz'
import { errText } from '@/features/portal/ui'
import { VideoEmbed } from '@/features/portal/VideoEmbed'
import { api } from '@/lib/api/client'
import { useUIStore } from '@/store/uiStore'

import { useStudentLesson } from './api'
import { trTitle } from './tr'

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="theory">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p.split('\n').map((line, j) => (j ? [<br key={j} />, line] : line))}</p>
      ))}
    </div>
  )
}

/** One lesson for a student: a little theory, the key formulas, then the
 * video (the main way to learn it), then the test/problems. */
export function StudentLessonPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const lessonId = Number(id)
  const lang = useUIStore((s) => s.lang)
  const toast = useToast()
  const qc = useQueryClient()
  const { data: lesson, isLoading, error } = useStudentLesson(lessonId)
  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [starting, setStarting] = useState(false)

  if (isLoading) return <Skeleton lines={8} />
  if (error || !lesson) return <p className="prose">{t('Dars topilmadi.')}</p>

  const mark = async (field: 'theory_done' | 'video_done') => {
    try {
      await api.post(`/student/lessons/${lessonId}/`, { [field]: true })
      qc.invalidateQueries({ queryKey: ['student'] })
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  const start = async () => {
    setStarting(true)
    try {
      const res = await api.post<AttemptPayload>(`/student/lessons/${lessonId}/practice/`)
      setResult(null)
      setAttempt(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setStarting(false)
    }
  }

  const p = lesson.progress
  const videos = [
    ...(lesson.video_url ? [{ title: t('Asosiy videodars'), url: lesson.video_url }] : []),
    ...lesson.extra_videos,
  ]
  const expVideos = lesson.experiments.filter((e) => e.video)

  return (
    <div className="slesson">
      <Link to="/s/lessons" className="backlink">← {t('Barcha darslar')}</Link>
      <header className="slesson__head">
        <p className="slesson__meta">{lesson.grade}-{t('sinf')} · {lesson.chorak}-{t('chorak')} · {lesson.hafta}-{t('hafta')}</p>
        <h2 className="slesson__title">{trTitle(lesson, lang)}</h2>
        {lesson.goal && <p className="slesson__goal">{lesson.goal}</p>}
        <ol className="steps">
          <li className={p.theory_done ? 'is-done' : ''}>{t('Nazariya')}</li>
          <li className={lesson.formulas.length ? (p.theory_done ? 'is-done' : '') : 'is-skip'}>{t('Formulalar')}</li>
          <li className={p.video_done ? 'is-done' : ''}>{t('Video')}</li>
          <li className={p.best_percent != null ? 'is-done' : ''}>{t('Test va masala')}</li>
        </ol>
      </header>

      {lesson.theory && (
        <section className="panel">
          <h3 className="panel__title"><span className="stepn">1</span> {t('Qisqa nazariya')}</h3>
          <Paragraphs text={lesson.theory} />
          {!p.theory_done && (
            <button type="button" className="btn btn--sm" onClick={() => mark('theory_done')}>✓ {t("O'qib chiqdim")}</button>
          )}
        </section>
      )}

      {lesson.formulas.length > 0 && (
        <section className="panel">
          <h3 className="panel__title"><span className="stepn">2</span> {t('Asosiy formulalar')}</h3>
          <ul className="formulas">
            {lesson.formulas.map((f, i) => (
              <li key={i}>
                <Formula expr={f.expr} />
                {f.desc && <span className="formulas__desc">{f.desc}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(videos.length > 0 || expVideos.length > 0) && (
        <section className="panel">
          <h3 className="panel__title"><span className="stepn">3</span> {t('Videodars')}</h3>
          {videos.map((v, i) => (
            <div key={i} className="vblock">
              {videos.length > 1 && <p className="vblock__title">{v.title}</p>}
              <VideoEmbed url={v.url} title={v.title} onEnded={() => !p.video_done && mark('video_done')} />
            </div>
          ))}
          {expVideos.length > 0 && (
            <details className="expvids">
              <summary>{t('Tajribalar videolari')} ({expVideos.length})</summary>
              {expVideos.map((e) => (
                <div key={e.id} className="vblock">
                  <p className="vblock__title">{e.name}</p>
                  {e.desc && <p className="prose prose--note">{e.desc}</p>}
                  <VideoEmbed url={e.video} title={e.name} />
                  {e.safety && <p className="safety">⚠️ {e.safety}</p>}
                </div>
              ))}
            </details>
          )}
          {!p.video_done && (
            <button type="button" className="btn btn--sm" onClick={() => mark('video_done')}>✓ {t("Videoni ko'rdim")}</button>
          )}
        </section>
      )}

      <section className="panel panel--accent">
        <h3 className="panel__title"><span className="stepn">4</span> {t('Test va masalalar')}</h3>
        {result ? (
          <>
            <AttemptReview result={result} />
            <button type="button" className="btn" onClick={start} disabled={starting}>{t('Qayta ishlash')}</button>
          </>
        ) : attempt ? (
          <QuizRunner payload={attempt} submitUrl={`/student/attempts/${attempt.id}/submit/`}
            onDone={(r) => { setResult(r); setAttempt(null); qc.invalidateQueries({ queryKey: ['student'] }) }} />
        ) : lesson.question_count ? (
          <>
            <p className="prose">
              {lesson.question_count} {t('ta savol.')}{' '}
              {p.best_percent != null && <>{t('Eng yaxshi natijangiz')}: <b>{Math.round(p.best_percent)}%</b>. </>}
              {!p.video_done && videos.length > 0 && t("Avval videoni ko'rib chiqishni tavsiya qilamiz.")}
            </p>
            <button type="button" className="btn btn--primary" onClick={start} disabled={starting}>
              {starting ? t('Yuklanmoqda…') : t('Boshlash')}
            </button>
          </>
        ) : (
          <p className="prose prose--note">{t("Bu dars uchun hali savollar qo'shilmagan.")}</p>
        )}
      </section>
    </div>
  )
}
