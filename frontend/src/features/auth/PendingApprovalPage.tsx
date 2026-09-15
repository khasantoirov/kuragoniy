import { useTranslation } from 'react-i18next'

import { useAuth } from '@/lib/auth/AuthContext'

export function PendingApprovalPage() {
  const { t } = useTranslation()
  const { logout } = useAuth()

  return (
    <div className="gate">
      <div className="gate__panel gate__panel--narrow">
        <img className="gate__logo gate__logo--sm" src="/logo.png" alt="" />
        <h1 className="gate__title gate__title--ink">{t("Ariza ko'rib chiqilmoqda")}</h1>
        <p className="prose">
          {t("Hisobingiz yaratildi, lekin hali tasdiqlanmagan. Administrator tasdiqlagach, shu email va parol bilan kira olasiz.")}
        </p>
        <button className="btn btn--block" onClick={() => logout()}>
          {t('Chiqish')}
        </button>
      </div>
    </div>
  )
}
