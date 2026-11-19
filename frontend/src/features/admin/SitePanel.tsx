import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'

import './site-panel.css'

/* Boshqaruv → Sayt: kuragoniy.uz's front page. Requests left on it, the
   contacts and figures it shows, and the photos, testimonials and mentors
   (a section with nothing in it is not shown on the page). Pictures are
   shrunk in the browser before upload — the server disk is small. */

type Page<T> = { results: T[]; count: number }
const ADMIN = '/public/admin'

type Lead = {
  id: number; name: string; phone: string; telegram: string; message: string
  created_at: string; handled_at: string | null; handled_by_name: string; note: string
}
type Settings = {
  phone: string; email: string; address: string; telegram: string; instagram: string; youtube: string
  facebook: string; video_url: string
  stat_schools: number | null; stat_teachers: number | null; stat_pupils: number | null; stat_lessons: number | null
  live: { schools: number; teachers: number; pupils: number; lessons: number }
}
type Photo = { id: number; image: string | null; caption: string; order: number }
type Person = {
  id: number; name: string; photo: string | null; order: number; published: boolean
  subtitle?: string; text?: string; video_url?: string; title?: string; bio?: string
}

const when = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/** Our own /media/ files by their path (the host may differ behind the proxy). */
const src = (url: string | null) => {
  if (!url) return ''
  try {
    const u = new URL(url, window.location.href)
    return u.pathname.startsWith('/media/') ? u.pathname : u.href
  } catch {
    return ''
  }
}

/** A picked picture as a JPEG no larger than `max` px on its long side. */
async function shrink(file: File, max: number): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * k))
    c.height = Math.max(1, Math.round(bmp.height * k))
    const ctx = c.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export function SitePanel() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'leads' | 'contacts' | 'photos' | 'testimonials' | 'mentors'>('leads')
  const tabs = [
    { k: 'leads', label: t("So'rovlar") },
    { k: 'contacts', label: t('Kontaktlar va raqamlar') },
    { k: 'photos', label: t('Rasmlar') },
    { k: 'testimonials', label: t('Fikrlar') },
    { k: 'mentors', label: t('Ustozlar') },
  ] as const
  return (
    <section className="panel">
      <div className="sitep__head">
        <h3 className="panel__title">{t('Sayt — kuragoniy.uz bosh sahifasi')}</h3>
        <a className="btn btn--sm" href="/sayt" target="_blank" rel="noreferrer">{IC.external} {t("Saytni ko'rish")}</a>
      </div>
      <p className="prose prose--note">
        {t("Raqamlar (maktablar, o'qituvchilar, o'quvchilar, darslar) bazadan o'zi olinadi, hamkorlar — «Hamkor maktablar» ro'yxatidan. Rasm, fikr va ustozlarni shu yerda qo'shasiz; bo'sh bo'lim saytda ko'rinmaydi.")}
      </p>
      <div className="seg sitep__tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} className={`seg__b ${tab === x.k ? 'is-on' : ''}`} onClick={() => setTab(x.k)}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'leads' && <LeadsTab />}
      {tab === 'contacts' && <ContactsTab />}
      {tab === 'photos' && <PhotosTab />}
      {tab === 'testimonials' && <PeopleTab kind="testimonials" />}
      {tab === 'mentors' && <PeopleTab kind="mentors" />}
    </section>
  )
}

function LeadsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [state, setState] = useState<'open' | 'done' | ''>('open')
  const { data, isLoading } = useQuery({
    queryKey: ['site', 'leads', state],
    queryFn: async () => (await api.get<Page<Lead>>(`${ADMIN}/leads/`, { params: state ? { state } : {} })).data,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['site', 'leads'] })
  const mark = useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => api.post(`${ADMIN}/leads/${id}/handled/`, { done: done ? '1' : '0' }),
    onSuccess: refresh,
    onError: (err) => toast(t(errText(err)), 'error'),
  })
  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`${ADMIN}/leads/${id}/`),
    onSuccess: refresh,
    onError: (err) => toast(t(errText(err)), 'error'),
  })
  const onRemove = async (l: Lead) => {
    if (await confirm({ title: t("So'rovni o'chirish"), text: `${l.name}, ${l.phone}`, danger: true })) remove.mutate(l.id)
  }

  return (
    <>
      <div className="seg sitep__filter">
        {([['open', t('Yangi')], ['done', t("Bog'lanilgan")], ['', t('Hammasi')]] as const).map(([k, label]) => (
          <button key={k || 'all'} type="button" className={`seg__b ${state === k ? 'is-on' : ''}`} onClick={() => setState(k)}>{label}</button>
        ))}
      </div>
      {isLoading || !data ? <Skeleton lines={3} /> : !data.results.length ? (
        <EmptyState title={state === 'open' ? t("Yangi so'rov yo'q") : t("So'rov yo'q")} hint={t("Saytdagi «Bog'lanish» formasi to'ldirilsa, shu yerda va Telegram xabarnomada ko'rinadi.")} />
      ) : (
        <div className="tablewrap">
          <table className="dtable dtable--stack">
            <thead>
              <tr><th>{t('Sana')}</th><th>{t('Ism')}</th><th>{t('Telefon')}</th><th>{t('Telegram')}</th><th>{t('Xabar')}</th><th>{t('Holat')}</th><th /></tr>
            </thead>
            <tbody>
              {data.results.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{when(l.created_at)}</td>
                  <td data-label={t('Ism')}><b>{l.name}</b></td>
                  <td data-label={t('Telefon')} className="nowrap"><a href={`tel:${l.phone}`}>{l.phone}</a></td>
                  <td data-label={t('Telegram')}>
                    {l.telegram ? <a href={`https://t.me/${l.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">{l.telegram}</a> : '—'}
                  </td>
                  <td data-label={t('Xabar')} className="sitep__msg">{l.message || '—'}</td>
                  <td data-label={t('Holat')}>
                    {l.handled_at
                      ? <StatusPill tone="ok">{t("Bog'lanildi")}{l.handled_by_name ? ` · ${l.handled_by_name}` : ''}</StatusPill>
                      : <StatusPill tone="info">{t('Yangi')}</StatusPill>}
                  </td>
                  <td className="dtable__acts">
                    {l.handled_at
                      ? <button className="btn btn--sm btn--ghost" disabled={mark.isPending} onClick={() => mark.mutate({ id: l.id, done: false })}>{t('Yangiga qaytarish')}</button>
                      : <button className="btn btn--sm btn--primary" disabled={mark.isPending} onClick={() => mark.mutate({ id: l.id, done: true })}>{IC.check2} {t("Bog'lanildi")}</button>}
                    <button className="btn btn--sm btn--ghost" aria-label={t("O'chirish")} title={t("O'chirish")} onClick={() => onRemove(l)}>{IC.trash}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const TEXT_FIELDS: { k: keyof Settings; label: string; ph: string; type?: string }[] = [
  { k: 'phone', label: 'Telefon', ph: '+998 90 123 45 67', type: 'tel' },
  { k: 'email', label: 'Email', ph: 'info@kuragoniy.uz', type: 'email' },
  { k: 'telegram', label: 'Telegram', ph: '@kanal yoki https://t.me/...' },
  { k: 'instagram', label: 'Instagram', ph: '@sahifa yoki havola' },
  { k: 'youtube', label: 'YouTube', ph: '@kanal yoki havola' },
  { k: 'facebook', label: 'Facebook', ph: 'sahifa yoki havola' },
]
const STAT_FIELDS: { k: 'schools' | 'teachers' | 'pupils' | 'lessons'; label: string }[] = [
  { k: 'schools', label: 'Hamkor maktablar' },
  { k: 'teachers', label: "O'qituvchilar" },
  { k: 'pupils', label: "O'quvchilar" },
  { k: 'lessons', label: 'Dars ishlanmalari' },
]

function ContactsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['site', 'settings'],
    queryFn: async () => (await api.get<Settings>(`${ADMIN}/settings/`)).data,
  })
  if (isLoading || !data) return <Skeleton lines={5} />
  return <ContactsForm data={data} />
}

function formValues(data: Settings): Record<string, string> {
  const next: Record<string, string> = {}
  for (const f of TEXT_FIELDS) next[f.k] = String(data[f.k] ?? '')
  next.address = data.address
  next.video_url = data.video_url
  for (const s of STAT_FIELDS) next[`stat_${s.k}`] = data[`stat_${s.k}`] == null ? '' : String(data[`stat_${s.k}`])
  return next
}

function ContactsForm({ data }: { data: Settings }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [v, setV] = useState(() => formValues(data))
  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | number | null> = {}
      for (const [k, val] of Object.entries(v)) body[k] = k.startsWith('stat_') ? (val.trim() === '' ? null : Number(val)) : val.trim()
      return (await api.patch<Settings>(`${ADMIN}/settings/`, body)).data
    },
    onSuccess: (next) => {
      qc.setQueryData(['site', 'settings'], next)
      qc.invalidateQueries({ queryKey: ['public', 'landing'] })
      toast(t('Saqlandi'))
    },
    onError: (err) => toast(t(errText(err)), 'error'),
  })
  const set = (k: string) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return (
    <form onSubmit={onSubmit} className="sitep__form">
      <h4 className="sitep__h">{t('Kontaktlar')}</h4>
      <div className="row row--2">
        {TEXT_FIELDS.map((f) => (
          <label key={f.k} className="field">
            <span className="field__label">{t(f.label)}</span>
            <input className="input" type={f.type ?? 'text'} placeholder={f.ph} value={v[f.k] ?? ''} onChange={set(f.k)} />
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field__label">{t('Manzil')}</span>
        <input className="input" placeholder={t('Viloyat, tuman, ko‘cha')} value={v.address ?? ''} onChange={set('address')} />
      </label>
      <label className="field">
        <span className="field__label">{t('Video havolasi (YouTube)')}</span>
        <input className="input" type="url" placeholder="https://youtu.be/..." value={v.video_url ?? ''} onChange={set('video_url')} />
        <span className="field__hint">{t("«Bizning maqsadimiz» bo'limida «Video» tugmasi chiqadi. Video serverga yuklanmaydi — faqat havola.")}</span>
      </label>

      <h4 className="sitep__h">{t('Saytdagi raqamlar')}</h4>
      <p className="prose prose--note">{t("Bo'sh qoldirilsa, bazadagi haqiqiy son ko'rsatiladi. 0 bo'lgan raqam saytda chiqmaydi.")}</p>
      <div className="sitep__stats">
        {STAT_FIELDS.map((s) => (
          <label key={s.k} className="field">
            <span className="field__label">{t(s.label)}</span>
            <input className="input" type="number" min={0} inputMode="numeric" placeholder={`${data.live[s.k]} (${t('bazadan')})`} value={v[`stat_${s.k}`] ?? ''} onChange={set(`stat_${s.k}`)} />
          </label>
        ))}
      </div>
      <div className="panel__acts">
        <button className="btn btn--primary" type="submit" disabled={save.isPending}>{save.isPending ? t('Saqlanmoqda…') : t('Saqlash')}</button>
      </div>
    </form>
  )
}

function PhotosTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['site', 'photos'],
    queryFn: async () => (await api.get<Page<Photo>>(`${ADMIN}/photos/`)).data,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['site', 'photos'] })
    qc.invalidateQueries({ queryKey: ['public', 'landing'] })
  }
  const onPick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('image', await shrink(f, 1600))
        await api.post(`${ADMIN}/photos/`, fd)
      }
      toast(t("Rasm qo'shildi"))
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
      refresh()
    }
  }
  const saveCaption = async (p: Photo, caption: string) => {
    if (caption === p.caption) return
    try {
      await api.patch(`${ADMIN}/photos/${p.id}/`, { caption })
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const onRemove = async (p: Photo) => {
    if (!(await confirm({ title: t("Rasmni o'chirish"), text: p.caption || t('Rasm'), danger: true }))) return
    try {
      await api.delete(`${ADMIN}/photos/${p.id}/`)
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  return (
    <>
      <div className="panel__acts sitep__bar">
        <button className="btn btn--primary" disabled={busy} onClick={() => input.current?.click()}>
          {IC.upload} {busy ? t('Yuklanmoqda…') : t("Rasm qo'shish")}
        </button>
        <span className="muted">{t("JPG/PNG; telefon rasmi ham bo'ladi — yuklashdan oldin kichraytiriladi.")}</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onPick(e.target.files)} />
      </div>
      {isLoading || !data ? <Skeleton lines={3} /> : !data.results.length ? (
        <EmptyState title={t("Rasm yo'q")} hint={t("Darslardan lavhalar qo'shing — saytda «Darslarimizdan lavhalar» bo'limi chiqadi.")} />
      ) : (
        <div className="sitep__photos">
          {data.results.map((p) => (
            <figure key={p.id} className="sitep__photo">
              <img src={src(p.image)} alt="" loading="lazy" />
              <figcaption>
                <input className="input input--sm" placeholder={t('Izoh (ixtiyoriy)')} defaultValue={p.caption} maxLength={200}
                  onBlur={(e) => saveCaption(p, e.target.value.trim())} />
                <button className="btn btn--sm btn--ghost" aria-label={t("O'chirish")} title={t("O'chirish")} onClick={() => onRemove(p)}>{IC.trash}</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  )
}

function PeopleTab({ kind }: { kind: 'testimonials' | 'mentors' }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['site', kind],
    queryFn: async () => (await api.get<Page<Person>>(`${ADMIN}/${kind}/`)).data,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['site', kind] })
    qc.invalidateQueries({ queryKey: ['public', 'landing'] })
  }
  const onRemove = async (p: Person) => {
    if (!(await confirm({ title: t("O'chirish"), text: p.name, danger: true }))) return
    try {
      await api.delete(`${ADMIN}/${kind}/${p.id}/`)
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const togglePublished = async (p: Person) => {
    try {
      await api.patch(`${ADMIN}/${kind}/${p.id}/`, { published: !p.published })
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const isT = kind === 'testimonials'
  return (
    <>
      <div className="panel__acts sitep__bar">
        <button className="btn btn--primary" onClick={() => setEditing('new')}>+ {isT ? t("Fikr qo'shish") : t("Ustoz qo'shish")}</button>
      </div>
      {isLoading || !data ? <Skeleton lines={3} /> : !data.results.length ? (
        <EmptyState
          title={isT ? t("Fikr yo'q") : t("Ustoz yo'q")}
          hint={isT ? t("O'quvchi, ota-ona yoki o'qituvchi fikrini qo'shing — saytda «Ular biz haqimizda» bo'limi chiqadi.") : t("Darslarni olib boradigan ustozlarni qo'shing — saytda «Ustozlar» bo'limi chiqadi.")}
        />
      ) : (
        <div className="sitep__people">
          {data.results.map((p) => (
            <article key={p.id} className={`sitep__person ${p.published ? '' : 'is-off'}`}>
              {p.photo ? <img src={src(p.photo)} alt="" loading="lazy" /> : <span className="sitep__ava">{p.name.slice(0, 1).toUpperCase()}</span>}
              <div className="sitep__pbody">
                <b>{p.name}</b>
                <small className="muted">{isT ? p.subtitle : p.title}</small>
                {(isT ? p.text : p.bio) && <p>{isT ? p.text : p.bio}</p>}
              </div>
              <div className="sitep__pacts">
                <label className="sitep__pub" title={t("Saytda ko'rinadi")}>
                  <input type="checkbox" checked={p.published} onChange={() => togglePublished(p)} /> {t("Saytda")}
                </label>
                <button className="btn btn--sm" onClick={() => setEditing(p)}>{IC.edit} {t('Tahrirlash')}</button>
                <button className="btn btn--sm btn--ghost" aria-label={t("O'chirish")} title={t("O'chirish")} onClick={() => onRemove(p)}>{IC.trash}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <PersonModal kind={kind} person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  )
}

function PersonModal({ kind, person, onClose, onSaved }: {
  kind: 'testimonials' | 'mentors'
  person: Person | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const isT = kind === 'testimonials'
  const [name, setName] = useState(person?.name ?? '')
  const [role, setRole] = useState((isT ? person?.subtitle : person?.title) ?? '')
  const [text, setText] = useState((isT ? person?.text : person?.bio) ?? '')
  const [video, setVideo] = useState(person?.video_url ?? '')
  const [order, setOrder] = useState(String(person?.order ?? 0))
  const [published, setPublished] = useState(person?.published ?? true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(src(person?.photo ?? null))
  const [clear, setClear] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])

  const onPick = async (f: File | undefined) => {
    if (!f) return
    const small = await shrink(f, 640)
    setFile(small)
    setClear(false)
    setPreview(URL.createObjectURL(small))
  }

  const submit = async () => {
    if (name.trim().length < 2) return toast(t('Ismni kiriting.'), 'error')
    if (isT && !text.trim()) return toast(t('Fikr matnini yozing.'), 'error')
    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append(isT ? 'subtitle' : 'title', role.trim())
    fd.append(isT ? 'text' : 'bio', text.trim())
    if (isT) fd.append('video_url', video.trim())
    fd.append('order', String(Math.max(0, Number(order) || 0)))
    fd.append('published', published ? 'true' : 'false')
    if (file) fd.append('photo', file)
    else if (clear && person?.photo) fd.append('photo_clear', '1')
    setBusy(true)
    try {
      if (person) await api.patch(`${ADMIN}/${kind}/${person.id}/`, fd)
      else await api.post(`${ADMIN}/${kind}/`, fd)
      toast(t('Saqlandi'))
      onSaved()
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={person ? t('Tahrirlash') : isT ? t("Fikr qo'shish") : t("Ustoz qo'shish")}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={busy} onClick={submit}>{busy ? t('Saqlanmoqda…') : t('Saqlash')}</button>
      </>}
    >
      <div className="sitep__photoedit">
        {preview && !clear ? <img src={preview} alt="" /> : <span className="sitep__ava sitep__ava--lg">{(name || '?').slice(0, 1).toUpperCase()}</span>}
        <div>
          <label className="btn btn--sm">
            {IC.upload} {t('Rasm tanlash')}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
          {preview && !clear && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setFile(null); setClear(true) }}>{t('Rasmni olib tashlash')}</button>
          )}
          <p className="muted sitep__note">{t('Ixtiyoriy. Kvadrat rasm yaxshi chiqadi.')}</p>
        </div>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Ism familiya')}</span>
          <input className="input" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{isT ? t('Kim (sinf, maktab yoki lavozim)') : t('Lavozim, toifa')}</span>
          <input className="input" maxLength={200} placeholder={isT ? t("9-sinf o'quvchisi, 12-maktab") : t("Fizika o'qituvchisi, oliy toifa")} value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{isT ? t('Fikr matni') : t("Qisqacha ma'lumot")}</span>
        <textarea className="input" rows={4} maxLength={isT ? 1200 : 600} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {isT && (
        <label className="field">
          <span className="field__label">{t('Video havolasi')} <small className="muted">({t('ixtiyoriy')})</small></span>
          <input className="input" type="url" placeholder="https://youtu.be/..." value={video} onChange={(e) => setVideo(e.target.value)} />
        </label>
      )}
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Tartib raqami')}</span>
          <input className="input" type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
          <span className="field__hint">{t('Kichigi oldinda turadi.')}</span>
        </label>
        <label className="field sitep__pubfield">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>{t("Saytda ko'rsatish")}</span>
        </label>
      </div>
    </Modal>
  )
}
