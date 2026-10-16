import { useTranslation } from 'react-i18next'

import { isStudent, useAuth } from '@/lib/auth/AuthContext'

export function PendingApprovalPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const student = isStudent(user)

  return (
    <div className="gate">
      <div className="gate__panel gate__panel--narrow">
        <img className="gate__logo gate__logo--sm" src="/logo.png" alt="" />
        <h1 className="gate__title gate__title--ink">{t("Ariza ko'rib chiqilmoqda")}</h1>
        <p className="prose">
          {student
            ? t("Hisobingiz yaratildi. O'qituvchingiz tasdiqlagach, shu login va parol bilan kira olasiz.")
            : t("Hisobingiz yaratildi, lekin hali tasdiqlanmagan. Administrator tasdiqlagach, shu email va parol bilan kira olasiz.")}
        </p>
        {student && user?.username && (
          <p className="prose prose--note">{t('Loginingiz')}: <b>{user.username}</b></p>
        )}
        <button className="btn btn--block" onClick={() => logout()}>
          {t('Chiqish')}
        </button>
      </div>
    </div>
  )
}
