import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

import './about.css'

/* Platforma haqida — the whole platform: both fan directions, Fizika and
   STEAM / Robototexnika (owner, 2026-11-26: "Fizika va STEAM Robototexnika
   qilib o'zgartir"). The open window's direction comes first. */

// STEAM / Robototexnika: what each grade group builds
const STEAM_TRACKS: { grades: string; name: string; desc: string }[] = [
  { grades: '1-2-sinf', name: 'WeDo 2.0', desc: "Lego konstruktorlaridan turli modellar yasash." },
  { grades: '3-4-sinf', name: 'Muhandislik 1', desc: "Karton, cho'p va trubochkalardan amaliy loyihalar yasash." },
  { grades: '5-6-sinf', name: 'Muhandislik 2', desc: 'Lazerda kesilgan detallardan modellar yasash.' },
  { grades: '7-sinf', name: 'Elektronika', desc: 'Elektronika va Arduino asosida loyihalar.' },
  { grades: '8-9-sinf', name: 'Amaliy loyihalar', desc: "Turli xil narsalarni o'quvchilar o'zlari yaratadi." },
]

// Fizika: what the platform gives the 7–9 grades (from amaliyfizika.uz)
const FIZIKA_POINTS: { ic: keyof typeof IC; name: string; desc: string }[] = [
  { ic: 'lessons', name: 'Darslikka mos darslar', desc: "7, 8 va 9-sinf fizika darslari — har bir mavzu nazariya va amaliyot bilan." },
  { ic: 'flask', name: 'Amaliy tajribalar', desc: "Har bir mavzuga sinfda bajariladigan tajribalar va kerakli jihozlar ro'yxati." },
  { ic: 'star', name: 'WOW-namoyishlar', desc: "O'quvchida hayrat uyg'otadigan namoyishlar va o'yinli mashg'ulotlar." },
  { ic: 'atom', name: 'Virtual laboratoriya', desc: "Fizika qonunlarini kompyuterda sinab ko'rish uchun interaktiv simulyatsiyalar." },
]

const SOCIAL_LINKS: { ic: keyof typeof IC; label: string; handle: string; url: string }[] = [
  { ic: 'telegram', label: 'Telegram', handle: '@Muhandis_D', url: 'https://t.me/Muhandis_D' },
  { ic: 'instagram', label: 'Instagram', handle: '@Muhandis_D', url: 'https://instagram.com/Muhandis_D' },
  { ic: 'youtube', label: 'YouTube', handle: '@Muhandis_D', url: 'https://youtube.com/@Muhandis_D' },
]

function FizikaCard({ open }: { open: boolean }) {
  const { t } = useTranslation()
  return (
    <section className={`abdir abdir--fizika ${open ? 'is-open' : ''}`}>
      <header className="abdir__head">
        <span className="abdir__ic" aria-hidden="true">{IC.atom}</span>
        <span>
          <h3>{t('Fizika')}</h3>
          <small>{t('Nazariy va amaliy fizika · 7–9-sinflar')}</small>
        </span>
        {open && <span className="abdir__here">{t('Siz shu oynadasiz')}</span>}
      </header>
      <p className="abdir__lead">
        {t("Fizikani quruq formulalar emas, jonli tajribalar orqali o'rgatish: o'quvchida hayrat uyg'otish, hodisani o'z ko'zi bilan ko'rsatish va «nega bunday bo'ldi?» degan savolni tug'dirish.")}
      </p>
      <ul className="abdir__points">
        {FIZIKA_POINTS.map((p) => (
          <li key={p.name}>
            <span className="abdir__pic" aria-hidden="true">{IC[p.ic]}</span>
            <span><b>{t(p.name)}</b><small>{t(p.desc)}</small></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SteamCard({ open }: { open: boolean }) {
  const { t } = useTranslation()
  return (
    <section className={`abdir abdir--steam ${open ? 'is-open' : ''}`}>
      <header className="abdir__head">
        <span className="abdir__ic" aria-hidden="true">{IC.robot}</span>
        <span>
          <h3>{t('STEAM / Robototexnika')}</h3>
          <small>{t('Muhandislik va robototexnika · 1–9-sinflar')}</small>
        </span>
        {open && <span className="abdir__here">{t('Siz shu oynadasiz')}</span>}
      </header>
      <p className="abdir__lead">
        {t("Muhandislik fikrlashini boshlang'ich sinfdan: konstruktorlar, elektronika va Arduino, o'quvchilarning o'z loyihalari.")}
      </p>
      <h4 className="abdir__sub">{t('Sinf bosqichlari')}</h4>
      <div className="abtracks__list">
        {STEAM_TRACKS.map((g) => (
          <div key={g.grades} className="abtrack">
            <span className="abtrack__grade">{g.grades}</span>
            <span className="abtrack__name">{g.name}</span>
            <span className="abtrack__desc">{t(g.desc)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AboutPage() {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const fizikaFirst = fan === 'fizika'

  return (
    <div>
      <div className="abhero">
        <div className="abhero__body">
          <span className="abhero__eyebrow">
            <span className="abhero__dot" aria-hidden="true" />
            {t("Innovatsion o'quv platformasi")}
          </span>
          <h2 className="abhero__title">
            <span className="abhero__accent">KO'RAGONIY EDU</span> {t('platformasi')}
          </h2>
          <p className="abhero__sub">
            {t("Ko'ragoniy Education va Muhandis D loyihasi: maktablar uchun Fizika (nazariy va amaliy) hamda STEAM / Robototexnika ta'limi. Darslar, laboratoriya, jurnal, jadval va kutubxona — barchasi bitta platformada.")}
          </p>
          <div className="abhero__credit">
            <img className="abhero__credit-av" src="/logo.png" alt="Muhandis_D" />
            <span>
              <span className="abhero__credit-role">{t('Dastur yaratuvchisi')}</span>
              <strong className="abhero__credit-name">Hasan Toirov</strong>
            </span>
          </div>
        </div>
        <div className="abhero__side">
          <img className="abhero__logo" src="/logo.png" alt="KO'RAGONIY EDU" />
          <div className="abhero__social">
            {SOCIAL_LINKS.map((s) => (
              <a key={s.ic} className="abhero__social-link" href={s.url} target="_blank" rel="noreferrer">
                <span className={`abhero__social-ic abhero__social-ic--${s.ic}`}>{IC[s.ic]}</span>
                <span className="abhero__social-tx">
                  <span className="abhero__social-lb">{t(s.label)}</span>
                  <span className="abhero__social-handle">{s.handle}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <h3 className="abdirs__title">{IC.file} {t("Ta'lim yo'nalishlari")}</h3>
      <div className="abdirs">
        {fizikaFirst
          ? <><FizikaCard open /><SteamCard open={false} /></>
          : <><SteamCard open /><FizikaCard open={false} /></>}
      </div>

      <div className="panel abmission">
        <h3 className="panel__title">{IC.info} {t('Platforma haqida')}</h3>
        <p className="prose">
          {t("Maqsadimiz — O'zbekistonda yaxshi muhandislarni tarbiyalash: yoshlar maktab partasidanoq fizikani his qilib o'rgansa va o'z loyihalarini yaratsa, yurtimiz bu sohada dunyoda yuqori o'rinlarga ko'tariladi.")}
        </p>
        <p className="prose">
          {t('Loyiha')} <strong>Ko'ragoniy Education</strong> {t('va')} <strong>Muhandis_D</strong> {t('hamkorligida tayyorlangan.')} {t('Dastur yaratuvchisi')} — <strong>Hasan Toirov</strong> · {new Date().getFullYear()}.
        </p>
      </div>
    </div>
  )
}
