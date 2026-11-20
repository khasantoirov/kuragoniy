import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'

import { IC } from '@/icons'

import { BENCHES, benchOf, EQUIP, EquipIcon, equipOf, simsOfBench } from './equipment'
import { LabNotebook } from './LabNotebook'
import { useNotebook } from './notebook'
import { SimulationCanvas } from './SimulationCanvas'
import { SIMS, type Sim } from './sims'
import './lab.css'
import './i18n'

/** The experiment's procedure, built from its equipment and controls. */
function Steps({ sim }: { sim: Sim }) {
  const { t } = useTranslation()
  const equip = equipOf(sim)
  return (
    <ol className="labsteps">
      {equip.length > 0 && (
        <li>{t('Kerakli jihozlarni stolga tayyorlang')}: {equip.map((e) => t(EQUIP[e].name)).join(', ')}.</li>
      )}
      {sim.controls.map((c) => (
        <li key={c.k}>
          {t("«{{name}}» qiymatini {{min}}–{{max}} {{unit}} oralig'ida o'zgartiring.", { name: t(c.label), min: c.min, max: c.max, unit: c.unit ?? '' })}
        </li>
      ))}
      <li>{t("Asboblar ko'rsatkichini kuzating — ular tajriba oynasining chap yuqori burchagida.")}</li>
      <li>{t("«O'lchash» tugmasini bosing — natija tajriba daftariga yoziladi. Kerak bo'lsa, avval «To'xtatish»ni bosing.")}</li>
      <li>{t("Kamida 3 xil qiymat bilan o'lchab, kattaliklar orasidagi bog'liqlik haqida xulosa chiqaring.")}</li>
    </ol>
  )
}

function Workspace({ sim }: { sim: Sim }) {
  const { t } = useTranslation()
  const notebook = useNotebook(sim.id)
  const bench = benchOf(sim.id)
  const meta = BENCHES.find((b) => b.id === bench)
  const siblings = bench ? simsOfBench(bench) : SIMS
  const i = siblings.findIndex((s) => s.id === sim.id)
  const prev = i > 0 ? siblings[i - 1] : null
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null

  return (
    <div className="labx labsim" style={{ ['--bench' as string]: meta?.color ?? 'var(--ok)' }}>
      <nav className="labcrumbs" aria-label={t('Yo‘l')}>
        <Link to="/lab">{IC.flask} {t('Laboratoriya xonasi')}</Link>
        {meta && (
          <>
            <span aria-hidden="true">›</span>
            <Link to={`/lab?bench=${meta.id}`}>{t(meta.label)}</Link>
          </>
        )}
        <span aria-hidden="true">›</span>
        <span>{t(sim.title)}</span>
      </nav>
      <header className="labbhead">
        <h2 className="labbhead__t"><span className="labbhead__dot" />{t(sim.title)}</h2>
        <p className="labbhead__s">{t('Maqsad')}: {t(sim.desc)}</p>
      </header>

      <SimulationCanvas sim={sim} key={sim.id} onMeasure={notebook.add} />

      <div className="labsim__grid">
        <section className="labpanel">
          <h3 className="labpanel__t">{IC.flask} {t('Jihozlar')}</h3>
          <ul className="labeq">
            {equipOf(sim).map((e) => (
              <li key={e} className="labeq__i">
                <EquipIcon id={e} size={44} />
                <span>
                  <b>{t(EQUIP[e].name)}</b>
                  <small>{t(EQUIP[e].hint)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="labpanel">
          <h3 className="labpanel__t">{IC.list} {t('Tajriba borishi')}</h3>
          <Steps sim={sim} />
        </section>
        <section className="labpanel labpanel--wide">
          <LabNotebook sim={sim} notebook={notebook} />
        </section>
      </div>

      <div className="labsim__nav">
        {prev ? <Link className="btn btn--sm" to={`/lab/${prev.id}`}>{IC.back} {t(prev.title)}</Link> : <span />}
        {next && <Link className="btn btn--sm" to={`/lab/${next.id}`}>{t(next.title)} <span aria-hidden="true">→</span></Link>}
      </div>
    </div>
  )
}

export function LabSimDetail() {
  const { simId } = useParams()
  const sim = SIMS.find((s) => s.id === simId)
  if (!sim) return <Navigate to="/lab" replace />
  // keyed so the notebook and canvas start fresh when moving to the next experiment
  return <Workspace key={sim.id} sim={sim} />
}
