import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { IC } from '@/icons'

import { SimulationCanvas } from './SimulationCanvas'
import { SIMS } from './sims'

export function LabSimDetail() {
  const { t } = useTranslation()
  const { simId } = useParams()
  const navigate = useNavigate()
  const sim = SIMS.find((s) => s.id === simId)

  if (!sim) return <Navigate to="/lab" replace />

  return (
    <div>
      <button className="btn btn--sm" onClick={() => navigate('/lab')}>
        {IC.back} {t('Laboratoriya')}
      </button>
      <header className="lhead">
        <h2 className="lhead__title">{t(sim.title)}</h2>
        <p className="lhead__goal">{t(sim.desc)}</p>
      </header>
      <SimulationCanvas sim={sim} key={sim.id} />
    </div>
  )
}
