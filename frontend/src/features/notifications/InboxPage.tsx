import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useAnnouncements, useDeleteAnnouncement } from '@/features/announcements/api'
import { PageHead, fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useInbox, useNotifyAction, type AppNotification, type NotifyKind } from './api'
import { ALL_KINDS, KIND_META } from './kinds'
import { useNotifyLive } from './liveStore'

const ALL_TPL = "🎉 Hurmatli hamkasblar!\n\nBugun ustozimiz {nm}ning tavallud ayyomlari.\n\nMuhandis_D jamoasi nomidan ustozimizni ushbu qutlug' sana bilan samimiy muborakbod etamiz. Ustozimizga mustahkam sog'lik, uzoq va mazmunli umr, oilaviy baxt-saodat hamda kasbiy faoliyatlarida yanada yuksak muvaffaqiyatlar tilaymiz.\n\nUlarning fidokorona mehnati, bilim va tajribasi ko'plab shogirdlar kamolotiga xizmat qilib kelmoqda. Kelgusida ham ularga kuch-g'ayrat, ilhom va yangi zafarlar yor bo'lishini tilab qolamiz.\n\n🎂 Tavallud ayyomingiz muborak bo'lsin, {nm}!"
const OWN_TPL = "🎂 Hurmatli {nm}!\n\nMuhandis_D jamoasi nomidan Sizni tavallud ayyomingiz bilan chin dildan muborakbod etamiz.\n\nUshbu qutlug' kunda Sizga mustahkam sog'lik, uzoq umr, xonadoningizga fayz-u baraka, qalbingizga xotirjamlik va hayotingizga cheksiz quvonch tilaymiz. Ta'lim va tarbiya yo'lidagi sharafli faoliyatingizda doimo ulkan muvaffaqiyatlarga erishib, mehnatingiz samarasini ko'rib yurishingizni tilaymiz.\n\nBilimingiz, tajribangiz va fidoyiligingiz jamoadoshlar hamda shogirdlaringiz uchun doimo ibrat bo'lib qolsin. Hayot yo'lingiz ezgu amallar, samimiy ehtirom va yorqin yutuqlar bilan bezanib borsin.\n\nBaxt-u saodat, sharaf va muvaffaqiyat hamisha hayotingizning ajralmas hamrohi bo'lib qolsin. Barcha ezgu niyat va maqsadlaringiz ro'yobga chiqsin.\n\n🎉 Tug'ilgan kuningiz muborak bo'lsin!\n\nHurmat bilan,\nMuhandis_D jamoasi"

const LOCALE: Record<string, string> = { uz: 'uz', ru: 'ru', en: 'en' }

function ago(iso: string, lang: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang] ?? 'uz', { numeric: 'auto' })
  if (diff < 60) return rtf.format(0, 'second')
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour')
  if (diff < 86400 * 7) return rtf.format(-Math.floor(diff / 86400), 'day')
  return fmtDateTime(iso)
}

/** Messages whose whole content is the text itself open in a reader; the
 *  rest jump to the page they're about. */
function opensReader(n: AppNotification) {
  return n.kind === 'elon' || n.kind === 'tugilgan' || !n.url || n.url === '/notifications'
}

