import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

const GRADE_TRACKS: { grades: string; name: string; desc: string }[] = [
  { grades: '1-2-sinf', name: 'VEDO 2.0', desc: "Lego konstruktorlaridan turli modellar yasash." },
  { grades: '3-4-sinf', name: 'STEM loyihalari', desc: "Karton, cho'p va trubochkalardan amaliy loyihalar yasash." },
  { grades: '5-6-sinf', name: 'Muhandis D', desc: 'Lazerda kesilgan detallardan modellar yasash.' },
  { grades: '7-8-9-sinf', name: 'Muhandis D 2.0', desc: 'Elektronika va Arduino asosida loyihalar.' },
]

const FEATURES: { to: string; ic: keyof typeof IC; label: string; desc: string; adminOnly?: boolean }[] = [
  { to: '/lessons', ic: 'robot', label: 'Darslar', desc: '1–9-sinflar uchun tayyor darslar va o\'quv materiallari.' },
  { to: '/journal', ic: 'clipboard', label: 'Jurnal', desc: "Baho, davomat va sinf o'zlashtirish diagrammalari — barchasi bir joyda." },
  { to: '/timetable', ic: 'calendar', label: 'Jadval', desc: 'Haftalik dars jadvalini tuzing, ko\'ring va boshqaring.' },
  { to: '/library', ic: 'book', label: 'Kutubxona', desc: "Kitob, qo'llanma va video materiallar to'plami." },
  { to: '/admin', ic: 'settings', label: 'Boshqaruv', desc: "O'qituvchi arizalari va tizim sozlamalarini boshqarish.", adminOnly: true },
]

const SOCIAL_LINKS: { ic: keyof typeof IC; label: string; handle: string; url: string }[] = [
  { ic: 'telegram', label: 'Telegram', handle: '@Muhandis_D', url: 'https://t.me/Muhandis_D' },
  { ic: 'instagram', label: 'Instagram', handle: '@Muhandis_D', url: 'https://instagram.com/Muhandis_D' },
  { ic: 'youtube', label: 'YouTube', handle: '@Muhandis_D', url: 'https://youtube.com/@Muhandis_D' },
]

export function AboutPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { viewMode } = useUIStore()
  const admin = isAdminInView(user, viewMode)
  const visibleFeatures = FEATURES.filter((f) => !f.adminOnly || admin)

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
            {t(
              "Muhandis_D uchun ishlab chiqilgan zamonaviy STEM ta'lim platformasi. 1–9-sinflar uchun darslar, baholash, jadval va kutubxona — barchasi bitta interaktiv platformada.",
            )}
          </p>
          <div className="abhero__credit">
            <img className="abhero__credit-av" src="/logo.png" alt="Muhandis_D" />
            <span>
              <span className="abhero__credit-role">{t('Dastur yaratuvchisi')}</span>
              <strong className="abhero__credit-name">Hasan Toirov</strong>
            </span>
          </div>
        </div>
        <img className="abhero__logo" src="/logo.png" alt="KO'RAGONIY EDU" />
      </div>

      <div className="abtracks">
        <h3 className="panel__title">{IC.robot} {t('Sinf bosqichlari')}</h3>
        <div className="abtracks__list">
          {GRADE_TRACKS.map((g) => (
            <div key={g.grades} className="abtrack">
              <span className="abtrack__grade">{g.grades}</span>
              <span className="abtrack__name">{g.name}</span>
              <span className="abtrack__desc">{t(g.desc)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="abfeat">
        <h3 className="panel__title">{t("Bo'limlar va imkoniyatlar")}</h3>
        <div className="abfeat__grid">
          {visibleFeatures.map((f) => (
            <Link key={f.to} to={f.to} className="abfeat__card">
              <span className="abfeat__ic">{IC[f.ic]}</span>
              <span className="abfeat__title">{t(f.label)}</span>
              <span className="abfeat__desc">{t(f.desc)}</span>
              <span className="abfeat__go">{t('Ochish')} →</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="panel__title">{IC.info} {t('Platforma haqida')}</h3>
        <p className="prose">
          {t(
            "KO'RAGONIY EDU — fan-texnikani quruq formulalar emas, balki jonli tajribalar orqali o'rgatishga qaratilgan platforma. Maqsad: o'quvchida hayrat uyg'otish, hodisani o'z ko'zi bilan ko'rsatish va “nega bunday bo'ldi?” degan savolni tug'dirish.",
          )}
        </p>
        <p className="prose">
          {t('Loyiha')} <strong>Muhandis_D</strong> {t("ta'limiy yo'nalishi doirasida tayyorlangan.")} {t('Dastur yaratuvchisi')} — <strong>Hasan Toirov</strong> · {new Date().getFullYear()}.
        </p>
      </div>

      <div className="panel">
        <h3 className="panel__title">{t('Bizni kuzatib boring')}</h3>
        <div className="sociallinks">
          {SOCIAL_LINKS.map((s) => (
            <a key={s.ic} className="sociallink" href={s.url} target="_blank" rel="noreferrer">
              <span className={`sociallink__ic sociallink__ic--${s.ic}`}>{IC[s.ic]}</span>
              <span className="sociallink__tx">
                <span className="sociallink__lb">{t(s.label)}</span>
                <span className="sociallink__handle">{s.handle}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
