import { useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/* A page changing, the iOS way (styles/motion.css): a new page slides in
   from the right, going back brings the previous one from the left. The
   first page of a visit just appears; a tab or filter on the same page (only
   the ?query changes) doesn't move anything. The class is fixed when the
   page is put up, so later re-renders never replay it. */

function Page({ cls, children }: { cls: string; children: ReactNode }) {
  const [fixed] = useState(cls)
  return <div className={fixed || undefined}>{children}</div>
}

export function PageFx({ children }: { children: ReactNode }) {
  const { pathname, key } = useLocation()
  const type = useNavigationType()
  const cls = key === 'default' ? '' : type === 'POP' ? 'pagefx pagefx--back' : 'pagefx'
  return <Page key={pathname} cls={cls}>{children}</Page>
}
