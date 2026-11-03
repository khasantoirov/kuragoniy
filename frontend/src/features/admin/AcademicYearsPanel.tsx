import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, StatusPill } from '@/features/portal/ui'
import { useYears, type AcademicYear } from '@/features/schools/api'
import { api } from '@/lib/api/client'
import { record } from '@/lib/history'
import { useYearStore } from '@/lib/year'

import { RolloverModal } from './RolloverModal'

/** Boshqaruv → O'quv yillari: the years, which one is current (where new
 * classes go and what every page shows first), and adding the next one. */
export function AcademicYearsPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const setYear = useYearStore((s) => s.setYear)
  const { data: years, isLoading } = useYears()
  const [rolling, setRolling] = useState<AcademicYear | null>(null)

  const refresh = () => {
    setYear(null)
    for (const key of ['journal', 'schools', 'learning']) queryClient.invalidateQueries({ queryKey: [key] })
  }
  const add = useMutation({ mutationFn: async () => (await api.post<AcademicYear>('/schools/years/')).data, onSuccess: refresh })
  const makeCurrent = useMutation({ mutationFn: async (id: number) => (await api.post(`/schools/years/${id}/`)).data, onSuccess: refresh })
  const remove = useMutation({ mutationFn: async (id: number) => api.delete(`/schools/years/${id}/`), onSuccess: refresh })

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast(t(done))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const next = years?.length ? `${years[0].start_year + 1}-${years[0].start_year + 2}` : ''

  const onCurrent = async (y: AcademicYear) => {
    if (!(await confirm({
      title: `${y.name} — ${t("joriy o'quv yili")}`,
      text: t("Yangi sinflar shu yilga qo'shiladi, Jurnal va Statistika birinchi navbatda shu yilni ko'rsatadi. Boshqa yillarning ma'lumoti o'zgarmaydi."),
    }))) return
    const was = years?.find((x) => x.is_current)
    await run(async () => {
      await makeCurrent.mutateAsync(y.id)
      // Ctrl+Z makes the previous year current again
      if (was) record(`${t("Joriy o'quv yili")}: ${y.name}`, async () => { await makeCurrent.mutateAsync(was.id) }, async () => { await makeCurrent.mutateAsync(y.id) })
    }, 'Saqlandi')
  }
  const onRemove = async (y: AcademicYear) => {
    if (!(await confirm({ title: t("O'quv yilini o'chirish"), text: y.name, danger: true }))) return
    await run(() => remove.mutateAsync(y.id), "O'chirildi")
  }

  return (
    <section className="panel">
      <h3 className="panel__title">{t("O'quv yillari")}</h3>
      <p className="prose prose--note">
        {t("Har bir sinf jurnali bitta o'quv yiliga tegishli. Jurnal, Statistika va O'quvchilar bazasining tepasidagi tanlagichdan istalgan yilni ko'rish mumkin.")}
      </p>
      {isLoading || !years ? <Skeleton lines={3} /> : (
        <div className="tablewrap">
          <table className="dtable dtable--stack">
            <thead>
              <tr><th>{t("O'quv yili")}</th><th>{t('Sinflar')}</th><th>{t('Holat')}</th><th /></tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.id}>
                  <td>{y.name}</td>
                  <td data-label={t('Sinflar')}>{y.classes}</td>
                  <td>{y.is_current ? <StatusPill tone="ok">{t('Joriy')}</StatusPill> : null}</td>
                  <td className="dtable__acts">
                    {y.classes > 0 && (
                      <button className="btn btn--sm btn--primary" onClick={() => setRolling(y)}>{t("Keyingi yilga o'tkazish")}…</button>
                    )}
                    {!y.is_current && (
                      <button className="btn btn--sm" disabled={makeCurrent.isPending} onClick={() => onCurrent(y)}>{t('Joriy qilish')}</button>
                    )}
                    {!y.is_current && y.classes === 0 && (
                      <button className="btn btn--sm btn--ghost" disabled={remove.isPending} onClick={() => onRemove(y)}>{t("O'chirish")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <div className="panel__acts" style={{ marginTop: 12 }}>
          <button className="btn btn--primary" disabled={add.isPending} onClick={() => run(() => add.mutateAsync(), "O'quv yili qo'shildi")}>
            + {next} {t("o'quv yilini qo'shish")}
          </button>
        </div>
      )}
      {rolling && <RolloverModal year={rolling} onClose={() => setRolling(null)} />}
    </section>
  )
}
