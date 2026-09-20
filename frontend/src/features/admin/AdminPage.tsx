import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'
import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { RoleBadge } from '@/components/RoleBadge'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useCreateAnnouncement } from '@/features/announcements/api'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import type { Paginated, User } from '@/lib/api/types'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { ImportLessonsModal } from './ImportLessonsModal'
import { ImportTranslationsModal } from './ImportTranslationsModal'

const rank = (u: User) => (u.is_dev_superuser ? 0 : u.role === 'admin' || u.role === 'boshliq' ? 1 : 2)

// Static reference only — not derived from the actual permission code, so
// keep it in sync by hand when accounts/models.py's is_admin or a
// get_permissions() override changes. Shown to the dev-superuser only,
// as a quick lookup for "who can do what" across the app.
const ROLE_CAPABILITIES: { user: Pick<User, 'is_dev_superuser' | 'role'>; label: string; items: string[] }[] = [
  {
    user: { is_dev_superuser: true, role: 'teacher' },
    label: 'Dasturchi',
    items: [
      "Admin va Boshliqning barcha vakolatlariga ega",
      "Boshqa foydalanuvchini Admin yoki Boshliq qilishi (va bu huquqni olib tashlashi) mumkin — faqat u",
      "Boshqa admin/boshliq/dasturchi hisobini boshqarishi (bloklash, parolni tiklash, rad etish) mumkin",
    ],
  },
  {
    user: { is_dev_superuser: false, role: 'admin' },
    label: 'Admin',
    items: [
      "O'qituvchilarni tasdiqlash/rad etish/bloklash, parolini tiklash",
      "Darslarni qo'shish/tahrirlash/o'chirish/ko'chirish (barcha choraklar), choraklarni ochish/yopish, tajribalar tartibini surib o'zgartirish",
      "Kutubxonaga material qo'shish/tahrirlash/o'chirish, fayl yuklash",
      "E'lon yuborish va o'chirish, darslar/tarjimalarni import-eksport qilish",
      "Har qanday o'qituvchining dars jadvalini tahrirlashi mumkin (ko'rish — \"Barcha o'qituvchilar\" — endi barcha o'qituvchiga ochiq)",
      "Barcha o'qituvchilarning jurnal statistikasini ko'rish",
      "Botga yuborilgan xabar va admin harakatlari haqidagi bildirishnomalarni Telegramda oladi",
      "Boshqa admin/boshliq/dasturchini boshqara olmaydi — faqat dasturchi",
    ],
  },
  {
    user: { is_dev_superuser: false, role: 'boshliq' },
    label: 'Boshliq',
    items: [
      "Admin bilan bir xil barcha vakolatlarga ega (yuqoridagilarning barchasi)",
      "Farqi — odatda shaxsiy dars/jurnal/jadval yuritmaydi, faqat nazorat qiladi",
      "Boshqa admin/boshliq/dasturchini boshqara olmaydi — faqat dasturchi",
    ],
  },
  {
    user: { is_dev_superuser: false, role: 'teacher' },
    label: 'Ustoz',
    items: [
      "Faqat ochiq choraklardagi darslarni va kutubxonani ko'radi",
      "Faqat o'z sinflari/o'quvchilari uchun jurnal yuritadi (baho, davomat)",
      "Faqat o'zining haftalik dars jadvalini tahrirlaydi",
      "\"Barcha o'qituvchilar\" umumiy dars jadvalini ko'ra oladi (faqat ko'rish — tahrirlay olmaydi), lekin boshqalarning jurnalini ko'ra olmaydi",
      "Dars, kutubxona materiali yoki e'lon qo'sha olmaydi",
      "Botga yozgan xabari adminlar va boshliqqa Telegram orqali yetib boradi",
    ],
  },
]
const byName = (a: User, b: User) => (a.name || '').localeCompare(b.name || '', 'uz')

function cmpTeacher(a: User, b: User) {
  const A = a.bday
  const B = b.bday
  if (A && B) return A.localeCompare(B)
  if (A && !B) return -1
  if (!A && B) return 1
  return byName(a, b)
}

