import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

import type { Question, QuestionKind } from './api'

const KINDS: { value: QuestionKind; label: string }[] = [
  { value: 'test', label: 'Test (bitta javob)' },
  { value: 'multi', label: 'Test (bir nechta javob)' },
  { value: 'number', label: 'Masala (son javob)' },
  { value: 'text', label: 'Qisqa javob (matn)' },
]

const TOPICS: { value: Question['topic']; label: string }[] = [
  { value: 'nazariya', label: 'Nazariya' },
  { value: 'formula', label: 'Formula' },
  { value: 'tajriba', label: 'Tajriba' },
  { value: 'masala', label: 'Masala' },
]

/** Edits one question in place. Answer fields adapt to the kind; the
 * backend re-validates everything (option count, correct index, etc.). */
export function QuestionEditor({ value, onChange, onRemove, index }: {
  value: Question
  onChange: (q: Question) => void
  onRemove?: () => void
  index?: number
}) {
  const { t } = useTranslation()
  const q = value
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch })

  const setKind = (kind: QuestionKind) => {
    if (kind === 'test' || kind === 'multi') {
      set({ kind, options: q.options.length >= 2 ? q.options : ['', '', '', ''], correct: [0] })
    } else if (kind === 'number') {
      set({ kind, options: [], correct: [], topic: q.topic === 'nazariya' ? 'masala' : q.topic })
    } else {
      set({ kind, options: [], correct: [''] })
    }
  }

  const isChoice = q.kind === 'test' || q.kind === 'multi'

  return (
    <div className="qedit">
      <div className="qedit__head">
        {index != null && <span className="qedit__n">{index + 1}</span>}
        <select className="input input--sm" value={q.kind} onChange={(e) => setKind(e.target.value as QuestionKind)} aria-label={t('Savol turi')}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
        </select>
        <select className="input input--sm" value={q.topic} onChange={(e) => set({ topic: e.target.value as Question['topic'] })} aria-label={t("Bo'lim")}>
          {TOPICS.map((k) => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
        </select>
        <label className="qedit__pts">
          <input className="input input--sm" type="number" min={1} max={20} value={q.points}
            onChange={(e) => set({ points: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
          <span>{t('ball')}</span>
        </label>
        {onRemove && (
          <button type="button" className="icon-btn" onClick={onRemove} aria-label={t("O'chirish")}>{IC.trash}</button>
        )}
      </div>

      <textarea className="input" rows={2} placeholder={t('Savol matni')} value={q.text} maxLength={2000}
        onChange={(e) => set({ text: e.target.value })} />

      {isChoice && (
        <div className="qedit__opts">
          {q.options.map((opt, i) => {
            const on = q.correct.includes(i)
            return (
              <div className="qedit__opt" key={i}>
                <button
                  type="button"
                  className={`qedit__mark ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  title={t("To'g'ri javob")}
                  onClick={() => {
                    if (q.kind === 'test') set({ correct: [i] })
                    else set({ correct: on ? q.correct.filter((c) => c !== i) : [...q.correct, i] })
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </button>
                <input className="input" value={opt} maxLength={300} placeholder={`${t('Variant')} ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => set({ options: q.options.map((o, j) => (j === i ? e.target.value : o)) })} />
                {q.options.length > 2 && (
                  <button type="button" className="icon-btn" aria-label={t("Variantni o'chirish")}
                    onClick={() => set({
                      options: q.options.filter((_, j) => j !== i),
                      correct: q.correct.filter((c) => c !== i).map((c) => (Number(c) > i ? Number(c) - 1 : c)),
                    })}>{IC.close}</button>
                )}
              </div>
            )
          })}
          {q.options.length < 6 && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => set({ options: [...q.options, ''] })}>
              + {t("Variant qo'shish")}
            </button>
          )}
          <p className="form__note">{t("To'g'ri javob(lar) harfini bosib belgilang.")}</p>
        </div>
      )}

      {q.kind === 'number' && (
        <div className="row row--3">
          <label className="field">
            <span className="field__label">{t("To'g'ri javob")}</span>
            <input className="input" inputMode="decimal" value={q.answer_value ?? ''}
              onChange={(e) => {
                const v = e.target.value.replace(',', '.')
                set({ answer_value: v === '' || Number.isNaN(Number(v)) ? null : Number(v) })
              }} />
          </label>
          <label className="field">
            <span className="field__label">{t("Ruxsat etilgan xato, %")}</span>
            <input className="input" type="number" min={0} max={50} step={0.5} value={q.tolerance_pct}
              onChange={(e) => set({ tolerance_pct: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field__label">{t("O'lchov birligi")}</span>
            <input className="input" value={q.unit} maxLength={32} placeholder="m/s" onChange={(e) => set({ unit: e.target.value })} />
          </label>
        </div>
      )}

      {q.kind === 'text' && (
        <label className="field">
          <span className="field__label">{t('Qabul qilinadigan javoblar (vergul bilan)')}</span>
          <input className="input" value={q.correct.join(', ')}
            onChange={(e) => set({ correct: e.target.value.split(',').map((s) => s.trim()) })} />
        </label>
      )}

      <details className="qedit__more">
        <summary>{t("Qo'shimcha: rasm va izoh")}</summary>
        <label className="field">
          <span className="field__label">{t('Rasm havolasi (ixtiyoriy)')}</span>
          <input className="input" type="url" value={q.image_url} placeholder="https://…" onChange={(e) => set({ image_url: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Izoh (topshirgandan keyin ko\'rsatiladi)')}</span>
          <textarea className="input" rows={2} value={q.explanation} maxLength={2000} onChange={(e) => set({ explanation: e.target.value })} />
        </label>
      </details>
    </div>
  )
}

/** Strips client-only bits before sending (empty text answers etc.). */
export function cleanQuestion(q: Question): Question {
  const out = { ...q }
  if (q.kind === 'text') out.correct = q.correct.filter((c) => String(c).trim())
  if (q.kind === 'test' || q.kind === 'multi') out.options = q.options.map((o) => o.trim())
  return out
}
