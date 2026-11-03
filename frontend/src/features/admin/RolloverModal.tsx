import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, StatusPill } from '@/features/portal/ui'
import type { AcademicYear } from '@/features/schools/api'
import { api } from '@/lib/api/client'
import { useYearStore } from '@/lib/year'

interface PlanRow {
  id: number
  name: string
  new_name: string | null
  action: 'move' | 'graduate' | 'done' | 'exists'
  teacher: string
  school: string
  students: number
}
interface Plan { source: string; target: string; target_exists: boolean; target_current: boolean; rows: PlanRow[] }

const NOTE: Record<Exclude<PlanRow['action'], 'move'>, { tone: 'muted' | 'ok' | 'mid'; label: string }> = {
  graduate: { tone: 'muted', label: 'Bitiradi' },
  done: { tone: 'ok', label: "O'tkazilgan" },
  exists: { tone: 'mid', label: 'Yangi yilda bor' },
}

/** Yangi o'quv yiliga o'tish (backend journal/rollover.py): this year's
 * classes into the next one, a grade up, with their pupils and logins —
 * the administrator sees the plan, unticks what shouldn't move, and may
 * make the new year current in the same step. */
export function RolloverModal({ year, onClose }: { year: AcademicYear; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const setYear = useYearStore((s) => s.setYear)
  const { data: plan, isLoading } = useQuery({
    queryKey: ['schools', 'rollover', year.id],
    queryFn: async () => (await api.get<Plan>(`/schools/years/${year.id}/rollover/`)).data,
  })
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [makeCurrent, setMakeCurrent] = useState(true)
  const run = useMutation({
    mutationFn: async () => (await api.post<{ classes: number; students: number; target: string }>(
      `/schools/years/${year.id}/rollover/`, { exclude: [...skipped], make_current: makeCurrent })).data,
    onSuccess: () => {
      setYear(null)
      for (const key of ['journal', 'schools', 'learning']) queryClient.invalidateQueries({ queryKey: [key] })
    },
  })

  const moving = plan?.rows.filter((r) => r.action === 'move' && !skipped.has(r.id)) ?? []
  const pupils = moving.reduce((n, r) => n + r.students, 0)
  const toggle = (id: number) => setSkipped((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async () => {
    try {
      const res = await run.mutateAsync()
      toast(`${res.target}: ${res.classes} ${t('ta sinf')}, ${res.students} ${t("ta o'quvchi")}`)
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal
      title={plan ? `${plan.source} → ${plan.target}` : t("Yangi o'quv yiliga o'tish")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" disabled={run.isPending || !plan || (!moving.length && (!makeCurrent || plan.target_current))} onClick={submit}>
            {run.isPending ? t('Saqlanmoqda…') : moving.length ? `${moving.length} ${t('ta sinfni o\'tkazish')}` : t('Joriy qilish')}
          </button>
        </>
      }
    >
      <p className="prose prose--note">
        {t("Har bir sinf keyingi yilga bir sinf yuqoriga o'tadi (7-A → 8-A) — o'qituvchisi, maktabi va o'quvchilari bilan, o'quvchilarning loginlari ham. O'tgan yil jurnali baholari bilan joyida qoladi va faqat ko'rish uchun ochiladi. 11-sinflar bitiradi.")}
      </p>
      {isLoading || !plan ? <Skeleton lines={5} /> : (
        <>
          <div className="tablewrap">
            <table className="dtable dtable--dense">
              <thead>
                <tr><th /><th>{t('Sinf')}</th><th>{plan.target}</th><th>{t("O'qituvchi")}</th><th>{t('Maktab')}</th><th>{t("O'quvchi")}</th></tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.id} className={r.action === 'move' && !skipped.has(r.id) ? '' : 'is-dim'}>
                    <td>
                      {r.action === 'move'
                        ? <input type="checkbox" checked={!skipped.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.name} />
                        : null}
                    </td>
                    <td>{r.name}</td>
                    <td>{r.action === 'move' ? <b>{r.new_name}</b> : <StatusPill tone={NOTE[r.action].tone}>{t(NOTE[r.action].label)}</StatusPill>}</td>
                    <td>{r.teacher}</td>
                    <td>{r.school}</td>
                    <td>{r.students}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!plan.target_current && (
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} />
              <span>{plan.target} {t("ni joriy o'quv yili qilish")}</span>
            </label>
          )}
          <p className="form__note">{moving.length} {t('ta sinf')} · {pupils} {t("ta o'quvchi")}</p>
        </>
      )}
    </Modal>
  )
}
