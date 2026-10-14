import type { IC } from '@/icons'
import { Sidebar } from '@/layouts/edumin/Sidebar'

export interface PortalNavItem {
  to: string
  label: string
  icon: keyof typeof IC
  end?: boolean
}

/** Same look as the staff sidebar (layouts/edumin/Sidebar), but with
 * explicit groups — used by the student portal, whose routes the staff
 * sidebar's path-based grouping knows nothing about. */
export function PortalSidebar({ home, groups }: { home: string; groups: { title: string; items: PortalNavItem[] }[] }) {
  return <Sidebar home={home} groups={groups} />
}
