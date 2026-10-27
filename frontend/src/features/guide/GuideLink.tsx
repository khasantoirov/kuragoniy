import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

/** The small "?" that opens Yo'riqnoma at a section — for the
 * administration only, like the guide itself (routes: RequireAdmin). */
export function GuideLink({ section }: { section: string }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  if (!isAdminInView(user, viewMode)) return null
  return <Link className="jhelp" to={`/guide#${section}`} title={t("Yo'riqnoma")} aria-label={t("Yo'riqnoma")}>?</Link>
}
