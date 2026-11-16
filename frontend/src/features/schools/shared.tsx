import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { avgLevel, levelLabel, pctLevel } from '@/features/journal/scales'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useSchoolsMutation, type Metrics, type School } from './api'

type Tone = 'ok' | 'mid' | 'bad' | 'muted'

function tone(value: number | null, good: number, fair: number): Tone {
  if (value == null) return 'muted'
  return value >= good ? 'ok' : value >= fair ? 'mid' : 'bad'
}

/** Value + colour pill; the number itself always carries the meaning, the
 * colour only helps scanning a long table. Scores (`band`) wear the
 * platform's grading colours (features/journal/scales.ts): 'pct' by the
 * 100-point column, 'mark' as the 0-5 mark the average rounds to. Anything
 * else (attendance) is toned by its own good/fair thresholds. */
export function MetricPill({ value, good = 0, fair = 0, band, suffix = '%', digits = 0 }: {
  value: number | null
  good?: number
  fair?: number
  band?: 'pct' | 'mark'
  suffix?: string
  digits?: number
}) {
  const { t } = useTranslation()
  if (value == null) return <span className="pill pill--muted">—</span>
  if (band) {
    const l = band === 'pct' ? pctLevel(value) : avgLevel(value, 5)
    return <span className={`pill gchip--${l}`} title={t(levelLabel(l))}>{value.toFixed(digits)}{suffix}</span>
  }
  return <span className={`pill pill--${tone(value, good, fair)}`}>{value.toFixed(digits)}{suffix}</span>
}

export const METRIC_HELP =
  "O'zlashtirish — o'quvchilar olgan baholarning o'rtachasi, eng yuqori bahoga nisbatan foizda (5 ballikda o'rtacha 4,2 — 84%). " +
  "Sifat — bahosi bor o'quvchilardan o'rtachasi «yaxshi» yoki «a'lo» (4 va 5) bo'lganlar ulushi. " +
  "Davomat — (sababli + sababsiz) qoldirilgan darslardan tashqari qatnashuv; kechikish alohida sanaladi."

/** The three journal metric cells shared by every table on these pages. */
export function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td><MetricPill value={m.avg_mark} band="mark" suffix="" digits={2} /></td>
      <td><MetricPill value={m.uzlashtirish} band="pct" /></td>
      <td title={m.graded ? `${m.sifat_n ?? 0} / ${m.graded}` : undefined}><MetricPill value={m.sifat} good={50} fair={30} /></td>
      <td><MetricPill value={m.attendance} good={95} fair={85} /></td>
    </>
  )
}

export function MetricHeads() {
  const { t } = useTranslation()
  return (
    <>
      <th title={t(METRIC_HELP)}>{t("O'rtacha baho")}</th>
      <th title={t(METRIC_HELP)}>{t("O'zlashtirish")}</th>
      <th title={t(METRIC_HELP)}>{t('Sifat')}</th>
      <th title={t(METRIC_HELP)}>{t('Davomat')}</th>
    </>
  )
}

export function metricCsv(m: Metrics) {
  return [m.avg_mark ?? '', m.uzlashtirish ?? '', m.sifat ?? '', m.attendance ?? '', m.abs_s, m.abs_n, m.late]
}

export const METRIC_CSV_HEAD = ["O'rtacha baho", "O'zlashtirish %", 'Sifat %', 'Davomat %', 'Sababli', 'Sababsiz', 'Kech']

const EMPTY: Partial<School> = {
  name: '', district: '', address: '', director: '', phone: '', contract_start: null, contract_end: null,
  is_active: true, aliases: [], notes: '',
}

export function SchoolFormModal({ initial, onClose }: { initial: Partial<School> | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [s, setS] = useState<Partial<School>>(initial ?? EMPTY)
  const set = (patch: Partial<School>) => setS({ ...s, ...patch })
  const save = useSchoolsMutation(async (body: Partial<School>) =>
    s.id ? api.patch(`/schools/${s.id}/`, body) : api.post('/schools/', body))

  const submit = async () => {
    try {
      // one official name: no other spellings are kept (Hamkor maktablar)
      await save.mutateAsync({
        ...s,
        aliases: [],
        contract_start: s.contract_start || null,
        contract_end: s.contract_end || null,
      })
      toast(t('Saqlandi'))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal title={s.id ? t('Maktabni tahrirlash') : t("Hamkor maktab qo'shish")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={save.isPending} onClick={submit}>{t('Saqlash')}</button></>}>
      <label className="field">
        <span className="field__label">{t('Rasmiy nomi')}</span>
        <input className="input" maxLength={200} value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Sodiq School (Aeroport)" />
      </label>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Tuman / shahar')}</span>
          <input className="input" maxLength={120} value={s.district} onChange={(e) => set({ district: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Manzil')}</span>
          <input className="input" maxLength={300} value={s.address} onChange={(e) => set({ address: e.target.value })} />
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Direktor')}</span>
          <input className="input" maxLength={150} value={s.director} onChange={(e) => set({ director: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Telefon')}</span>
          <input className="input" type="tel" maxLength={40} value={s.phone} onChange={(e) => set({ phone: e.target.value })} />
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Shartnoma boshlanishi')}</span>
          <input className="input" type="date" value={s.contract_start ?? ''} onChange={(e) => set({ contract_start: e.target.value || null })} />
        </label>
        <label className="field">
          <span className="field__label">{t('Shartnoma tugashi')}</span>
          <input className="input" type="date" value={s.contract_end ?? ''} onChange={(e) => set({ contract_end: e.target.value || null })} />
        </label>
      </div>
      <p className="form__note">{t("Jurnal va jadvalda shu nom ishlatiladi; nomni o'zgartirsangiz, hamma joyda o'zgaradi.")}</p>
      <label className="field">
        <span className="field__label">{t('Izoh')}</span>
        <textarea className="input" rows={2} value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={!!s.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
        <span>{t('Faol hamkor')}</span>
      </label>
    </Modal>
  )
}
