import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

import { usePartnerSchools } from './api'
import { DAYS, hourLabel, PERIODS, SOATLAR, type TimetableSlot } from './types'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** A time typed as 24-hour soat:minut — the browser's own time picker shows
 * AM/PM on many devices. Digits only, the colon goes in by itself ("0930",
 * "930" and "9:30" all give 09:30). Hands back "HH:MM", or null when emptied. */
function HhMmInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [text, setText] = useState(value?.slice(0, 5) ?? '')
  const type = (raw: string) => {
    const r = raw.replace(/[.,\s-]/g, ':')
    let next: string
    if (r.includes(':')) {
      const [h, m = ''] = r.split(':')
      next = `${h.replace(/\D/g, '').slice(-2).padStart(2, '0')}:${m.replace(/\D/g, '').slice(0, 2)}`
    } else {
      // an hour cannot start with 3–9, so such a digit is the hour itself: 930 → 09:30
      const d = r.replace(/\D/g, '').replace(/^[3-9]/, '0$&').slice(0, 4)
      next = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
    }
    setText(next)
    if (!next) onChange(null)
    else if (HHMM.test(next)) onChange(next)
  }
  // Leaving the box: an hour alone becomes HH:00; anything that is not a
  // real time goes back to the last good one, so nothing wrong is saved.
  const leave = () => {
    if (/^\d{1,2}$/.test(text) && Number(text) < 24) {
      const whole = `${text.padStart(2, '0')}:00`
      setText(whole)
      onChange(whole)
    } else if (text && !HHMM.test(text)) {
      setText(value?.slice(0, 5) ?? '')
    }
  }
  // red only for a time that cannot be, not for one still being typed
  const bad = (text.length === 5 && !HHMM.test(text)) || Number(text.slice(0, 2)) > 23
  return (
    <input className="input" inputMode="numeric" placeholder="00:00" maxLength={5} value={text}
      aria-invalid={bad || undefined} onChange={(e) => type(e.target.value)} onBlur={leave} />
  )
}

export function SlotEditor({
  slot,
  onSave,
  onDelete,
  onMove,
  onClose,
  choosePlace,
}: {
  slot: TimetableSlot
  onSave: (slot: TimetableSlot) => void
  onDelete?: () => void
  onMove?: (target: { day_index: number; period_index: number }) => void
  onClose: () => void
  /** A new lesson from "Yangi dars qo'shish": its day and soat are picked here. */
  choosePlace?: boolean
}) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [draft, setDraft] = useState<TimetableSlot>(slot)
  const toast = useToast()
  const { data: schoolList } = usePartnerSchools()
  // the active schools, and the cell's own one even if it was switched off since
  const schools = (schoolList ?? []).filter((s) => s.is_active !== false || s.id === draft.school)
  // an old cell whose name was typed by hand and not matched to a school yet
  const unpicked = !draft.band && !draft.school && !!draft.maktab.trim()
  const pickSchool = (raw: string) => {
    const s = schools.find((x) => x.id === Number(raw))
    setDraft({ ...draft, school: s?.id ?? null, maktab: s?.name ?? '' })
  }
  const save = () => {
    const lesson = !!(draft.sinf.trim() || draft.xona.trim() || draft.maktab.trim())
    if (!draft.band && lesson && !draft.school) {
      toast(t("Maktabni ro'yxatdan tanlang"), 'error')
      return
    }
    onSave(draft)
    onClose()
  }
  const [moveDay, setMoveDay] = useState(slot.day_index)
  const [movePeriod, setMovePeriod] = useState(slot.period_index)
  const hasLesson = !!(slot.sinf || slot.xona || slot.maktab || slot.band)
  const maxSpan = SOATLAR - draft.period_index + 1
  const sameSlot = moveDay === slot.day_index && movePeriod === slot.period_index

  return (
    <Modal
      title={choosePlace ? t('Yangi dars') : `${t(DAYS[draft.day_index])} · ${hourLabel(draft.period_index, lang)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={save}>{t('Saqlash')}</button>
        </>
      }
    >
      {choosePlace && (
        <div className="row row--2">
          <label className="field">
            <span className="field__label">{t('Kun')}</span>
            <select className="input" value={draft.day_index} onChange={(e) => setDraft({ ...draft, day_index: Number(e.target.value) })}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{t(d)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('Soat')}</span>
            <select
              className="input"
              value={draft.period_index}
              onChange={(e) => {
                const p = Number(e.target.value)
                setDraft({ ...draft, period_index: p, span: Math.min(draft.span, SOATLAR - p + 1) })
              }}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>{hourLabel(p, lang)}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Boshlanish')}</span>
          <HhMmInput value={draft.time_from} onChange={(v) => setDraft((d) => ({ ...d, time_from: v }))} />
        </label>
        <label className="field">
          <span className="field__label">{t('Tugash')}</span>
          <HhMmInput value={draft.time_to} onChange={(v) => setDraft((d) => ({ ...d, time_to: v }))} />
        </label>
      </div>
      {draft.band ? (
        <label className="field">
          <span className="field__label">{t('Qayerda band')}</span>
          <input className="input" value={draft.maktab} onChange={(e) => setDraft({ ...draft, maktab: e.target.value })} placeholder={t('Masalan: universitet')} />
        </label>
      ) : (
        <label className="field">
          <span className="field__label">{t('Maktab')}</span>
          <select className="input" value={draft.school ?? ''} onChange={(e) => pickSchool(e.target.value)}>
            <option value="">{t('Maktabni tanlang…')}</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_active === false ? ` (${t('faol emas')})` : ''}</option>
            ))}
          </select>
          {unpicked && <small className="field__warn">⚠ «{draft.maktab}» {t("qo'lda yozilgan — ro'yxatdan maktabni tanlang.")}</small>}
          <small className="field__hint">{t("Maktabingiz ro'yxatda yo'q bo'lsa, ma'muriyatga ayting — ular «Hamkor maktablar» bo'limiga qo'shadi.")}</small>
        </label>
      )}
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
          <select className="input" value={draft.band ? '1' : ''} onChange={(e) => setDraft({ ...draft, band: !!e.target.value, school: e.target.value ? null : draft.school })}>
            <option value="">{t('Dars')}</option>
            <option value="1">{t('Band (boshqa joyda)')}</option>
          </select>
        </label>
      </div>
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
      ) : !choosePlace && (
        <p className="prose prose--note">{t("Katakni bo'shatish uchun barcha maydonlarni tozalang.")}</p>
      )}
    </Modal>
  )
}
