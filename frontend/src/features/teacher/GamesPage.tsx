import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { OPTION_STYLES, useGameSocket } from '@/features/games/gameSocket'
import { LivePlayer } from '@/features/games/LivePlayer'
import { MiniGames } from '@/features/games/MiniGames'
import { useLessonOptions, useTeacherClasses } from '@/features/learning/api'
import { errText, PageHead, Segmented } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

interface QuizQ {
  id?: number
  text: string
  image_url: string
  options: string[]
  correct: number
  time_limit: number
  points: number
}

interface Quiz {
  id: number
  title: string
  grade: number | null
  lesson: number | null
  questions: QuizQ[]
  question_count: number
  updated_at: string
}

interface HostState {
  id: number
  pin: string | null
  status: 'lobby' | 'question' | 'reveal' | 'finished'
  quiz_title: string
  total: number
  index: number
  players: { id: number; nickname: string; score: number }[]
  leaderboard: { player: number; nickname: string; score: number; rank: number }[]
  class_name: string
  question?: { text: string; image_url: string; options: string[]; correct: number; time_limit: number; time_left: number }
  answered?: number
  option_counts?: number[]
}

const blankQ = (): QuizQ => ({ text: '', image_url: '', options: ['', '', '', ''], correct: 0, time_limit: 20, points: 1000 })

