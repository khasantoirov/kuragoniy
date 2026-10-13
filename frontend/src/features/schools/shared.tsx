import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useSchoolsMutation, type Metrics, type School } from './api'

type Tone = 'ok' | 'mid' | 'bad' | 'muted'

function tone(value: number | null, good: number, fair: number): Tone {
  if (value == null) return 'muted'
  return value >= good ? 'ok' : value >= fair ? 'mid' : 'bad'
}

/** Value + word-free colour pill; the number itself always carries the
 * meaning, the colour only helps scanning a long table. */
export function MetricPill({ value, good, fair, suffix = '%', digits = 0 }: {
  value: number | null
  good: number
  fair: number
  suffix?: string
  digits?: number
}) {
  if (value == null) return <span className="pill pill--muted">—</span>
  return <span className={`pill pill--${tone(value, good, fair)}`}>{value.toFixed(digits)}{suffix}</span>
}

export const METRIC_HELP =
  "O'zlashtirish — o'rtacha bahosi 2,5 va undan yuqori (ya'ni «3» va yuqori) o'quvchilar ulushi. " +
  "Sifat — o'rtacha bahosi 3,5 va undan yuqori («4»–«5»). " +
  "Davomat — (sababli + sababsiz) qoldirilgan darslardan tashqari qatnashuv; kechikish alohida sanaladi."

/** The four journal metric cells shared by every table on these pages. */
export function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td><MetricPill value={m.avg_mark} good={4} fair={3} suffix="" digits={2} /></td>
      <td><MetricPill value={m.uzlashtirish} good={90} fair={70} /></td>
      <td><MetricPill value={m.sifat} good={60} fair={40} /></td>
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
  const [aliasText, setAliasText] = useState((initial?.aliases ?? []).join('\n'))
  const set = (patch: Partial<School>) => setS({ ...s, ...patch })
  const save = useSchoolsMutation(async (body: Partial<School>) =>
    s.id ? api.patch(`/schools/${s.id}/`, body) : api.post('/schools/', body))

  const submit = async () => {
    try {
      await save.mutateAsync({
        ...s,
        aliases: aliasText.split('\n').map((a) => a.trim()).filter(Boolean),
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
      <label className="field">
        <span className="field__label">{t('Muqobil yozilishlari')} <span className="field__opt">({t('har biri yangi qatorda')})</span></span>
        <textarea className="input" rows={3} value={aliasText} onChange={(e) => setAliasText(e.target.value)}
          placeholder={'Sodiq school\nSodiq'} />
      </label>
      <p className="form__note">{t("Jurnal va jadvalda shu nomlardan biri yozilgan sinflar avtomatik shu maktabga biriktiriladi.")}</p>
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
