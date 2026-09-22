import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BarChart } from '@/components/charts/BarChart'
import { StatCard } from '@/components/charts/StatCard'
import { TrendLineChart } from '@/components/charts/TrendLineChart'
import { Skeleton } from '@/components/Skeleton'
import { quarterLabel } from '@/features/journal/labels'
import { gradeLabel, type Grade } from '@/features/lessons/labels'
import { DAYS } from '@/features/timetable/types'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useDashboardSummary } from './api'
import { MasteryBreakdown } from './MasteryBreakdown'
import type { DashboardChorak } from './types'

const CATEGORICAL = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
// Bitta seriyali diagrammalar (kunlar, choraklar) — bitta rang, chunki
// ustunlar "kim" ekanini emas, faqat miqdorni bildiradi.
const SINGLE = 'var(--cat-1)'

const ROLE_LABELS: Record<string, string> = {
  teacher: "O'qituvchi",
  admin: 'Admin',
  boshliq: 'Boshliq',
}

const fmtShortDate = (iso: string, lang: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
  })
}

/** Ulush foizi; maxraj 0 bo'lsa null — progress-bar chizilmaydi (0/0 dan
 *  "0%" to'ldirilgan chiziq chiqmasin). */
const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)

/** Platformaning yagona statistika sahifasi, mavzu bo'yicha to'rt mustaqil
 *  kartochkaga ajratilgan:
 *
 *   1. O'quv jarayoni — jurnal: sinflar, o'quvchilar, davomat va
 *      o'zlashtirish, MasteryBreakdown orqali umumiy / maktab / sinf
 *      kesimida, uch shakldan (Taqsimot/Taqqoslash/Dinamika) birini
 *      tanlab, doim ko'rinadigan raqamlar jadvali bilan birga.
 *   2. Dars jadvali — haftalik yuklama, kunlar bo'yicha
 *   3. Dars materiallari — darslar soni, hujjat va tarjima qamrovi
 *   4. Tizim va foydalanuvchilar — hisoblar, xavfsizlik, bildirishnomalar
 *
 *  Chorak tanlagichi ataylab birinchi kartochka ichida: backendda u faqat
 *  o'zlashtirish va davomatni filtrlaydi (dashboard/mastery.py orqali),
 *  qolgan ko'rsatkichlarga umuman ta'sir qilmaydi.
 *
 *  Hech qanday o'sish/trend matni to'qib chiqarilmaydi — progress-bar faqat
 *  haqiqiy ulush bor joyda (davomat, hujjat/tarjima qamrovi, tasdiq
 *  kutayotganlar, Telegram/2FA) ko'rsatiladi.
 *
 *  Ko'rish huquqi: o'qituvchi birinchi ikki kartochkani, faqat o'z sinflari
 *  va o'z jadvali bo'yicha ko'radi (backend shunday qaytaradi); admin
 *  hammasini butun tashkilot bo'yicha ko'radi. MasteryBreakdown ham shu
 *  chegarani /api/dashboard/mastery/ orqali qaytaradi, shuning uchun
 *  admin bilan bir xil kartochka ichida, faqat 1-kartochka ichida
 *  (`admin &&` bilan emas) hamma foydalanuvchi uchun ko'rinadi. */
