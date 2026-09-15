import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function ForgotPasswordPage() {
  const { t } = useTranslation()

  return (
    <div className="form">
      <p className="prose">{t('Parolni tiklash uchun administratorga murojaat qiling.')}</p>
      <Link className="btn btn--block" to="/login">
        {t('Kirish sahifasiga qaytish')}
      </Link>
    </div>
  )
}
