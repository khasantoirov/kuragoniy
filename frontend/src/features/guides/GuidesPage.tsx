import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useFaq } from '@/features/help/api'
import { markOpened, useLibraryItems } from '@/features/library/api'
import { KIND_LABELS, SECTION_LABELS, type GuideSection, type LibraryItem } from '@/features/library/types'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'
import { useUIStore } from '@/store/uiStore'

import './guides.css'

/* Yo'riqnomalar va qo'llanmalar — the teachers' guides centre (owner's
   mock-ups and choice, 2026-11-26: "Kutubxonadan Qo'llanma turi"). Its
   content is the library's guides and videos marked for a section here
   (Kutubxona › material › "Qo'llanmalar markazida"), in the window's fan;
   the questions are the Yordam markazi's FAQ. */

const SECTIONS: { k: GuideSection; ic: keyof typeof IC; sub: string }[] = [
  { k: 'platforma', ic: 'monitor', sub: "Tizimga kirish, sinf va o'quvchilarni qo'shish, jurnalni yuritish" },
  { k: 'metodika', ic: 'book', sub: "Amaliy fizika va STEAM darslarini tashkil etish, baholash" },
  { k: 'xavfsizlik', ic: 'shield', sub: "Jihozlar, elektronika va 3D printer bilan ishlash qoidalari" },
]

function GuideRow({ item }: { item: LibraryItem }) {
  const { t } = useTranslation()
  const href = item.file || item.url
  return (
    <li className="gd-item">
      <span className="gd-item__ic" aria-hidden="true">{IC[item.kind === 'video' ? 'play' : 'file']}</span>
      <span className="gd-item__tx">
        <b>{item.title}</b>
        <small>{t(KIND_LABELS[item.kind])}{item.note ? ` · ${item.note}` : ''}</small>
      </span>
      {href && (
        <a className="btn btn--sm" href={href} target="_blank" rel="noopener noreferrer" onClick={() => markOpened(item.id)}>
          {item.kind === 'video' ? IC.play : item.file ? IC.download : IC.external}
          {item.kind === 'video' ? t("Ko'rish") : item.file ? t('Yuklab olish') : t('Ochish')}
        </a>
      )}
    </li>
  )
}

export function GuidesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const { on } = useModules()
  const { data: items, isLoading } = useLibraryItems()
  const { data: faq } = useFaq()
  const [q, setQ] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const term = q.trim().toLowerCase()
  const match = (s: string) => !term || s.toLowerCase().includes(term)
  const guides = (items ?? []).filter((x) => x.section && (x.kind === 'qollanma' || x.kind === 'video') && match(`${x.title} ${x.note}`))
  const questions = (faq?.items ?? []).filter((f) => f.is_published !== false && match(`${f.question} ${f.answer}`))

  return (
    <div className="gd">
      <header className="gd-head">
        <div>
          <h1>{t("Yo'riqnomalar va qo'llanmalar")}</h1>
          <p>{t("Platformadan foydalanish, dars o'tish metodikasi, jihozlar xavfsizligi va savol-javoblar.")}</p>
        </div>
        <label className="search gd-head__q">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Qidirish…')} autoComplete="off" />
        </label>
      </header>

      {admin && (
        <p className="gd-admin">
          {IC.info} {t("Qo'llanma yoki video qo'shish: Kutubxona › Material › turi «Qo'llanma» yoki «Video», «Qo'llanmalar markazida» bo'limini tanlang.")}
          {' '}<Link to="/library">{t('Kutubxonaga')} ›</Link>
        </p>
      )}

      {isLoading ? <Skeleton lines={4} /> : (
        <div className="gd-grid">
          {SECTIONS.map((s) => {
            const rows = guides.filter((x) => x.section === s.k)
            return (
              <section key={s.k} className="gd-card">
                <header className="gd-card__head">
                  <span className="gd-card__ic" aria-hidden="true">{IC[s.ic]}</span>
                  <span>
                    <h2>{t(SECTION_LABELS[s.k])}</h2>
                    <small>{t(s.sub)}</small>
                  </span>
                </header>
                {rows.length
                  ? <ul className="gd-list">{rows.map((x) => <GuideRow key={x.id} item={x} />)}</ul>
                  : <p className="gd-empty">{term ? t('Hech narsa topilmadi') : t("Hali qo'llanma qo'shilmagan.")}</p>}
              </section>
            )
          })}

          <section className="gd-card gd-card--faq">
            <header className="gd-card__head">
              <span className="gd-card__ic" aria-hidden="true">{IC.help}</span>
              <span>
                <h2>{t('Tez-tez beriladigan savollar')}</h2>
                <small>{t('Savol-javoblar')}</small>
              </span>
            </header>
            {questions.length ? (
              <ul className="gd-faq">
                {questions.slice(0, 8).map((f) => (
                  <li key={f.id}>
                    <button type="button" className={`gd-faq__q ${openFaq === f.id ? 'is-open' : ''}`} aria-expanded={openFaq === f.id}
                      onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)}>{f.question}</button>
                    {openFaq === f.id && <p className="gd-faq__a">{f.answer}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="gd-empty">{t("Savollar hali qo'shilmagan.")}</p>}
            {on('help') && <Link className="btn btn--sm gd-card__cta" to="/help">{IC.help} {t('Texnik yordamga yozish')}</Link>}
          </section>
        </div>
      )}
    </div>
  )
}
