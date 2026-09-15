import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { getPushState, isPushSupported, subscribeToPush, type PushState } from '@/lib/push/subscribe'
import { useUIStore } from '@/store/uiStore'
import { useAnnouncementsSocket } from '@/lib/ws/useAnnouncementsSocket'

import { useAnnouncements, useApprovedUsers, useDeleteAnnouncement } from './api'
import { markSeen } from './seen'

interface NotifyItem {
  ic: string
  title: string
  body: string
  at: number
  pin?: boolean
  announcementId?: number
}

const LOCALE_MAP: Record<string, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }

function formatDateTime(ms: number, lang: string): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(LOCALE_MAP[lang] ?? 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const todayMD = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const ALL_TPL = "🎉 Hurmatli hamkasblar!\n\nBugun ustozimiz {nm}ning tavallud ayyomlari.\n\nMuhandis_D jamoasi nomidan ustozimizni ushbu qutlug' sana bilan samimiy muborakbod etamiz. Ustozimizga mustahkam sog'lik, uzoq va mazmunli umr, oilaviy baxt-saodat hamda kasbiy faoliyatlarida yanada yuksak muvaffaqiyatlar tilaymiz.\n\nUlarning fidokorona mehnati, bilim va tajribasi ko'plab shogirdlar kamolotiga xizmat qilib kelmoqda. Kelgusida ham ularga kuch-g'ayrat, ilhom va yangi zafarlar yor bo'lishini tilab qolamiz.\n\n🎂 Tavallud ayyomingiz muborak bo'lsin, {nm}!"
const OWN_TPL = "🎂 Hurmatli {nm}!\n\nMuhandis_D jamoasi nomidan Sizni tavallud ayyomingiz bilan chin dildan muborakbod etamiz.\n\nUshbu qutlug' kunda Sizga mustahkam sog'lik, uzoq umr, xonadoningizga fayz-u baraka, qalbingizga xotirjamlik va hayotingizga cheksiz quvonch tilaymiz. Ta'lim va tarbiya yo'lidagi sharafli faoliyatingizda doimo ulkan muvaffaqiyatlarga erishib, mehnatingiz samarasini ko'rib yurishingizni tilaymiz.\n\nBilimingiz, tajribangiz va fidoyiligingiz jamoadoshlar hamda shogirdlaringiz uchun doimo ibrat bo'lib qolsin. Hayot yo'lingiz ezgu amallar, samimiy ehtirom va yorqin yutuqlar bilan bezanib borsin.\n\nBaxt-u saodat, sharaf va muvaffaqiyat hamisha hayotingizning ajralmas hamrohi bo'lib qolsin. Barcha ezgu niyat va maqsadlaringiz ro'yobga chiqsin.\n\n🎉 Tug'ilgan kuningiz muborak bo'lsin!\n\nHurmat bilan,\nMuhandis_D jamoasi"

export function NotificationsPage() {
  const { t } = useTranslation()
  const { lang, viewMode } = useUIStore()
  const { user } = useAuth()
  const admin = isAdminInView(user, viewMode)
  const toast = useToast()
  const confirm = useConfirm()
  const { data: anns } = useAnnouncements()
  const { data: people } = useApprovedUsers()
  const deleteAnn = useDeleteAnnouncement()

  const [pushState, setPushState] = useState<PushState>('unsubscribed')
  const [pushBusy, setPushBusy] = useState(false)

  useAnnouncementsSocket(true)

  const onDeleteAnnouncement = async (id: number) => {
    if (!(await confirm({ title: t("E'lonni o'chirish"), text: t("Bu e'lon hammaning bildirishnomalaridan o'chiriladi."), danger: true }))) return
    try {
      await deleteAnn.mutateAsync(id)
      toast(t("E'lon o'chirildi"))
    } catch {
      toast(t("O'chirishda xatolik"), 'error')
    }
  }

  useEffect(() => {
    getPushState().then(setPushState).catch(() => {})
  }, [])

  const onEnablePush = async () => {
    setPushBusy(true)
    try {
      await subscribeToPush()
      setPushState('subscribed')
      toast(t('Push bildirishnomalar yoqildi'))
    } catch (err) {
      toast(t(err instanceof Error ? err.message : "Amalni bajarib bo'lmadi"), 'error')
      setPushState(await getPushState())
    } finally {
      setPushBusy(false)
    }
  }

  const items = useMemo<NotifyItem[]>(() => {
    const md = todayMD()
    const out: NotifyItem[] = []

    ;(people ?? [])
      .filter((p) => (p.bday || '').slice(5) === md)
      .forEach((p) => {
        const isMe = p.id === user?.id
        const nm = p.name || ''
        out.push({
          ic: '🎂',
          title: t(isMe ? "Tug'ilgan kuningiz muborak!" : 'Tavallud ayyomi'),
          body: t(isMe ? OWN_TPL : ALL_TPL).replace(/\{nm\}/g, nm),
          at: startOfToday(),
          pin: true,
        })
      })
    ;(anns ?? []).forEach((a) => {
      out.push({ ic: '📢', title: t("E'lon"), body: a.text, at: new Date(a.at).getTime(), announcementId: a.id })
    })

    return out.sort((a, b) => b.at - a.at)
  }, [people, anns, user, t])

  return (
    <div className="settings">
      <div className="settings__title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{t('Bildirishnomalar')}</h2>
        <button className="btn btn--sm" onClick={markSeen}>
          {IC.check2} {t("O'qilgan")}
        </button>
      </div>

      {isPushSupported() && pushState !== 'subscribed' && (
        <div className="panel">
          <p className="prose">
            {pushState === 'denied'
              ? t('Bildirishnomalar bloklangan — brauzer sozlamalaridan ruxsat bering.')
              : t("Ilova yopiq bo'lsa ham bildirishnoma olish uchun push'ni yoqing.")}
          </p>
          {pushState !== 'denied' && (
            <button type="button" className="btn btn--sm btn--primary" onClick={onEnablePush} disabled={pushBusy}>
              {IC.bell} {t('Push yoqish')}
            </button>
          )}
        </div>
      )}

      <div className="panel">
        {items.length ? (
          items.map((n, i) => (
            <div key={i} className={`np__item ${n.pin ? 'np__item--pin' : ''}`}>
              <span className="np__ic" aria-hidden="true">
                {n.ic}
              </span>
              <span className="np__tx">
                <span className="np__row">
                  <span className="np__title">{n.title}</span>
                  <span className="np__time">{formatDateTime(n.at, lang)}</span>
                </span>
                <span className="np__quote">{n.body}</span>
              </span>
              {admin && n.announcementId != null && (
                <button
                  type="button"
                  className="icon-btn icon-btn--danger np__del"
                  onClick={() => onDeleteAnnouncement(n.announcementId!)}
                  title={t("E'lonni o'chirish")}
                  aria-label={t("E'lonni o'chirish")}
                >
                  {IC.trash}
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="np__empty">{t("Yangi bildirishnoma yo'q")}</p>
        )}
      </div>
    </div>
  )
}