function QuizEditor({ initial, onClose }: { initial: Quiz | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [grade, setGrade] = useState<number | ''>(initial?.grade ?? '')
  const [qs, setQs] = useState<QuizQ[]>(initial?.questions.length ? initial.questions : [blankQ()])
  const [importLesson, setImportLesson] = useState<number | ''>('')
  const { data: lessons } = useLessonOptions(grade || null)
  const [busy, setBusy] = useState(false)

  const setQ = (i: number, patch: Partial<QuizQ>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  const save = async (andImport = false) => {
    setBusy(true)
    try {
      const body = { title, grade: grade || null, questions: qs.filter((q) => q.text.trim()).map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })) }
      const res = initial ? await api.patch<Quiz>(`/games/quizzes/${initial.id}/`, body) : await api.post<Quiz>('/games/quizzes/', body)
      if (andImport && importLesson) {
        const imp = await api.post<{ added: number; quiz: Quiz }>(`/games/quizzes/${res.data.id}/import-lesson/`, { lesson: importLesson })
        toast(`${imp.data.added} ${t("ta savol qo'shildi")}`)
        setQs(imp.data.quiz.questions)
      } else {
        toast(t('Saqlandi'))
        onClose()
      }
      qc.invalidateQueries({ queryKey: ['games'] })
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial ? t('Viktorinani tahrirlash') : t('Yangi viktorina')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button><button className="btn btn--primary" disabled={busy} onClick={() => save()}>{t('Saqlash')}</button></>}>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Nomi')}</span>
          <input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Sinf darajasi')}</span>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {[7, 8, 9].map((g) => <option key={g} value={g}>{g}-{t('sinf')}</option>)}
          </select>
        </label>
      </div>
      <div className="importrow">
        <select className="input" value={importLesson} onChange={(e) => setImportLesson(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('Dars savollar bankidan import…')}</option>
          {lessons?.map((l) => <option key={l.id} value={l.id}>{l.grade}-{t('sinf')}, {l.hafta}: {l.title}</option>)}
        </select>
        <button type="button" className="btn" disabled={!importLesson || !title.trim() || busy} onClick={() => save(true)}>{t('Import')}</button>
      </div>
      {qs.map((q, i) => (
        <div className="qedit" key={i}>
          <div className="qedit__head">
            <span className="qedit__n">{i + 1}</span>
            <label className="qedit__pts"><input className="input input--sm" type="number" min={5} max={120} value={q.time_limit}
              onChange={(e) => setQ(i, { time_limit: Number(e.target.value) || 20 })} /><span>{t('soniya')}</span></label>
            <button type="button" className="icon-btn" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>{IC.trash}</button>
          </div>
          <input className="input" maxLength={500} placeholder={t('Savol')} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
          <div className="qedit__opts">
            {q.options.map((o, j) => (
              <div className="qedit__opt" key={j}>
                <button type="button" className={`qedit__mark ${q.correct === j ? 'is-on' : ''}`} onClick={() => setQ(i, { correct: j })} aria-pressed={q.correct === j}>
                  {OPTION_STYLES[j].shape}
                </button>
                <input className="input" maxLength={120} placeholder={`${t('Variant')} ${j + 1}${j > 1 ? ` (${t('ixtiyoriy')})` : ''}`} value={o}
                  onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {qs.length < 60 && <button type="button" className="btn btn--sm" onClick={() => setQs([...qs, blankQ()])}>+ {t("Savol qo'shish")}</button>}
    </Modal>
  )
}

/** Board view for the projector: PIN, joined players, the question with a
 * countdown, the answer histogram and the leaderboard. */
function HostScreen({ initial, onClose }: { initial: HostState; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [s, setS] = useState<HostState>(initial)
  const [left, setLeft] = useState(0)
  const revealing = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setS((await api.get<HostState>(`/games/sessions/${initial.id}/`)).data)
    } catch {
      // transient
    }
  }, [initial.id])
  useGameSocket(initial.id, refresh)

  const act = async (action: 'next' | 'reveal' | 'finish') => {
    try {
      setS((await api.post<HostState>(`/games/sessions/${initial.id}/${action}/`)).data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  useEffect(() => { setLeft(Math.ceil(s.question?.time_left ?? 0)); revealing.current = false }, [s.index, s.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.status !== 'question') return
    const everyone = s.players.length > 0 && (s.answered ?? 0) >= s.players.length
    if ((left <= 0 || everyone) && !revealing.current) {
      revealing.current = true
      act('reveal')
      return
    }
    const id = setTimeout(() => setLeft((x) => x - 1), 1000)
    return () => clearTimeout(id)
  }, [left, s.status, s.answered, s.players.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = s.question
  const maxCount = Math.max(1, ...(s.option_counts ?? [0]))

  return createPortal(
    <div className="host">
      <header className="host__bar">
        <span className="host__title">{s.quiz_title}{s.class_name && ` · ${s.class_name}`}</span>
        {s.status !== 'lobby' && s.status !== 'finished' && <span>{s.index + 1}/{s.total}</span>}
        <button className="btn btn--sm" onClick={() => (s.status === 'finished' ? onClose() : act('finish'))}>
          {s.status === 'finished' ? t('Yopish') : t('Tugatish')}
        </button>
      </header>

      {s.status === 'lobby' && (
        <div className="host__lobby">
          <p className="host__join">{t("Qo'shilish")}: <b>{window.location.host}</b> → {t("O'yinlar")} → {t("Jonli o'yin")}</p>
          <p className="host__pin">{s.pin}</p>
          <div className="host__players">
            {s.players.map((p) => <span key={p.id} className="host__chip">{p.nickname}</span>)}
          </div>
          <p>{s.players.length} {t("o'yinchi")}</p>
          <button className="btn btn--primary btn--lg" disabled={!s.players.length} onClick={() => act('next')}>{t('Boshlash')} ▶</button>
        </div>
      )}

      {(s.status === 'question' || s.status === 'reveal') && q && (
        <div className="host__q">
          <p className="host__qtext">{q.text}</p>
          {q.image_url && <img className="host__img" src={q.image_url} alt="" referrerPolicy="no-referrer" />}
          <div className="host__meta">
            {s.status === 'question' ? <span className="host__timer">{Math.max(0, left)}</span> : <span />}
            <span>{s.answered ?? 0}/{s.players.length} {t('javob')}</span>
          </div>
          <div className="gansw gansw--host">
            {q.options.map((o, i) => (
              <div key={i} className={`gans ${OPTION_STYLES[i].cls} ${s.status === 'reveal' ? (i === q.correct ? 'is-right' : 'is-dim') : ''}`}>
                <span className="gans__shape" aria-hidden="true">{OPTION_STYLES[i].shape}</span>
                <span>{o}</span>
                {s.status === 'reveal' && (
                  <span className="gans__count">
                    <span className="gans__bar" style={{ width: `${(100 * (s.option_counts?.[i] ?? 0)) / maxCount}%` }} />
                    {s.option_counts?.[i] ?? 0}
                  </span>
                )}
              </div>
            ))}
          </div>
          {s.status === 'question' ? (
            <button className="btn" onClick={() => act('reveal')}>{t("Javobni ko'rsatish")}</button>
          ) : (
            <>
              <ol className="lboard lboard--host">
                {s.leaderboard.slice(0, 5).map((r) => (
                  <li key={r.player}><span className="lboard__rank">{r.rank}</span><span className="lboard__name">{r.nickname}</span><span className="lboard__score">{r.score}</span></li>
                ))}
              </ol>
              <button className="btn btn--primary btn--lg" onClick={() => act('next')}>
                {s.index + 1 >= s.total ? t('Natijalar') : t('Keyingi savol')} →
              </button>
            </>
          )}
        </div>
      )}

      {s.status === 'finished' && (
        <div className="host__lobby">
          <p className="host__pin host__pin--sm">🏁 {t("O'yin tugadi")}</p>
          <div className="podium">
            {s.leaderboard.slice(0, 3).map((r) => (
              <div key={r.player} className={`podium__p podium__p--${r.rank}`}>
                <span className="podium__medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
                <span className="podium__name">{r.nickname}</span>
                <span className="podium__score">{r.score}</span>
              </div>
            ))}
          </div>
          <ol className="lboard lboard--host">
            {s.leaderboard.slice(3).map((r) => (
              <li key={r.player}><span className="lboard__rank">{r.rank}</span><span className="lboard__name">{r.nickname}</span><span className="lboard__score">{r.score}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>,
    document.body,
  )
}

export function GamesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'live' | 'mini' | 'join'>('live')
  const [editing, setEditing] = useState<Quiz | null | 'new'>(null)
  const [host, setHost] = useState<HostState | null>(null)
  const [startFor, setStartFor] = useState<Quiz | null>(null)
  const [classId, setClassId] = useState<number | ''>('')
  const { data: classes } = useTeacherClasses()
  const { data: quizzes } = useQuery({
    queryKey: ['games', 'quizzes'],
    queryFn: async () => (await api.get<Paginated<Quiz>>('/games/quizzes/')).data.results,
  })

  const start = async () => {
    if (!startFor) return
    try {
      const res = await api.post<HostState>('/games/sessions/', { quiz: startFor.id, journal_class: classId || null })
      setStartFor(null)
      setHost(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  const remove = async (q: Quiz) => {
    if (!(await confirm({ title: t("Viktorinani o'chirish"), text: q.title, danger: true }))) return
    await api.delete(`/games/quizzes/${q.id}/`).catch(() => {})
    qc.invalidateQueries({ queryKey: ['games'] })
  }

  return (
    <div>
      <PageHead title={t("O'yinlar")} sub={t("Darsda jonli viktorina o'tkazing yoki fizika mini-o'yinlarini doskaga chiqaring.")}
        actions={<Segmented value={tab} onChange={setTab} options={[
          { value: 'live', label: t('Jonli viktorina') }, { value: 'mini', label: t("Mini-o'yinlar") }, { value: 'join', label: t("O'yinchi sifatida") },
        ]} />} />

      {tab === 'mini' && <MiniGames />}
      {tab === 'join' && <section className="panel"><LivePlayer /></section>}
      {tab === 'live' && (
        <>
          <div className="panel__acts" style={{ marginBottom: 16 }}>
            <button className="btn btn--primary" onClick={() => setEditing('new')}>+ {t('Yangi viktorina')}</button>
          </div>
          {!quizzes?.length && <EmptyState title={t("Hali viktorina yo'q")} hint={t("Viktorina yarating yoki dars savollar bankidan import qiling.")} />}
          <div className="hwlist">
            {quizzes?.map((q) => (
              <article key={q.id} className="hwcard hwcard--static">
                <span className="hwcard__title">{q.title}</span>
                <span className="hwcard__sub">{q.question_count} {t('savol')}{q.grade ? ` · ${q.grade}-${t('sinf')}` : ''}</span>
                <span className="hwcard__acts">
                  <button className="btn btn--sm btn--primary" disabled={!q.question_count} onClick={() => setStartFor(q)}>▶ {t("O'yinni boshlash")}</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => setEditing(q)}>{IC.edit}</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => remove(q)}>{IC.trash}</button>
                </span>
              </article>
            ))}
          </div>
        </>
      )}

      {startFor && (
        <Modal title={`${t("O'yinni boshlash")}: ${startFor.title}`} onClose={() => setStartFor(null)} narrow
          footer={<><button className="btn" onClick={() => setStartFor(null)}>{t('Bekor qilish')}</button><button className="btn btn--primary" onClick={start}>▶ {t('Boshlash')}</button></>}>
          <label className="field">
            <span className="field__label">{t('Kim qo\'shila oladi?')}</span>
            <select className="input" value={classId} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('Kodni bilgan har qanday o\'quvchi')}</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{t('Faqat')} {c.name}</option>)}
            </select>
          </label>
        </Modal>
      )}
      {editing && <QuizEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {host && <HostScreen initial={host} onClose={() => setHost(null)} />}
    </div>
  )
}
