import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useLessonStats, type LessonStats } from '@/features/lessons/api'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

const STAT_CARDS: { key: keyof LessonStats; ic: keyof typeof IC; label: string }[] = [
  { key: 'lessons', ic: 'atom', label: 'Jami dars' },
  { key: 'oddiy', ic: 'flask', label: 'Amaliy tajriba' },
  { key: 'wow', ic: 'star', label: 'WOW-namoyish' },
  { key: 'oyin', ic: 'dice', label: "O'yinli tajriba" },
]

const FEATURES: { to: string; ic: keyof typeof IC; label: string; desc: string; adminOnly?: boolean }[] = [
  { to: '/lessons', ic: 'atom', label: 'Darslar', desc: '1–9-sinflar uchun tayyor darslar, amaliy tajribalar va WOW-namoyishlar.' },
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
  const { data: stats } = useLessonStats()
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
              "Muhandis_D uchun ishlab chiqilgan zamonaviy STEM ta'lim platformasi. 1–9-sinflar uchun amaliy tajribalar, WOW-namoyishlar va o'yinli mashg'ulotlar — barchasi bitta interaktiv platformada. Fan-texnikani ko'rsatib, his qildirib o'rgatish uchun.",
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

      <div className="abstat abstat--combined">
        <div className="abstat__main">
          <span className="abstat__ic">{IC.atom}</span>
          <div>
            <span className="abstat__n">{stats ? stats.lessons : '—'}</span>
            <span className="abstat__lb">{t('Jami dars')}</span>
          </div>
        </div>
        <div className="abstat__breakdown">
          {STAT_CARDS.filter((s) => s.key !== 'lessons').map((s) => (
            <span key={s.key} className="abstat__mini">
              <span className="abstat__mini-ic">{IC[s.ic]}</span>
              <b>{stats ? stats[s.key] : '—'}</b> {t(s.label)}
            </span>
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
