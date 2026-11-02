import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useTransferStudent, type TransferMode } from '@/features/journal/api'

import { useClassRows, type DirectoryRow } from './api'

const MODES: { v: TransferMode; title: string; text: string }[] = [
  {
    v: 'carry',
    title: "Baholari bilan ko'chirish",
    text: "Baho, davomat, chorak bahosi va nazorat ishlari yangi sinf jurnaliga o'tadi; eski jurnalda iz qolmaydi.",
  },
  {
    v: 'archive',
    title: 'Eski sinfda arxiv qoldirish',
    text: "Baholari eski jurnalda kulrang qatorda qoladi; yangi sinfda toza sahifadan boshlaydi.",
  },
]

/** O'quvchini boshqa sinfga ko'chirish — the administrator picks the new
 * class and whether the marks go along or stay behind as an archive. */
export function TransferStudentModal({ row, onClose }: { row: DirectoryRow; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: classes } = useClassRows()
  const transfer = useTransferStudent()
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState<TransferMode | null>(null)

  // grouped by school, the pupil's own class left out
  const groups = new Map<string, NonNullable<typeof classes>>()
  for (const c of classes ?? []) {
    if (c.class_id === row.class_id) continue
    const key = c.school || c.school_text || t('Biriktirilmagan')
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const picked = classes?.find((c) => String(c.class_id) === target)

  const submit = async () => {
    if (!target || !mode) return
    try {
      await transfer.mutateAsync({ student: row.id, target: Number(target), mode })
      toast(`${t("Ko'chirildi")}: ${row.name} → ${picked?.name ?? ''}`)
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Xatolik yuz berdi'), 'error')
    }
  }

  return (
    <Modal
      title={t("Boshqa sinfga ko'chirish")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={!target || !mode || transfer.isPending}>
            {transfer.isPending ? t('Saqlanmoqda…') : t("Ko'chirish")}
          </button>
        </>
      }
    >
      <p className="prose prose--note">
        <b>{row.name}</b> — {t('hozir')} {row.school ? `${row.school} | ` : ''}{row.class_name} ({row.teacher})
      </p>
      <label className="field">
        <span className="field__label">{t('Yangi sinf')}</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t('Sinfni tanlang')}</option>
          {[...groups].map(([school, list]) => (
            <optgroup key={school} label={school}>
              {list.map((c) => <option key={c.class_id} value={c.class_id}>{c.name} — {c.teacher}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="dlpick">
        {MODES.map((m) => (
          <button key={m.v} type="button" className={`dlpick__opt ${mode === m.v ? 'is-on' : ''}`} aria-pressed={mode === m.v} onClick={() => setMode(m.v)}>
            <span className="dlpick__tx">
              <span className="dlpick__t">{t(m.title)}</span>
              <span className="dlpick__s">{t(m.text)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="form__note">
        {t("Sinflarning baholash shkalasi farq qilsa, baholar yangi shkalaga o'tkaziladi — har birining rang toifasi saqlanadi.")}
        {' '}{t("O'quvchining platforma hisobi ham yangi sinfga o'tadi.")}
      </p>
    </Modal>
  )
}