export function InboxPage() {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const viewMode = useUIStore((s) => s.viewMode)
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [box, setBox] = useState<'inbox' | 'archive'>('inbox')
  const [kind, setKind] = useState<NotifyKind | ''>('')
  const [reading, setReading] = useState<AppNotification | null>(null)
  const list = useInbox(box, kind)
  const act = useNotifyAction()
  const unread = useNotifyLive((s) => s.unread)
  const admin = isAdminInView(user, viewMode)
  const anns = useAnnouncements()
  const delAnn = useDeleteAnnouncement()
  const [annOpen, setAnnOpen] = useState(false)

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.results) ?? [], [list.data])

  const open = (n: AppNotification) => {
    if (!n.read_at) act.mutate({ id: n.id, action: 'read' })
    if (opensReader(n)) setReading(n)
    else navigate(n.url)
  }

  const readerText = (n: AppNotification) => {
    if (n.kind === 'tugilgan' && n.data?.days === 0 && n.data.name) {
      return t(n.data.self ? OWN_TPL : ALL_TPL).replace(/\{nm\}/g, n.data.name)
    }
    return t(n.body)
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('Nusxa olindi'))
    } catch {
      toast(t("Nusxa olib bo'lmadi"), 'error')
    }
  }

  const onDeleteAnnouncement = async (id: number) => {
    if (!(await confirm({ title: t("E'lonni o'chirish"), text: t("Bu e'lon hammaning bildirishnomalaridan o'chiriladi."), danger: true }))) return
    try {
      await delAnn.mutateAsync(id)
      toast(t("E'lon o'chirildi"))
    } catch {
      toast(t("O'chirishda xatolik"), 'error')
    }
  }

  return (
    <div className="setpg inbox">
      <PageHead
        title={t('Bildirishnomalar')}
        sub={`${unread} ${t("ta o'qilmagan")}`}
        actions={unread > 0 && box === 'inbox' ? (
          <button type="button" className="btn btn--sm" onClick={() => act.mutate({ id: 'all', action: 'read' })}>{IC.check2} {t("Hammasini o'qilgan deb belgilash")}</button>
        ) : undefined}
      />

      <div className="panel inbox__bar">
        <div className="inbox__boxes">
          <button type="button" className={`ibtab ${box === 'inbox' ? 'is-on' : ''}`} onClick={() => setBox('inbox')}>{t('Kelganlar')}</button>
          <button type="button" className={`ibtab ${box === 'archive' ? 'is-on' : ''}`} onClick={() => setBox('archive')}>{t('Arxiv')}</button>
        </div>
        <span className="inbox__sep" aria-hidden="true" />
        <span className="inbox__tl">{t('Tur')}:</span>
        <div className="inbox__kinds">
          <button type="button" className={`ikind ${kind === '' ? 'is-on' : ''}`} onClick={() => setKind('')}>{t('Hammasi')}</button>
          {ALL_KINDS.map((k) => (
            <button key={k} type="button" className={`ikind ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>{t(KIND_META[k].label)}</button>
          ))}
        </div>
      </div>

      <section className="panel inbox__list">
        {list.isLoading ? (
          <p className="prose prose--note">{t('Yuklanmoqda…')}</p>
        ) : rows.length ? (
          <ul className="nlist">
            {rows.map((n) => {
              const meta = KIND_META[n.kind] ?? KIND_META.tizim
              return (
                <li key={n.id} className={`nrow ${n.read_at ? '' : 'is-unread'}`}>
                  <span className="nrow__ic" style={{ ['--k' as string]: meta.tone }}>{IC[meta.icon]}</span>
                  <button type="button" className="nrow__txt" onClick={() => open(n)}>
                    <span className="nrow__t">{t(n.title)}</span>
                    {n.body && <span className="nrow__b">{n.kind === 'elon' ? n.data?.preview || n.body : t(n.body)}</span>}
                    <span className="nrow__at">{t(meta.label)} · {ago(n.created_at, lang)}</span>
                  </button>
                  <span className="nrow__acts">
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => open(n)}>{IC.eye} <span className="nrow__lbl">{t("Ko'rish")}</span></button>
                    {box === 'inbox' ? (
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => act.mutate({ id: n.id, action: 'archive' })}>
                        {IC.archive} <span className="nrow__lbl">{t('Arxivlash')}</span>
                      </button>
                    ) : (
                      <button type="button" className="btn btn--sm btn--ghost" onClick={() => act.mutate({ id: n.id, action: 'unarchive' })}>
                        {IC.undo} <span className="nrow__lbl">{t('Qaytarish')}</span>
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="np__empty">{box === 'archive' ? t('Arxiv bo\'sh') : t("Yangi bildirishnoma yo'q")}</p>
        )}
        {list.hasNextPage && (
          <button type="button" className="btn btn--sm inbox__more" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {t("Ko'proq ko'rsatish")}
          </button>
        )}
      </section>

      {admin && (
        <section className="panel">
          <button type="button" className="inbox__annhead" onClick={() => setAnnOpen((v) => !v)} aria-expanded={annOpen}>
            {IC.megaphone} {t("Yuborilgan e'lonlar")} <span className="badge">{anns.data?.length ?? 0}</span>
            <span className={`inbox__chev ${annOpen ? 'is-open' : ''}`}>{IC.chevron}</span>
          </button>
          {annOpen && (
            <ul className="nlist">
              {(anns.data ?? []).map((a) => (
                <li key={a.id} className="nrow">
                  <span className="nrow__ic" style={{ ['--k' as string]: KIND_META.elon.tone }}>{IC.megaphone}</span>
                  <span className="nrow__txt"><span className="nrow__b nrow__b--full">{a.text}</span><span className="nrow__at">{fmtDateTime(a.at)}</span></span>
                  <span className="nrow__acts">
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => onDeleteAnnouncement(a.id)} title={t("E'lonni o'chirish")}>{IC.trash}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {reading && (
        <Modal title={t(reading.title)} onClose={() => setReading(null)}
          footer={<>
            <button type="button" className="btn" onClick={() => copy(readerText(reading))}>{IC.copy} {t('Nusxa olish')}</button>
            {reading.url && reading.url !== '/notifications' && (
              <button type="button" className="btn" onClick={() => { setReading(null); navigate(reading.url) }}>{IC.external} {t("Bo'limga o'tish")}</button>
            )}
            <button type="button" className="btn btn--primary" onClick={() => setReading(null)}>{t('Yopish')}</button>
          </>}>
          <p className="nreader__at">{t(KIND_META[reading.kind]?.label ?? '')} · {fmtDateTime(reading.created_at)}</p>
          <p className="nreader">{readerText(reading)}</p>
        </Modal>
      )}
    </div>
  )
}