function cmpUser(a: User, b: User) {
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  return ra === 2 ? cmpTeacher(a, b) : byName(a, b)
}

const fmtBday = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '—')

function NewPasswordModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      toast(t('Nusxalandi'))
    } catch {
      // clipboard permission denied — the password is still shown on screen to copy by hand
    }
  }

  return (
    <Modal
      title={t('Parolni tiklash')}
      onClose={onClose}
      footer={<button className="btn btn--primary" onClick={onClose}>{t('Yopish')}</button>}
    >
      <p className="prose prose--note">
        {t('Yangi parol yaratildi. Uni foydalanuvchiga yetkazing — bu oyna yopilgach qayta ko\'rsatib bo\'lmaydi.')}
      </p>
      <label className="field">
        <span className="field__label">{email}</span>
        <div className="row row--2">
          <input className="input" value={password} readOnly onFocus={(e) => e.target.select()} style={{ fontFamily: 'var(--f-mono)' }} />
          <button type="button" className="btn" onClick={copy}>{t('Nusxalash')}</button>
        </div>
      </label>
    </Modal>
  )
}

function AnnounceModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const create = useCreateAnnouncement()
  const toast = useToast()

  const submit = async () => {
    const msg = text.trim()
    if (!msg) return toast(t('Xabar matnini kiriting'), 'error')
    try {
      await create.mutateAsync(msg)
      toast(t("E'lon yuborildi"))
      onClose()
    } catch {
      toast(t('Yuborishda xatolik'), 'error')
    }
  }

  return (
    <Modal
      title={t("E'lon yuborish")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={create.isPending}>{t('Yuborish')}</button>
        </>
      }
    >
      <p className="prose prose--note">{t("Xabar barcha o'qituvchilarning bildirishnomalarida ko'rinadi.")}</p>
      <label className="field">
        <span className="field__label">{t('Xabar matni')}</span>
        <textarea
          className="input"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Masalan: 12-sentyabr kuni metodik seminar bo'lib o'tadi.")}
        />
      </label>
    </Modal>
  )
}

