import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useUIStore } from '@/store/uiStore'

import { LabHub } from './LabHub'

// the virtual lab (~250 KB, the Fizika window's) — never loaded in STEAM
const LabPage = lazy(() => import('./LabPage').then((m) => ({ default: m.LabPage })))

/** /lab in both windows: the hub, then (Fizika) the virtual laboratory.
 *  A bench or the equipment cabinet open alone, without the hub. */
export function LabEntry() {
  const fan = useUIStore((s) => s.subject)
  const [params] = useSearchParams()
  const inside = params.has('bench') || params.has('view')
  if (fan !== 'fizika') return <LabHub />
  return (
    <>
      {!inside && <LabHub />}
      <div id="lab-room">
        <Suspense fallback={<Skeleton lines={5} />}><LabPage /></Suspense>
      </div>
    </>
  )
}
