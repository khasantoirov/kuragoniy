import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'
import { tableOffice } from '@/lib/export/tableExport'

import type { useNotebook } from './notebook'
import type { Sim } from './sims'

/** "Tajriba daftari": one row per press of «O'lchash» — the controls'
 * values and every instrument reading at that moment. */
export function LabNotebook({ sim, notebook }: { sim: Sim; notebook: ReturnType<typeof useNotebook> }) {
  const { t } = useTranslation()
  const { rows } = notebook
  const readLabels = [...new Set(rows.flatMap((r) => r.read.map((x) => x.label)))]
  const head = [
    '№',
    ...sim.controls.map((c) => (c.unit ? `${t(c.label)}, ${c.unit}` : t(c.label))),
    ...readLabels,
  ]
  const body = rows.map((r, i) => [
    i + 1,
    ...sim.controls.map((c) => r.vals[c.k] ?? ''),
    ...readLabels.map((l) => r.read.find((x) => x.label === l)?.val ?? ''),
  ])

  return (
    <div className="labnote">
      <div className="labnote__head">
        <h3 className="labpanel__t">{IC.clipboard} {t('Tajriba daftari')}</h3>
        <div className="labnote__acts">
          <button type="button" className="btn btn--sm btn--ghost" disabled={!rows.length} onClick={notebook.removeLast}>{IC.undo} {t('Oxirgisini o‘chirish')}</button>
          <button type="button" className="btn btn--sm btn--ghost" disabled={!rows.length} onClick={notebook.clear}>{IC.trash} {t('Tozalash')}</button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={!rows.length}
            onClick={() => tableOffice(`${t(sim.title)} — ${t('Tajriba daftari')}`, head, body, 'xls')}
          >
            {IC.download} Excel
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="labnote__wrap">
          <table className="labnote__t">
            <thead>
              <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={rows[i].at}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="labnote__empty">{t("Hali o'lchov yo'q. Qiymatlarni sozlang va «O'lchash» tugmasini bosing — natija shu jadvalga yoziladi.")}</p>
      )}
    </div>
  )
}