export function StatisticsPage() {
  const { t } = useTranslation()
  const { lang, viewMode } = useUIStore()
  const { user } = useAuth()
  const admin = isAdminInView(user, viewMode)

  // Chorak tanlovi Jurnal bilan bitta kalitda saqlanadi — foydalanuvchi
  // uchun bu bitta "qaysi chorakdaman" holati.
  const [chorak, setChorak] = useState<DashboardChorak>(() => {
    const raw = localStorage.getItem('afmd.chorak')
    return raw === 'u' ? 'u' : ((Number(raw) as DashboardChorak) || 1)
  })
  const changeChorak = (q: DashboardChorak) => {
    setChorak(q)
    localStorage.setItem('afmd.chorak', String(q))
  }

  const { data, isLoading } = useDashboardSummary(chorak)

  if (isLoading || !data) return <Skeleton lines={4} />

  const { timetable } = data

  return (
    <div className="stats">
      <h2 className="settings__title">{t('Statistika')}</h2>

      {/* ── 1. O'quv jarayoni ─────────────────────────────── */}
      <section className="panel dash">
        <div className="jhead">
          <h3 className="panel__title">{t("O'quv jarayoni")}</h3>
          <div className="chips chips--nowrap">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                className={`chip ${chorak === q ? 'is-on' : ''}`}
                onClick={() => changeChorak(q as DashboardChorak)}
              >
                {quarterLabel(q, lang)}
              </button>
            ))}
            <button className={`chip ${chorak === 'u' ? 'is-on' : ''}`} onClick={() => changeChorak('u')}>
              {t('Umumiy')}
            </button>
          </div>
        </div>
        <p className="form__note stats__note">
          {t("Chorak tanlovi shu bo'limdagi o'zlashtirish va davomatga tegishli.")}
        </p>

        <MasteryBreakdown chorak={chorak} />
      </section>

      {/* ── 2. Dars jadvali ───────────────────────────────── */}
      <section className="panel dash">
        <h3 className="panel__title">{t('Dars jadvali')}</h3>
        <div className="dash__stats">
          <StatCard
            label={t('Haftalik dars soati')}
            value={timetable.total_hours}
            hint={admin ? t("Barcha o'qituvchilar bo'yicha") : t('Sizning jadvalingiz')}
            icon="calendar"
          />
        </div>
        <div className="dash__row">
          <div className="dash__card">
            <p className="dash__card-title">{t("Haftalik yuklama (kunlar bo'yicha)")}</p>
            <BarChart
              ariaLabel={t("Haftalik dars soatlarining kunlar bo'yicha taqsimoti")}
              data={timetable.by_day.map((d) => ({
                key: String(d.day_index),
                label: t(DAYS[d.day_index] ?? String(d.day_index)),
                value: d.hours,
                color: SINGLE,
              }))}
            />
          </div>
        </div>
      </section>

      {/* ── 3. Dars materiallari ──────────────────────────── */}
      {admin && data.role === 'admin' && (
        <section className="panel dash">
          <h3 className="panel__title">{t('Dars materiallari')}</h3>
          <div className="dash__stats">
            <StatCard label={t('Jami darslar')} value={data.lessons.total} icon="file" />
            <StatCard label={t('Tajribalar')} value={data.lessons.experiments_total} icon="flask" />
            <StatCard
              label={t('Hujjat biriktirilgan')}
              value={`${data.lessons.with_document} / ${data.lessons.total}`}
              icon="download"
              progressPct={pctOf(data.lessons.with_document, data.lessons.total)}
            />
            <StatCard
              label={t('Tarjima qilingan')}
              value={`${data.lessons.translated} / ${data.lessons.total}`}
              icon="book"
              progressPct={pctOf(data.lessons.translated, data.lessons.total)}
            />
          </div>
          <div className="dash__row">
            <div className="dash__card">
              <p className="dash__card-title">{t("Darslar sinf bandi bo'yicha")}</p>
              <BarChart
                ariaLabel={t("Darslar sinf bandi bo'yicha taqsimoti")}
                data={data.lessons.by_grade.map((g, i) => ({
                  key: g.grade,
                  label: gradeLabel(g.grade as Grade, lang),
                  value: g.count,
                  color: CATEGORICAL[i % CATEGORICAL.length],
                }))}
              />
            </div>
            <div className="dash__card">
              <p className="dash__card-title">{t("Choraklar bo'yicha darslar")}</p>
              <BarChart
                ariaLabel={t("Darslarning choraklar bo'yicha taqsimoti")}
                data={data.lessons.by_chorak.map((c) => ({
                  key: String(c.chorak),
                  label: quarterLabel(c.chorak, lang),
                  value: c.count,
                  color: SINGLE,
                }))}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Tizim va foydalanuvchilar ──────────────────── */}
      {admin && data.role === 'admin' && (
        <section className="panel dash">
          <h3 className="panel__title">{t('Tizim va foydalanuvchilar')}</h3>
          <div className="dash__stats">
            <StatCard label={t('Jami foydalanuvchilar')} value={data.users.total} icon="users" />
            <StatCard
              label={t('Tasdiq kutmoqda')}
              value={data.users.pending_approval}
              accent={data.users.pending_approval > 0 ? 'mid' : undefined}
              icon="user"
              progressPct={pctOf(data.users.pending_approval, data.users.total)}
            />
            <StatCard
              label={t('Telegram ulangan')}
              value={`${data.users.telegram_linked} / ${data.users.total}`}
              icon="telegram"
              progressPct={pctOf(data.users.telegram_linked, data.users.total)}
            />
            <StatCard
              label={t('Ikki bosqichli tasdiq')}
              value={`${data.users.two_factor_enabled} / ${data.users.total}`}
              icon="lock"
              progressPct={pctOf(data.users.two_factor_enabled, data.users.total)}
            />
            {/* Kalit sozlanmagan bo'lsa "0 obunachi" chalg'itadi — hech kim
                obuna bo'la olmaydi. Buni "sozlanmagan" deb aytamiz. */}
            <StatCard
              label={t('Push obunachilar')}
              value={data.engagement.push_configured ? data.engagement.push_subscribers : '—'}
              hint={data.engagement.push_configured ? undefined : t('Serverda sozlanmagan')}
              accent={data.engagement.push_configured ? undefined : 'mid'}
              icon="bell"
            />
            <StatCard label={t("So'nggi 30 kunlik e'lonlar")} value={data.engagement.announcements_last_30d} icon="megaphone" />
            <StatCard label={t('Kutayotgan tarjima ishlari')} value={data.engagement.translation_jobs_pending} icon="list" />
          </div>

          <div className="dash__row">
            <div className="dash__card">
              <p className="dash__card-title">{t("Yangi ro'yxatdan o'tishlar")}</p>
              <TrendLineChart
                ariaLabel={t("Kunlik ro'yxatdan o'tishlar soni")}
                data={data.users.signups_by_day.map((d) => ({ date: d.date, value: d.count }))}
                formatDate={(iso) => fmtShortDate(iso, lang)}
              />
            </div>
            <div className="dash__card">
              <p className="dash__card-title">{t("Xodimlar rol bo'yicha")}</p>
              <BarChart
                ariaLabel={t("Xodimlar rol bo'yicha taqsimoti")}
                data={data.users.by_role.map((r, i) => ({
                  key: r.role,
                  label: t(ROLE_LABELS[r.role] ?? r.role),
                  value: r.count,
                  color: CATEGORICAL[i % CATEGORICAL.length],
                }))}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
