import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Formula } from '@/features/portal/formula'
import { api } from '@/lib/api/client'

import {
  convertTasks,
  FORMULA_PAIRS,
  MINI_GAMES,
  shuffle,
  TRUE_FALSE,
  UNIT_PAIRS,
  type MiniGameKey,
} from './miniData'

interface Finish {
  score: number
  correct: number
  total: number
  duration: number
}

function useCountdown(seconds: number, running: boolean, onEnd: () => void, resetKey: unknown) {
  const [left, setLeft] = useState(seconds)
  const endRef = useRef(onEnd)
  useEffect(() => {
    endRef.current = onEnd
  })
  useEffect(() => setLeft(seconds), [seconds, resetKey])
  useEffect(() => {
    if (!running) return
    if (left <= 0) {
      endRef.current()
      return
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left, running])
  return left
}

/** Pick-one game used for both "Birliklar" and "Formula ustasi". */
function ChoiceGame({ pairs, renderOption, onFinish }: {
  pairs: [string, string][]
  renderOption: (s: string) => React.ReactNode
  onFinish: (f: Finish) => void
}) {
  const { t } = useTranslation()
  const ROUNDS = 10
  const LIMIT = 10
  const rounds = useMemo(() => shuffle(pairs).slice(0, ROUNDS).map(([q, a]) => {
    const others = shuffle(pairs.filter(([, x]) => x !== a)).slice(0, 3).map(([, x]) => x)
    return { q, a, options: shuffle([a, ...others]) }
  }), [pairs])
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const started = useRef(0)
  useEffect(() => {
    started.current = Date.now()
  }, [])

  const next = (gained: number, ok: boolean) => {
    const s = score + gained
    const c = correct + (ok ? 1 : 0)
    setScore(s)
    setCorrect(c)
    setTimeout(() => {
      setPicked(null)
      if (i + 1 >= rounds.length) onFinish({ score: s, correct: c, total: rounds.length, duration: Math.round((Date.now() - started.current) / 1000) })
      else setI(i + 1)
    }, 900)
  }

  const left = useCountdown(LIMIT, picked === null, () => { setPicked('__timeout__'); next(0, false) }, i)
  const r = rounds[i]

  const choose = (opt: string) => {
    if (picked) return
    setPicked(opt)
    const ok = opt === r.a
    next(ok ? 100 + Math.floor((50 * left) / LIMIT) : 0, ok)
  }

  return (
    <div className="mgame">
      <div className="mgame__bar"><span>{i + 1}/{rounds.length}</span><span>⏱ {left}</span><span>{score} {t('ball')}</span></div>
      <p className="mgame__q">{r.q}</p>
      <div className="mgame__opts">
        {r.options.map((opt) => {
          const state = picked ? (opt === r.a ? 'is-right' : opt === picked ? 'is-wrong' : '') : ''
          return (
            <button key={opt} type="button" className={`mopt ${state}`} onClick={() => choose(opt)} disabled={!!picked}>
              {renderOption(opt)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TrueFalseGame({ onFinish }: { onFinish: (f: Finish) => void }) {
  const { t } = useTranslation()
  const items = useMemo(() => shuffle(TRUE_FALSE), [])
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const done = useRef(false)

  const finish = (s = score, c = correct, answered = i) => {
    if (done.current) return
    done.current = true
    onFinish({ score: s, correct: c, total: Math.max(answered, 1), duration: 60 })
  }
  const left = useCountdown(60, true, () => finish(), 'tf')

  const answer = (val: boolean) => {
    const ok = items[i][1] === val
    const s = score + (ok ? 100 + Math.min(50, streak * 10) : 0)
    const c = correct + (ok ? 1 : 0)
    setScore(s)
    setCorrect(c)
    setStreak(ok ? streak + 1 : 0)
    setFlash(ok ? 'ok' : 'bad')
    setTimeout(() => setFlash(null), 350)
    if (i + 1 >= items.length) finish(s, c, i + 1)
    else setI(i + 1)
  }

  return (
    <div className={`mgame ${flash ? `mgame--${flash}` : ''}`}>
      <div className="mgame__bar"><span>⏱ {left}</span><span>{streak > 1 ? `🔥 ${streak}` : ''}</span><span>{score} {t('ball')}</span></div>
      <p className="mgame__q">{items[i][0]}</p>
      <div className="mgame__tf">
        <button type="button" className="mopt mopt--yes" onClick={() => answer(true)}>✓ {t("To'g'ri")}</button>
        <button type="button" className="mopt mopt--no" onClick={() => answer(false)}>✗ {t("Noto'g'ri")}</button>
      </div>
    </div>
  )
}

function ConvertGame({ onFinish }: { onFinish: (f: Finish) => void }) {
  const { t } = useTranslation()
  const LIMIT = 20
  const tasks = useMemo(() => convertTasks(10), [])
  const [i, setI] = useState(0)
  const [val, setVal] = useState('')
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const started = useRef(0)
  useEffect(() => {
    started.current = Date.now()
  }, [])

  const advance = (gained: number, ok: boolean, msg: string) => {
    const s = score + gained
    const c = correct + (ok ? 1 : 0)
    setScore(s)
    setCorrect(c)
    setFeedback(msg)
    setTimeout(() => {
      setFeedback(null)
      setVal('')
      if (i + 1 >= tasks.length) onFinish({ score: s, correct: c, total: tasks.length, duration: Math.round((Date.now() - started.current) / 1000) })
      else setI(i + 1)
    }, 1100)
  }

  const task = tasks[i]
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')
  const left = useCountdown(LIMIT, feedback === null, () => advance(0, false, `${t('Vaqt tugadi')}: ${fmt(task.answer)} ${task.unit}`), i)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (feedback) return
    const given = Number(val.replace(/\s/g, '').replace(',', '.'))
    const ok = Number.isFinite(given) && Math.abs(given - task.answer) <= Math.max(1e-6, Math.abs(task.answer) * 0.005)
    advance(ok ? 150 + Math.floor((50 * left) / LIMIT) : 0, ok, ok ? `✓ ${t("To'g'ri!")}` : `✗ ${fmt(task.answer)} ${task.unit}`)
  }

  return (
    <form className="mgame" onSubmit={submit}>
      <div className="mgame__bar"><span>{i + 1}/{tasks.length}</span><span>⏱ {left}</span><span>{score} {t('ball')}</span></div>
      <p className="mgame__q">{task.q}</p>
      <div className="row row--2">
        <input className="input mgame__in" inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)} disabled={!!feedback} />
        <button className="btn btn--primary" disabled={!!feedback || !val}>{t('Javob')}</button>
      </div>
      {feedback && <p className="mgame__fb">{feedback}</p>}
    </form>
  )
}

function Leaderboard({ game }: { game: MiniGameKey }) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['games', 'mini-board', game],
    queryFn: async () =>
      (await api.get<{ rows: { name: string; best: number; is_me: boolean; rank: number }[]; my_best: number | null }>('/games/mini/leaderboard/', { params: { game } })).data,
  })
  if (!data?.rows.length) return <p className="prose prose--note">{t("Hali natija yo'q — birinchi bo'ling!")}</p>
  return (
    <ol className="lboard">
      {data.rows.slice(0, 10).map((r) => (
        <li key={r.rank} className={r.is_me ? 'is-me' : ''}>
          <span className="lboard__rank">{r.rank}</span>
          <span className="lboard__name">{r.name}</span>
          <span className="lboard__score">{r.best}</span>
        </li>
      ))}
    </ol>
  )
}

/** Mini-games hub — playable by students and teachers alike (a teacher
 * can also project one on the board for the whole class). */
export function MiniGames() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [game, setGame] = useState<MiniGameKey | null>(null)
  const [round, setRound] = useState(0)
  const [result, setResult] = useState<(Finish & { best?: number | null }) | null>(null)
  const { data: myBest } = useQuery({
    queryKey: ['games', 'mini-best'],
    queryFn: async () => (await api.get<Record<string, { best: number; plays: number }>>('/games/mini/my-best/')).data,
  })

  const finish = async (f: Finish) => {
    setResult(f)
    try {
      const res = await api.post<{ best: number }>('/games/mini/scores/', {
        game, score: f.score, correct: f.correct, total: f.total, duration_sec: Math.max(f.duration, f.total),
      })
      setResult({ ...f, best: res.data.best })
      qc.invalidateQueries({ queryKey: ['games'] })
    } catch {
      // score just isn't saved — the game itself still worked
    }
  }

  if (!game) {
    return (
      <div className="mgrid">
        {MINI_GAMES.map((g) => (
          <button key={g.key} type="button" className="mcard" onClick={() => { setGame(g.key); setResult(null); setRound((r) => r + 1) }}>
            <span className="mcard__ic" aria-hidden="true">{g.icon}</span>
            <span className="mcard__title">{t(g.title)}</span>
            <span className="mcard__desc">{t(g.desc)}</span>
            {myBest?.[g.key] && <span className="mcard__best">{t('Rekordingiz')}: {myBest[g.key].best}</span>}
          </button>
        ))}
      </div>
    )
  }

  const meta = MINI_GAMES.find((g) => g.key === game)!
  return (
    <div className="mwrap">
      <div className="mwrap__head">
        <button type="button" className="backlink linklike" onClick={() => setGame(null)}>← {t("Barcha o'yinlar")}</button>
        <h3>{meta.icon} {t(meta.title)}</h3>
      </div>
      <div className="cols2">
        <section className="panel">
          {result ? (
            <div className="mresult">
              <p className="mresult__score">{result.score}</p>
              <p>{result.correct}/{result.total} {t("to'g'ri")}</p>
              {result.best != null && <p className="muted">{t('Rekordingiz')}: {result.best}</p>}
              <button type="button" className="btn btn--primary" onClick={() => { setResult(null); setRound((r) => r + 1) }}>{t("Qayta o'ynash")}</button>
            </div>
          ) : game === 'units' ? (
            <ChoiceGame key={round} pairs={UNIT_PAIRS} renderOption={(s) => s} onFinish={finish} />
          ) : game === 'formulas' ? (
            <ChoiceGame key={round} pairs={FORMULA_PAIRS} renderOption={(s) => <Formula expr={s} />} onFinish={finish} />
          ) : game === 'truefalse' ? (
            <TrueFalseGame key={round} onFinish={finish} />
          ) : (
            <ConvertGame key={round} onFinish={finish} />
          )}
        </section>
        <section className="panel">
          <h3 className="panel__title">🏆 {t('Reyting')}</h3>
          <Leaderboard game={game} />
        </section>
      </div>
    </div>
  )
}
