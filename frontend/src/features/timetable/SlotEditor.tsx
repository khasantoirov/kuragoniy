import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

import { DAYS, hourLabel, LESSON_TYPE_LABELS, PERIODS, SOATLAR, type TimetableSlot } from './types'

export function SlotEditor({
  slot,
  onSave,
  onDelete,
  onMove,
  onClose,
}: {
  slot: TimetableSlot
  onSave: (slot: TimetableSlot) => void
  onDelete?: () => void
  onMove?: (target: { day_index: number; period_index: number }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [draft, setDraft] = useState<TimetableSlot>(slot)
  const [moveDay, setMoveDay] = useState(slot.day_index)
  const [movePeriod, setMovePeriod] = useState(slot.period_index)
  const hasLesson = !!(slot.sinf || slot.xona || slot.maktab || slot.band || slot.lesson_type)
  const maxSpan = SOATLAR - slot.period_index + 1
  const sameSlot = moveDay === slot.day_index && movePeriod === slot.period_index

  return (
    <Modal
      title={`${t(DAYS[draft.day_index])} · ${hourLabel(draft.period_index, lang)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={() => { onSave(draft); onClose() }}>{t('Saqlash')}</button>
        </>
      }
    >
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Boshlanish')}</span>
          <input className="input" type="time" value={draft.time_from?.slice(0, 5) ?? ''} onChange={(e) => setDraft({ ...draft, time_from: e.target.value || null })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Tugash')}</span>
          <input className="input" type="time" value={draft.time_to?.slice(0, 5) ?? ''} onChange={(e) => setDraft({ ...draft, time_to: e.target.value || null })} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('Maktab')}</span>
        <input className="input" value={draft.maktab} onChange={(e) => setDraft({ ...draft, maktab: e.target.value })} placeholder={t('Masalan: Yuksalish maktabi')} />
      </label>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Xona')}</span>
          <input className="input" value={draft.xona} onChange={(e) => setDraft({ ...draft, xona: e.target.value })} placeholder="210" />
        </label>
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <input className="input" value={draft.sinf} onChange={(e) => setDraft({ ...draft, sinf: e.target.value })} placeholder="8-A" />
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Necha soat')}</span>
          <select className="input" value={draft.span} onChange={(e) => setDraft({ ...draft, span: Number(e.target.value) })}>
            {Array.from({ length: maxSpan }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {t('soat')}{n > 1 ? ` (${draft.period_index}–${draft.period_index + n - 1})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Turi')}</span>
          <select className="input" value={draft.band ? '1' : ''} onChange={(e) => setDraft({ ...draft, band: !!e.target.value, lesson_type: e.target.value ? '' : draft.lesson_type })}>
            <option value="">{t('Dars')}</option>
            <option value="1">{t('Band (boshqa joyda)')}</option>
          </select>
        </label>
      </div>
      {!draft.band && (
        <label className="field">
          <span className="field__label">{t('Fizika darsi turi')}</span>
          <select
            className="input"
            value={draft.lesson_type}
            onChange={(e) => setDraft({ ...draft, lesson_type: e.target.value as TimetableSlot['lesson_type'] })}
          >
            <option value="">{t('Belgilanmagan')}</option>
            <option value="nazariy">{t(LESSON_TYPE_LABELS.nazariy)}</option>
            <option value="amaliy">{t(LESSON_TYPE_LABELS.amaliy)}</option>
            <option value="engineering">{t(LESSON_TYPE_LABELS.engineering)}</option>
          </select>
        </label>
      )}
      <p className="prose prose--note">
        {t('Bir necha soat davom etsa — «Necha soat»ni tanlang. Masalan universitetda 5–8-soat band bo\'lsangiz: 5-soatni ochib, 4 soat deb belgilang.')}
      </p>
      {hasLesson && onMove && (
        <div className="field">
          <span className="field__label">{t("Boshqa soatga ko'chirish")}</span>
          <div className="row row--2">
            <select className="input" value={moveDay} onChange={(e) => setMoveDay(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{t(d)}</option>
              ))}
            </select>
            <select className="input" value={movePeriod} onChange={(e) => setMovePeriod(Number(e.target.value))}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{hourLabel(p, lang)}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn--sm"
            type="button"
            disabled={sameSlot}
            onClick={() => { onMove({ day_index: moveDay, period_index: movePeriod }); onClose() }}
          >
            {IC.move} {t("Ko'chirish")}
          </button>
        </div>
      )}
      {hasLesson && onDelete ? (
        <button className="btn btn--sm btn--ghost" type="button" onClick={() => { onDelete(); onClose() }}>
          {IC.trash} {t("Darsni o'chirish (jadval)")}
        </button>
      ) : (
        <p className="prose prose--note">{t("Katakni bo'shatish uchun barcha maydonlarni tozalang.")}</p>
      )}
    </Modal>
  )
}
