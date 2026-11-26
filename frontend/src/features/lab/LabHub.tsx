import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useKits } from '@/features/kits/api'
import { useLibraryItems } from '@/features/library/api'
import { IC } from '@/icons'
import { useModules } from '@/lib/modules'
import { useUIStore } from '@/store/uiStore'

import { SIMS } from './sims'
import './hub.css'

/* Laboratoriya — the hub on top of the lab (owner's mock-ups and choice,
   2026-11-26: "Jihozlar, video, materiallar" in both windows). The Fizika
   window adds its virtual simulations (the room below); the STEAM window
   has the kits instead. Videos and materials come from the library, in the
   window's own fan. */

export function LabHub() {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const { on } = useModules()
  const fizika = fan === 'fizika'
  const { data: items } = useLibraryItems()
  const kitsOn = !fizika && on('kits')
  const { data: kits } = useKits(kitsOn)
  const videos = (items ?? []).filter((x) => x.kind === 'video')
  const materials = (items ?? []).filter((x) => x.kind === 'qollanma' || x.kind === 'kitob')

  const cards: { ic: keyof typeof IC; title: string; sub: string; count: string; to: string; cta: string; show: boolean }[] = [
    { ic: 'flask', title: 'Virtual simulyatsiyalar', sub: "Fizika qonunlarini kompyuterda sinab ko'ring: tajribalarni jonli kuzating, sozlang va o'lchang.",
      count: `${SIMS.length} ${t('ta tajriba')}`, to: '#lab-room', cta: 'Laboratoriyaga kirish', show: fizika },
    { ic: 'cards', title: 'Kerakli jihozlar', sub: "Robototexnika va STEAM darslari uchun jihozlar to'plamlari: tarkibi, yo'riqnomasi va qaysi darsga kerakligi.",
      count: `${(kits ?? []).filter((k) => k.is_active).length} ${t("ta to'plam")}`, to: '/lessons?bolim=chamadonlar', cta: "To'plamlarni ko'rish", show: kitsOn },
    { ic: 'play', title: "Video yo'riqnomalar", sub: "Har bir amaliy ish va tajriba bo'yicha bosqichma-bosqich videodarslar.",
      count: `${videos.length} ${t('ta video')}`, to: '/library', cta: "Videolarni ko'rish", show: on('library') },
    { ic: 'download', title: 'Yuklab olish uchun materiallar', sub: "Qo'llanmalar, dars ishlanmalari va kitoblar — PDF ko'rinishida.",
      count: `${materials.length} ${t('ta material')}`, to: '/library', cta: 'Kutubxonaga o\'tish', show: on('library') },
  ]

  return (
    <section className="labhub" aria-label={t('Laboratoriya')}>
      <header className="labhub__head">
        <h1>{t('Laboratoriya')}</h1>
        <p>{fizika
          ? t("Amaliy fizika tajribalari, virtual laboratoriya, video yo'riqnomalar va materiallar.")
          : t("STEAM va robototexnika: kerakli jihozlar, video yo'riqnomalar va materiallar.")}</p>
      </header>
      <div className="labhub__grid">
        {cards.filter((c) => c.show).map((c) => {
          const inner = (
            <>
              <span className="labhub__ic" aria-hidden="true">{IC[c.ic]}</span>
              <b className="labhub__t">{t(c.title)}</b>
              <span className="labhub__s">{t(c.sub)}</span>
              <span className="labhub__foot">
                <span className="labhub__n">{c.count}</span>
                <span className="labhub__go">{t(c.cta)} ›</span>
              </span>
            </>
          )
          return c.to.startsWith('#')
            ? <a key={c.title} className="labhub__card" href={c.to}>{inner}</a>
            : <Link key={c.title} className="labhub__card" to={c.to}>{inner}</Link>
        })}
      </div>
    </section>
  )
}
