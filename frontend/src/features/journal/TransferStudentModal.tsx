import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { record } from '@/lib/history'

import { useTransferStudent, useTransferTargets, useUndoTransfer, type TransferMode, type TransferTarget } from './api'

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

export interface TransferPupil {
  /** The journal's roster row (Student) id. */
  id: number
  name: string
  /** "12-maktab | 8-A (Karimov Aziz)" — where the pupil is now. */
  from: string
}

/** O'quvchini boshqa sinfga ko'chirish — the pupil's teacher (or an
 * administrator) picks the new class, theirs or a colleague's, and whether
 * the marks go along or stay behind as an archive. */
export function TransferStudentModal({ pupil, onClose, onDone }: { pupil: TransferPupil; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: targets, isLoading } = useTransferTargets(pupil.id)
  const transfer = useTransferStudent()
  const undoTransfer = useUndoTransfer()
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState<TransferMode | null>(null)

  // one's own classes first, then the others by school
  const groups = new Map<string, TransferTarget[]>()
  for (const c of targets ?? []) {
    const key = c.mine ? t('Mening sinflarim') : c.school || t('Biriktirilmagan')
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const picked = targets?.find((c) => String(c.id) === target)

  const submit = async () => {
    if (!target || !mode) return
    try {
      const move = { student: pupil.id, target: Number(target), mode }
      // Ctrl+Z puts the move back on the server exactly; Ctrl+Shift+Z moves again
      const done = { id: (await transfer.mutateAsync(move)).transfer }
      record(`${t("Ko'chirish")}: ${pupil.name} → ${picked?.name ?? ''}`,
        async () => { await undoTransfer.mutateAsync(done.id) },
        async () => { done.id = (await transfer.mutateAsync(move)).transfer })
      toast(`${t("Ko'chirildi")}: ${pupil.name} → ${picked?.name ?? ''} · ${t('Ctrl+Z — bekor qilish')}`)
      onClose()
      onDone?.()
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
        <b>{pupil.name}</b> — {t('hozir')} {pupil.from}
      </p>
      {isLoading ? <Skeleton lines={2} /> : (
        <label className="field">
          <span className="field__label">{t('Yangi sinf')}</span>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('Sinfni tanlang')}</option>
            {[...groups].map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.mine ? '' : ` — ${c.teacher}`}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
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
        {picked && !picked.mine && <>{t("Sinf o'qituvchisiga xabar boradi.")}{' '}</>}
        {t("Sinflarning baholash shkalasi farq qilsa, baholar yangi shkalaga o'tkaziladi — har birining rang toifasi saqlanadi.")}
        {' '}{t("O'quvchining platforma hisobi ham yangi sinfga o'tadi.")}
      </p>
    </Modal>
  )
}
