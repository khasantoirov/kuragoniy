import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useTeachersList } from '@/features/learning/api'
import { downloadCsv } from '@/features/portal/csv'
import { PageHead, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types'

import { useDirectory, useSchools, type DirectoryRow } from './api'
import { MetricPill } from './shared'

/** Umumiy ma'lumotlar bazasi — every pupil on every partner school's
 * rosters in one searchable table. */
export function DirectoryPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(q)
  const school = params.get('school') ?? ''
  const teacher = params.get('teacher') ?? ''
  const cls = params.get('class') ?? ''
  const page = Number(params.get('page') || 1)
  const { data: schools } = useSchools()
  const { data: teachers } = useTeachersList()
  const { data, isLoading, isFetching } = useDirectory({ q: debounced, school, teacher, class: cls, page })
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 350)
    return () => clearTimeout(id)
  }, [q])

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const rows: DirectoryRow[] = []
      let p = 1
      for (;;) {
        const res = await api.get<Paginated<DirectoryRow>>('/schools/directory/', {
          params: Object.fromEntries(Object.entries({ q: debounced, school, teacher, class: cls, page: p, page_size: 500 }).filter(([, v]) => v !== '')),
        })
        rows.push(...res.data.results)
        if (!res.data.next || p >= 40) break
        p++
      }
      downloadCsv('malumotlar-bazasi', ['Maktab', "O'qituvchi", 'Sinf', "O'quvchi", 'Platforma logini', "O'rtacha baho", 'Baholar soni', 'Sababli', 'Sababsiz', 'Kech'],
        rows.map((r) => [r.school, r.teacher, r.class_name, r.name, r.login ?? '', r.avg_mark ?? '', r.marks, r.abs_s, r.abs_n, r.late]))
    } catch {
      toast(t('Eksport xatosi'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.count / 50)) : 1

  return (
    <div>
      <Link to="/manage/schools" className="backlink">← {t('Hamkor maktablar')}</Link>
      <PageHead title={t("Umumiy ma'lumotlar bazasi")}
        sub={t("Barcha hamkor maktablardagi o'quvchilar: sinfi, o'qituvchisi, platforma logini, bahosi va davomati.")}
        actions={<button className="btn" disabled={exporting || !data?.count} onClick={exportAll}>{IC.download} {exporting ? t('Tayyorlanmoqda…') : 'CSV'}</button>} />

      <div className="filters">
        <input className="input input--sm" style={{ minWidth: 220 }} placeholder={t("O'quvchi yoki sinf nomi…")} value={q}
          onChange={(e) => { setQ(e.target.value); setParam('page', '') }} />
        <select className="input input--sm" value={school} onChange={(e) => setParam('school', e.target.value)}>
          <option value="">{t('Barcha maktablar')}</option>
          {schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="none">{t('Biriktirilmagan')}</option>
        </select>
        <select className="input input--sm" value={teacher} onChange={(e) => setParam('teacher', e.target.value)}>
          <option value="">{t("Barcha o'qituvchilar")}</option>
          {teachers?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {cls && <button className="chip is-on" onClick={() => setParam('class', '')}>{t('Bitta sinf')} ✕</button>}
        <span className="muted">{data ? `${data.count} ${t("ta o'quvchi")}` : ''}{isFetching && ' …'}</span>
      </div>

      <section className="panel">
        {isLoading ? <Skeleton lines={8} /> : data?.results.length ? (
          <>
            <div className="tablewrap">
              <table className="dtable dtable--dense">
                <thead>
                  <tr><th>{t("O'quvchi")}</th><th>{t('Sinf')}</th><th>{t('Maktab')}</th><th>{t("O'qituvchi")}</th><th>{t('Platforma')}</th>
                    <th>{t("O'rtacha baho")}</th><th>{t('Sababli')}</th><th>{t('Sababsiz')}</th><th>{t('Kech')}</th></tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td><button className="linklike" onClick={() => setParam('class', String(r.class_id))}>{r.class_name}</button></td>
                      <td>{r.school_linked ? r.school : <span className="muted" title={t('Hamkor maktabga biriktirilmagan')}>«{r.school}»</span>}</td>
                      <td>{r.teacher}</td>
                      <td>{r.login ? <span className="mono">{r.login}</span> : <StatusPill tone="muted">{t("yo'q")}</StatusPill>}</td>
                      <td><MetricPill value={r.avg_mark} good={4} fair={2.5} suffix="" digits={2} /> <small className="muted">({r.marks})</small></td>
                      <td>{r.abs_s}</td>
                      <td>{r.abs_n >= 3 ? <StatusPill tone="bad">{r.abs_n}</StatusPill> : r.abs_n}</td>
                      <td>{r.late}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="btn btn--sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>←</button>
              <span>{page} / {pages}</span>
              <button className="btn btn--sm" disabled={!data.next} onClick={() => setParam('page', String(page + 1))}>→</button>
            </div>
          </>
        ) : <p className="prose prose--note">{t("Hech narsa topilmadi.")}</p>}
      </section>
    </div>
  )
}
