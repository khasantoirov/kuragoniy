import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DashboardSection } from '@/features/admin/dashboard/DashboardSection'
import { AdminStatsTable } from '@/features/journal/AdminStatsTable'
import { quarterLabel } from '@/features/journal/labels'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

type Chorak = 1 | 2 | 3 | 4 | 'u'

/** Platformaning yagona statistika sahifasi. Ilgari ko'rsatkichlar ikki
 *  joyga bo'lingan edi — Boshqaruv sahifasidagi dashboard va Jurnaldagi
 *  admin "Statistika" tabi — endi ikkalasi shu yerda.
 *
 *  Sinf ichidagi o'zlashtirish diagrammasi (MasteryPanel) ataylab
 *  ko'chirilmadi: u baho qo'yish jarayonining bir qismi, alohida
 *  ko'rsatkich emas.
 *
 *  Ko'rish huquqi `DashboardSection`niki bilan bir xil: o'qituvchi o'z
 *  sinflari bo'yicha ko'radi, admin butun tashkilotni. Sinflar jadvali
 *  esa faqat adminga — u boshqa o'qituvchilarning sinflarini sanaydi. */
export function StatisticsPage() {
  const { t } = useTranslation()
  const { lang, viewMode } = useUIStore()
  const { user } = useAuth()
  const admin = isAdminInView(user, viewMode)

  // Chorak tanlovi Jurnal bilan bir xil kalitda saqlanadi — foydalanuvchi
  // uchun bu bitta "qaysi chorakdaman" holati.
  const [chorak, setChorak] = useState<Chorak>(() => {
    const raw = localStorage.getItem('afmd.chorak')
    return raw === 'u' ? 'u' : (Number(raw) as Chorak) || 1
  })

  const changeChorak = (q: Chorak) => {
    setChorak(q)
    localStorage.setItem('afmd.chorak', String(q))
  }

  return (
    <div>
      <DashboardSection admin={admin} />

      {admin && (
        <section className="panel">
          <h3 className="panel__title">{t('Sinflar kesimida')}</h3>
          <div className="jbar">
            <div className="chips chips--nowrap">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  className={`chip ${chorak === q ? 'is-on' : ''}`}
                  onClick={() => changeChorak(q as Chorak)}
                >
                  {quarterLabel(q, lang)}
                </button>
              ))}
              <button className={`chip ${chorak === 'u' ? 'is-on' : ''}`} onClick={() => changeChorak('u')}>
                {t('Umumiy')}
              </button>
            </div>
          </div>
          <AdminStatsTable chorak={chorak} />
        </section>
      )}
    </div>
  )
}
