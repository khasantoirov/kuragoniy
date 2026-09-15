import { useTranslation } from 'react-i18next'

import { useLessonStats, type LessonStats } from '@/features/lessons/api'
import { IC } from '@/icons'

const STAT_CARDS: { key: keyof LessonStats; ic: keyof typeof IC; label: string }[] = [
  { key: 'lessons', ic: 'atom', label: 'Jami dars (7–9)' },
  { key: 'oddiy', ic: 'flask', label: 'Amaliy tajriba' },
  { key: 'wow', ic: 'star', label: 'WOW-namoyish' },
  { key: 'oyin', ic: 'dice', label: "O'yinli tajriba" },
]

const SOCIAL_LINKS: { ic: keyof typeof IC; label: string; handle: string; url: string }[] = [
  { ic: 'telegram', label: 'Telegram', handle: '@Muhandis_D', url: 'https://t.me/Muhandis_D' },
  { ic: 'instagram', label: 'Instagram', handle: '@Muhandis_D', url: 'https://instagram.com/Muhandis_D' },
  { ic: 'youtube', label: 'YouTube', handle: '@Muhandis_D', url: 'https://youtube.com/@Muhandis_D' },
]

export function AboutPage() {
  const { t } = useTranslation()
  const { data: stats } = useLessonStats()

  return (
    <div>
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

      <div className="abhero">
        <div className="abhero__body">
          <span className="abhero__eyebrow">
            <span className="abhero__dot" aria-hidden="true" />
            {t("Innovatsion o'quv platformasi")}
          </span>
          <h2 className="abhero__title">
            <span className="abhero__accent">STEM LMS</span> {t('platformasi')}
          </h2>
          <p className="abhero__sub">
            {t(
              "Muhandis_D uchun ishlab chiqilgan zamonaviy STEM ta'lim platformasi. 7–9-sinflar uchun amaliy tajribalar, WOW-namoyishlar va o'yinli mashg'ulotlar — barchasi bitta interaktiv platformada. Fan-texnikani ko'rsatib, his qildirib o'rgatish uchun.",
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
        <img className="abhero__logo" src="/logo.png" alt="STEM LMS" />
      </div>

      <div className="abstats">
        {STAT_CARDS.map((s) => (
          <div key={s.key} className="abstat">
            <span className="abstat__ic">{IC[s.ic]}</span>
            <span className="abstat__n">{stats ? stats[s.key] : '—'}</span>
            <span className="abstat__lb">{t(s.label)}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3 className="panel__title">{IC.info} {t('Platforma haqida')}</h3>
        <p className="prose">
          {t(
            "STEM LMS — fan-texnikani quruq formulalar emas, balki jonli tajribalar orqali o'rgatishga qaratilgan platforma. Maqsad: o'quvchida hayrat uyg'otish, hodisani o'z ko'zi bilan ko'rsatish va “nega bunday bo'ldi?” degan savolni tug'dirish.",
          )}
        </p>
        <p className="prose">
          {t('Loyiha')} <strong>Muhandis_D</strong> {t("ta'limiy yo'nalishi doirasida tayyorlangan.")} {t('Dastur yaratuvchisi')} — <strong>Hasan Toirov</strong> · {new Date().getFullYear()}.
        </p>
      </div>
    </div>
  )
}
