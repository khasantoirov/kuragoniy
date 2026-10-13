import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LivePlayer } from '@/features/games/LivePlayer'
import { MiniGames } from '@/features/games/MiniGames'
import { PageHead, Segmented } from '@/features/portal/ui'

export function StudentGames() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'live' | 'mini'>('mini')
  return (
    <div>
      <PageHead title={t("O'yinlar")} sub={t("Fizikani o'ynab takrorlang. Jonli o'yinni o'qituvchi darsda boshlaydi.")}
        actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'mini', label: t("Mini-o'yinlar") }, { value: 'live', label: t("Jonli o'yin") }]} />} />
      {tab === 'live' ? <section className="panel"><LivePlayer onExit={() => setTab('mini')} /></section> : <MiniGames />}
    </div>
  )
}
