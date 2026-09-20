import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useUIStore } from '@/store/uiStore'

import { useClasses } from './api'
import { ClassGrid } from './ClassGrid'
import { ClassModal } from './ClassModal'
import { ClassSummary } from './ClassSummary'
import { quarterLabel } from './labels'

type Chorak = 1 | 2 | 3 | 4 | 'u'

function clsLabel(c: { school: string; name: string }) {
  return c.school ? `${c.school} | ${c.name}` : c.name
}

export function JournalPage() {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const [chorak, setChorak] = useState<Chorak>(() => {
    const raw = localStorage.getItem('afmd.chorak')
    return raw === 'u' ? 'u' : (Number(raw) as Chorak) || 1
  })
  const { data: classes, isLoading } = useClasses()
  const [openId, setOpenId] = useState<number | null>(null)
  const [creatingClass, setCreatingClass] = useState(false)

  useEffect(() => {
    if (classes?.length && (openId === null || !classes.some((c) => c.id === openId))) {
      setOpenId(classes[0].id)
    }
  }, [classes, openId])

  const changeChorak = (q: Chorak) => {
    setChorak(q)
    localStorage.setItem('afmd.chorak', String(q))
  }

  if (isLoading) return <Skeleton lines={3} />

  if (!classes?.length) {
    return (
      <div>
        <EmptyState
          title={t("Sinf qo'shilmagan")}
          hint={t("Jurnal yuritish uchun avval sinf qo'shing.")}
          action={<button className="btn btn--primary" onClick={() => setCreatingClass(true)}>{t("Sinf qo'shish")}</button>}
        />
        {creatingClass && <ClassModal cls={null} onClose={() => setCreatingClass(false)} onCreated={setOpenId} />}
      </div>
    )
  }

  const cls = classes.find((c) => c.id === openId) ?? classes[0]

  return (
    <div>
      <div className="jbar">
        <div className="chips">
          {classes.map((c) => (
            <button key={c.id} className={`chip ${c.id === openId ? 'is-on' : ''}`} onClick={() => setOpenId(c.id)}>
              {clsLabel(c)}
            </button>
          ))}
          <button className="chip chip--add" onClick={() => setCreatingClass(true)}>+ {t('Sinf')}</button>
        </div>
        <div className="jbar__sp" />
        <div className="chips chips--nowrap">
          {[1, 2, 3, 4].map((q) => (
            <button key={q} className={`chip ${chorak === q ? 'is-on' : ''}`} onClick={() => changeChorak(q as Chorak)}>{quarterLabel(q, lang)}</button>
          ))}
          <button className={`chip ${chorak === 'u' ? 'is-on' : ''}`} onClick={() => changeChorak('u')}>{t('Umumiy')}</button>
        </div>
      </div>

      {chorak === 'u' ? <ClassSummary cls={cls} /> : <ClassGrid cls={cls} chorak={chorak} />}

      {creatingClass && <ClassModal cls={null} onClose={() => setCreatingClass(false)} onCreated={setOpenId} />}
    </div>
  )
}
