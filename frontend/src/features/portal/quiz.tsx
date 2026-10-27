import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import { useUpdateGuard } from '@/lib/updateGuard'

import { pctLevel } from '@/features/journal/scales'

import { errText, fmtDuration } from './ui'

export type QKind = 'test' | 'multi' | 'number' | 'text'

export interface QItem {
  id: string
  kind: QKind
  topic: string
  text: string
  image_url: string
  unit: string
  points: number
  options?: string[]
}

export interface AttemptPayload {
  id: number
  kind: string
  started_at: string
  lesson: number | null
  assignment: number | null
  questions: QItem[]
}

export interface ReviewItem extends QItem {
  given: unknown
  ok: boolean
  correct?: (number | string)[]
  answer_value?: number | null
  explanation?: string
}

export interface AttemptResult {
  id: number
  kind: string
  percent: number
  score: number
  max_score: number
  duration_sec: number | null
  submitted_at: string
  is_late?: boolean
  revealed?: boolean
  passed?: boolean
  pass_percent?: number
  items: ReviewItem[]
  user_name?: string
  lesson_title?: string
  assignment_title?: string
}

type Answer = number | number[] | string

const TOPIC_LABEL: Record<string, string> = {
  nazariya: 'Nazariya',
  formula: 'Formula',
  tajriba: 'Tajriba',
  masala: 'Masala',
}

function storageKey(id: number) {
  return `af-attempt-${id}`
}

function loadDraft(id: number): Record<string, Answer> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(id)) || '{}')
  } catch {
    return {}
  }
}

function saveDraft(id: number, answers: Record<string, Answer>) {
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(answers))
  } catch {
    // private mode / storage blocked — answers just won't survive a reload
  }
}

function isAnswered(a: Answer | undefined) {
  if (a === undefined || a === '') return false
  if (Array.isArray(a)) return a.length > 0
  return true
}

/** Runs one attempt: one question per screen (phones first), progress
 * dots, draft kept in sessionStorage so a reload doesn't lose answers.
 * The server grades — this component never sees the correct answers
 * until the attempt is submitted. */