export function AdminPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const { viewMode } = useUIStore()
  const admin = isAdminInView(me, viewMode)
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [announcing, setAnnouncing] = useState(false)
  const [importingLessons, setImportingLessons] = useState(false)
  const [importingTranslations, setImportingTranslations] = useState(false)
  const [newPassword, setNewPassword] = useState<{ email: string; password: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get<Paginated<User>>('/accounts/users/')).data.results,
    enabled: admin,
  })

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => api.post(`/accounts/users/${id}/${action}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: () => toast(t("Amalni bajarib bo'lmadi"), 'error'),
  })

  const exportLessons = async () => {
    try {
      toast(t('Tayyorlanmoqda…'))
      const all: Record<string, unknown>[] = []
      let url: string | null = '/lessons/'
      while (url) {
        const res: { data: Paginated<Record<string, unknown>> } = await api.get(url)
        all.push(...res.data.results)
        url = res.data.next
      }
      all.sort((a, b) => {
        const ga = a.grade as number, gb = b.grade as number
        const ca = a.chorak as number, cb = b.chorak as number
        const ha = (a.hafta as number) || 99, hb = (b.hafta as number) || 99
        return ga - gb || ca - cb || ha - hb
      })
      const blob = new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `darslar_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(a.href)
        a.remove()
      }, 500)
      toast(`${all.length} ${t('ta dars eksport qilindi')}`)
    } catch {
      toast(t('Eksport xatosi'), 'error')
    }
  }

  if (admin && isLoading) return <Skeleton lines={5} />

  const users = data ?? []
  const pending = users.filter((u) => !u.approved && u.role !== 'admin' && u.role !== 'boshliq')
  const approved = users.filter((u) => u.approved || u.role === 'admin' || u.role === 'boshliq').sort(cmpUser)

  const onApprove = (id: string) => act.mutate({ id, action: 'approve' }, { onSuccess: () => toast(t('Tasdiqlandi')) })
  const onReject = async (u: User) => {
    if (!(await confirm({ title: t('Arizani rad etish'), text: `${u.email || ''} — ${t("ariza o'chiriladi.")}`, danger: true }))) return
    act.mutate({ id: u.id, action: 'reject' }, { onSuccess: () => toast(t('Ariza rad etildi')) })
  }
  const onPromote = async (u: User) => {
    if (!(await confirm({ title: t('Admin qilish'), text: `${u.email || ''} — ${t('admin huquqlari beriladi.')}` }))) return
    act.mutate({ id: u.id, action: 'promote' }, { onSuccess: () => toast(t('Admin qilindi')) })
  }
  const onSetBoshliq = async (u: User) => {
    if (!(await confirm({ title: t('Boshliq qilish'), text: `${u.email || ''} — ${t("boshliq huquqlari beriladi (admin kabi nazorat qiladi, lekin dars/jurnal yuritmaydi).")}` }))) return
    act.mutate({ id: u.id, action: 'set-boshliq' }, { onSuccess: () => toast(t('Boshliq qilindi')) })
  }
  const onDemote = async (u: User) => {
    const isBoshliq = u.role === 'boshliq'
    if (!(await confirm({
      title: isBoshliq ? t('Boshliqlikni olish') : t('Adminlikni olish'),
      text: `${u.email || ''} — ${t("huquqlari olib tashlanadi (o'qituvchi bo'lib qoladi).")}`,
      danger: true,
    }))) return
    act.mutate({ id: u.id, action: 'demote' }, { onSuccess: () => toast(isBoshliq ? t('Boshliqlik olindi') : t('Adminlik olindi')) })
  }
  const onBlock = async (u: User) => {
    if (!(await confirm({ title: t("Kirishni to'xtatish"), text: `${u.email || ''} ${t('endi tizimga kira olmaydi. Keyin qayta tasdiqlashingiz mumkin.')}` }))) return
    act.mutate({ id: u.id, action: 'block' }, { onSuccess: () => toast(t("Kirish to'xtatildi")) })
  }
  const onResetPassword = async (u: User) => {
    if (!(await confirm({ title: t('Parolni tiklash'), text: `${u.email || ''} — ${t("yangi parol yaratiladi.")}` }))) return
    try {
      const res = await api.post<{ password: string }>(`/accounts/users/${u.id}/reset-password/`)
      setNewPassword({ email: u.email, password: res.data.password })
    } catch {
      toast(t("Amalni bajarib bo'lmadi"), 'error')
    }
  }

  return (
    <div>
      {admin && (
        <>
          <section className="panel">
            <h3 className="panel__title">{t("Ma'lumot")}</h3>
            <p className="prose" style={{ marginBottom: 12 }}>{t("Darslarni JSON fayldan ko'chirib olish.")}</p>
            <div className="panel__acts">
              <button className="btn" onClick={() => setImportingLessons(true)}>{IC.upload} {t('Darslarni import qilish')}</button>
              <button className="btn" onClick={exportLessons}>{IC.download} {t('Darslarni eksport (JSON)')}</button>
              <button className="btn" onClick={() => setImportingTranslations(true)}>{IC.upload} {t('Tarjimalarni import qilish')}</button>
              <button className="btn" onClick={() => setAnnouncing(true)}>{IC.megaphone} {t("E'lon yuborish")}</button>
            </div>
          </section>

          {pending.length > 0 && (
            <section className="panel panel--attention">
              <h3 className="panel__title">{t('Tasdiq kutmoqda')} <span className="badge">{pending.length}</span></h3>
              <ul className="people">
                {pending.map((u) => (
                  <li key={u.id} className="person">
                    <div>
                      <p className="person__name">{u.name || '—'}</p>
                      <p className="person__mail">{u.email || ''}</p>
                    </div>
                    <div className="person__acts">
                      <button className="btn btn--sm btn--primary" onClick={() => onApprove(u.id)}>{t('Tasdiqlash')}</button>
                      <button className="btn btn--sm btn--ghost" onClick={() => onReject(u)}>{t('Rad etish')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {approved.length > 0 && (
            <section className="panel">
              <h3 className="panel__title">{t('Xodimlar')} <span className="badge">{approved.length}</span></h3>
              <div className="staff">
                {approved.map((u) => (
                  <article key={u.id} className="stf">
                    <div className="stf__head">
                      <div className="stf__av">
                        <Avatar name={u.name} photo={u.photo} className="stf__img" />
                      </div>
                      <div className="stf__id">
                        <p className="stf__nm">{u.name || '—'}</p>
                        <RoleBadge user={u} />
                      </div>
                    </div>
                    <div className="stf__b">
                      <p className="stf__row"><span>{t("Tug'ilgan sana")}</span><b>{fmtBday(u.bday)}</b></p>
                      <p className="stf__row"><span>{t('Telefon')}</span><b>{u.phone || '—'}</b></p>
                      <p className="stf__row"><span>{t('Email')}</span><b>{u.email || '—'}</b></p>
                      <p className="stf__row">
                        <span>Telegram</span>
                        <b>
                          {u.telegram_linked
                            ? `✅ ${u.telegram_username ? '@' + u.telegram_username : t('Ulangan')}`
                            : `❌ ${t('Ulanmagan')}`}
                        </b>
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h3 className="panel__title">{t('Foydalanuvchilar')} <span className="badge">{approved.length}</span></h3>
            {approved.length ? (
              <ul className="people">
                {approved.map((u) => {
                  const isSelf = u.id === me?.id
                  const targetIsDev = u.is_dev_superuser
                  const targetIsAdm = u.role === 'admin' || u.role === 'boshliq'
                  const canManage = !isSelf && !targetIsDev && (me?.is_dev_superuser || !targetIsAdm)
                  return (
                    <li key={u.id} className="person">
                      <div>
                        <p className="person__name">{u.name || '—'} <RoleBadge user={u} /></p>
                        <p className="person__mail">{u.email || ''}</p>
                      </div>
                      {isSelf ? (
                        <span className="person__you">{t('siz')}</span>
                      ) : canManage ? (
                        <div className="person__acts">
                          {me?.is_dev_superuser &&
                            (targetIsAdm ? (
                              <button className="btn btn--sm btn--ghost" onClick={() => onDemote(u)}>
                                {u.role === 'boshliq' ? t('Boshliqlikni olish') : t('Adminlikni olish')}
                              </button>
                            ) : (
                              <>
                                <button className="btn btn--sm btn--ghost" onClick={() => onPromote(u)}>{t('Admin qilish')}</button>
                                <button className="btn btn--sm btn--ghost" onClick={() => onSetBoshliq(u)}>{t('Boshliq qilish')}</button>
                              </>
                            ))}
                          <button className="btn btn--sm btn--ghost" onClick={() => onResetPassword(u)}>{t('Parolni tiklash')}</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => onBlock(u)}>{t("Kirishni to'xtatish")}</button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="prose">{t("Hali tasdiqlangan foydalanuvchi yo'q.")}</p>
            )}
          </section>

          {me?.is_dev_superuser && (
            <section className="panel">
              <h3 className="panel__title">{t('Rollar va vakolatlar')}</h3>
              <div className="rolesref">
                {ROLE_CAPABILITIES.map((r) => (
                  <div key={r.label} className="rolesref__row">
                    <p className="rolesref__role">
                      <RoleBadge user={r.user} />
                    </p>
                    <ul className="rolesref__list">
                      {r.items.map((item, i) => (
                        <li key={i}>{t(item)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {announcing && <AnnounceModal onClose={() => setAnnouncing(false)} />}
          {importingLessons && <ImportLessonsModal onClose={() => setImportingLessons(false)} />}
          {importingTranslations && <ImportTranslationsModal onClose={() => setImportingTranslations(false)} />}
          {newPassword && (
            <NewPasswordModal email={newPassword.email} password={newPassword.password} onClose={() => setNewPassword(null)} />
          )}
        </>
      )}
    </div>
  )
}
