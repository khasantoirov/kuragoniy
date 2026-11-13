import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { PageHead } from '@/features/portal/ui'
import { useAuth } from '@/lib/auth/AuthContext'

/** "Maktabim" — where a school's ma'muriyat lands: their school's page, or
 *  a choice when they look after several. */
export function MySchoolPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const schools = user?.managed_schools ?? []
  if (schools.length === 1) return <Navigate to={`/manage/schools/${schools[0].id}`} replace />
  if (!schools.length) {
    return <EmptyState title={t('Maktab biriktirilmagan')}
      hint={t("Sizga hali maktab biriktirilmagan — platforma ma'muriyatiga murojaat qiling.")} />
  }
  return (
    <div>
      <PageHead title={t('Maktablarim')} sub={t("Siz kuzatadigan maktablar")} />
      <ul className="tcards">
        {schools.map((s) => (
          <li key={s.id}>
            <Link className="tcard" to={`/manage/schools/${s.id}`}>
              <span className="tcard__head">
                <span className="tcard__id"><b className="tcard__nm">{s.name}</b></span>
                <span className="tcard__go" aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