export function QuizRunner({ payload, submitUrl, onDone, title }: {
  payload: AttemptPayload
  submitUrl: string
  onDone: (r: AttemptResult) => void
  title?: string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => loadDraft(payload.id))
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const qs = payload.questions
  const q = qs[idx]
  const answeredCount = useMemo(() => qs.filter((x) => isAnswered(answers[x.id])).length, [qs, answers])

  useEffect(() => saveDraft(payload.id, answers), [payload.id, answers])
  // No automatic update while a test is open (components/AutoUpdate).
  useUpdateGuard()

  const set = (val: Answer) => setAnswers((prev) => ({ ...prev, [q.id]: val }))

  const submit = async () => {
    const missing = qs.length - answeredCount
    if (missing > 0 && !(await confirm({
      title: t('Topshirasizmi?'),
      text: `${missing} ${t("ta savolga javob berilmagan. Baribir topshirasizmi?")}`,
    }))) return
    setBusy(true)
    try {
      const res = await api.post<AttemptResult>(submitUrl, { answers })
      try {
        sessionStorage.removeItem(storageKey(payload.id))
      } catch {
        // ignore
      }
      onDone(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!q) return <p className="prose">{t("Savollar yo'q.")}</p>

  return (
    <div className="quiz">
      {title && <h3 className="quiz__title">{title}</h3>}
      <div className="quiz__dots" role="tablist" aria-label={t('Savollar')}>
        {qs.map((x, i) => (
          <button
            key={x.id}
            type="button"
            className={`quiz__dot ${i === idx ? 'is-cur' : ''} ${isAnswered(answers[x.id]) ? 'is-done' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`${i + 1}-${t('savol')}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <article className="qcard">
        <p className="qcard__meta">
          <span>{idx + 1} / {qs.length}</span>
          {q.topic && <span className="pill pill--info">{t(TOPIC_LABEL[q.topic] ?? q.topic)}</span>}
          <span className="qcard__pts">{q.points} {t('ball')}</span>
        </p>
        <p className="qcard__text">{q.text}</p>
        {q.image_url && <img className="qcard__img" src={q.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        <QuestionInput q={q} value={answers[q.id]} onChange={set} />
      </article>

      <div className="quiz__nav">
        <button type="button" className="btn" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>← {t('Oldingi')}</button>
        <span className="quiz__count">{answeredCount}/{qs.length} {t('javob')}</span>
        {idx < qs.length - 1 ? (
          <button type="button" className="btn btn--primary" onClick={() => setIdx((i) => i + 1)}>{t('Keyingi')} →</button>
        ) : (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
            {busy ? t('Yuborilmoqda…') : t('Topshirish')}
          </button>
        )}
      </div>
    </div>
  )
}

function QuestionInput({ q, value, onChange }: { q: QItem; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const { t } = useTranslation()
  if (q.kind === 'test' || q.kind === 'multi') {
    const multi = q.kind === 'multi'
    const selected = multi ? ((value as number[]) ?? []) : value
    return (
      <div className="opts" role={multi ? 'group' : 'radiogroup'}>
        {multi && <p className="form__note">{t("Bir nechta to'g'ri javob bo'lishi mumkin.")}</p>}
        {(q.options ?? []).map((opt, i) => {
          const on = multi ? (selected as number[]).includes(i) : selected === i
          return (
            <button
              key={i}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              className={`opt ${on ? 'is-on' : ''}`}
              onClick={() => {
                if (!multi) return onChange(i)
                const cur = selected as number[]
                onChange(on ? cur.filter((x) => x !== i) : [...cur, i])
              }}
            >
              <span className="opt__key">{String.fromCharCode(65 + i)}</span>
              <span className="opt__txt">{opt}</span>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <label className="field">
      <span className="field__label">{q.kind === 'number' ? t('Javob (son)') : t('Javob')}</span>
      <span className="qnum">
        <input
          className="input"
          inputMode={q.kind === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          maxLength={200}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.kind === 'number' ? '0,0' : ''}
        />
        {q.unit && <span className="qnum__unit">{q.unit}</span>}
      </span>
    </label>
  )
}

function givenText(item: ReviewItem): string {
  const g = item.given
  if (g === null || g === undefined || g === '' || (Array.isArray(g) && !g.length)) return '—'
  if (item.kind === 'test') return item.options?.[Number(g)] ?? String(g)
  if (item.kind === 'multi' && Array.isArray(g)) return g.map((i) => item.options?.[Number(i)] ?? i).join(', ')
  return `${g}${item.unit ? ` ${item.unit}` : ''}`
}

function correctText(item: ReviewItem): string | null {
  if (item.kind === 'number') return item.answer_value != null ? `${item.answer_value}${item.unit ? ` ${item.unit}` : ''}` : null
  if (!item.correct) return null
  if (item.kind === 'text') return item.correct.join(' / ')
  return item.correct.map((i) => item.options?.[Number(i)] ?? i).join(', ')
}

/** Score header + per-question review after submission. */
export function AttemptReview({ result, onClose }: { result: AttemptResult; onClose?: () => void }) {
  const { t } = useTranslation()
  const correctCount = result.items.filter((i) => i.ok).length
  return (
    <div className="review">
      <div className={`review__score gchip--${pctLevel(result.percent)}`}>
        <span className="review__pct">{Math.round(result.percent)}%</span>
        <span className="review__sub">
          {correctCount}/{result.items.length} {t("to'g'ri")} · {result.score}/{result.max_score} {t('ball')}
          {result.duration_sec != null && ` · ${fmtDuration(result.duration_sec)}`}
        </span>
        {result.passed !== undefined && (
          <span className={`pill ${result.passed ? 'pill--ok' : 'pill--bad'}`}>
            {result.passed ? `✓ ${t('Darsga tayyorsiz')}` : `${t('Yana takrorlang')} (${result.pass_percent}%+)`}
          </span>
        )}
        {result.is_late && <span className="pill pill--mid">{t('Kechikib topshirilgan')}</span>}
      </div>
      {result.revealed === false && (
        <p className="form__note">{t("To'g'ri javoblar o'qituvchi belgilagan vaqtda ko'rsatiladi.")}</p>
      )}
      <ol className="review__list">
        {result.items.map((item) => {
          const right = correctText(item)
          return (
            <li key={item.id} className={`ritem ${item.ok ? 'is-ok' : 'is-bad'}`}>
              <p className="ritem__q">
                <span className="ritem__mark" aria-label={item.ok ? t("To'g'ri") : t("Noto'g'ri")}>{item.ok ? '✓' : '✗'}</span>
                {item.text}
              </p>
              <p className="ritem__a"><span>{t('Sizning javobingiz')}:</span> {givenText(item)}</p>
              {!item.ok && right && <p className="ritem__a ritem__a--right"><span>{t("To'g'ri javob")}:</span> {right}</p>}
              {item.explanation && <p className="ritem__ex">{item.explanation}</p>}
            </li>
          )
        })}
      </ol>
      {onClose && <button type="button" className="btn btn--primary" onClick={onClose}>{t('Yopish')}</button>}
    </div>
  )
}
