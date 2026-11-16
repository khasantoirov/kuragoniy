import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'

import { useGrantTeachers } from './api'
import { TeacherCard } from './TeacherCard'

/** Administrators: every teacher with classes, to open their journal. */
export function TeacherList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading } = useGrantTeachers(true)
  const [q, setQ] = useState('')
  if (isLoading) return <Skeleton lines={4} />
  const needle = q.trim().toLowerCase()
  const list = (data ?? []).filter((p) => p.classes.length > 0 && (!needle || p.name.toLowerCase().includes(needle)
    || p.classes.some((c) => c.label.toLowerCase().includes(needle))
    || (p.schools ?? []).some((s) => s.name.toLowerCase().includes(needle))))
  return (
    <div className="jpick">
      <input className="input jpick__q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t("O'qituvchi, maktab yoki sinf")} aria-label={t('Qidirish')} />
      {list.length ? (
        <ul className="tcards">
          {list.map((p) => (
            <li key={p.id}>
              <TeacherCard person={{ ...p, schools: p.schools ?? [] }}
                onOpen={() => navigate(`/journal?teacher=${encodeURIComponent(p.id)}`)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('Topilmadi')} hint={t("Sinf qo'shgan o'qituvchi topilmadi.")} />
      )}
    </div>
  )
}
