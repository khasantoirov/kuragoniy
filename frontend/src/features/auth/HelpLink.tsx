import { useTranslation } from 'react-i18next'

import { telegramUrl, useLanding } from '@/lib/publicSite'

/** "Muammo bormi? Yordam olish" — our Telegram, set in Boshqaruv → Sayt. */
export function HelpLink() {
  const { t } = useTranslation()
  const { data } = useLanding()
  const url = telegramUrl(data?.contacts.telegram) || 'https://t.me/Muhandis_D'
  return (
    <p className="gx-form__help">
      {t('Muammo bormi?')} <a href={url} target="_blank" rel="noreferrer">{t('Yordam olish')}</a>
    </p>
  )
}
