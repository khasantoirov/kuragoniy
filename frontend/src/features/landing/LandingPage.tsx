import { isAxiosError } from 'axios'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { fullPhone, PhoneField } from '@/features/auth/phone'
import { errText } from '@/features/portal/ui'
import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { api } from '@/lib/api/client'
import { HoneypotField, useFormGuard } from '@/lib/formGuard'
import { socialUrl, telegramUrl, useLanding, type LandingData } from '@/lib/publicSite'
import { LangMenu } from '@/layouts/AuthLayout'
import { useUIStore } from '@/store/uiStore'

import './i18n'
import './landing.css'

/* kuragoniy.uz for a guest: what Ko'ragoniy Education and Muhandis D do,
   live figures from the database, and — once the administration fills
   them in (Boshqaruv → Sayt) — photos, testimonials, mentors and contacts.
   A section with nothing in it is not shown. "Kirish" opens the sign-in. */


function embedUrl(u: string): string | null {
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^(www|m)\./, '')
    let id = ''
    if (host === 'youtu.be') id = url.pathname.slice(1)
    else if (host.endsWith('youtube.com')) id = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] || ''
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`
    const vimeo = host === 'vimeo.com' ? url.pathname.match(/\/(\d+)/)?.[1] : null
    if (vimeo) return `https://player.vimeo.com/video/${vimeo}?autoplay=1`
  } catch {
    // not a URL
  }
  return null
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Anchor({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a href={`#${to}`} className={className} onClick={(e) => { e.preventDefault(); scrollTo(to) }}>
      {children}
    </a>
  )
}

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="lp-video" role="dialog" aria-modal="true" aria-label={t('Video')} onClick={onClose}>
      <div className="lp-video__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lp-video__x" aria-label={t('Yopish')} onClick={onClose}>{IC.close}</button>
        <iframe src={url} title={t('Video')} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
    </div>
  )
}

function Header({ sections, scroller }: { sections: { id: string; label: string }[]; scroller: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useUIStore()
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => setSolid(el.scrollTop > 24)
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [scroller])
  return (
    <header className={`lp-head ${solid ? 'is-solid' : ''}`}>
      <div className="lp-wrap lp-head__in">
        <Link to="/" className="lp-brand" onClick={(e) => { e.preventDefault(); scroller.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <img src="/logo.png" alt="" width={38} height={38} />
          <span>KO'RAGONIY EDU</span>
        </Link>
        <nav className="lp-nav" aria-label={t("Bo'limlar")}>
          {sections.map((s) => <Anchor key={s.id} to={s.id}>{s.label}</Anchor>)}
        </nav>
        <div className="lp-head__tools">
          <LangMenu />
          <button type="button" className="gx-tool gx-tool--sq" title={t('Rejim')} aria-label={t('Rejim')} onClick={toggleTheme}>
            {theme === 'dark' ? themeIconMoon() : themeIconSun()}
          </button>
          <Link to="/login" className="lp-btn lp-btn--white lp-head__go">{t('Kirish')}</Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const { t } = useTranslation()
  return (
    <section className="lp-hero">
      <div className="lp-hero__bg" aria-hidden="true"><span /><span /><span /></div>
      <div className="lp-wrap lp-hero__in">
        <div className="lp-hero__text">
          <span className="lp-kicker">Ko'ragoniy Education × Muhandis D</span>
          <h1 className="lp-hero__title">{t('Kelajak muhandislari maktab partasidan boshlanadi')}</h1>
          <p className="lp-hero__lead">
            {t("Fizika (nazariy va amaliy), STEAM va robototexnika darslari — O'zbekiston maktablarida o'qituvchi va o'quvchi uchun yagona ta'lim tizimi.")}
          </p>
          <div className="lp-hero__cta">
            <Link to="/login" className="lp-btn lp-btn--white lp-btn--lg">{t('Platformaga kirish')} <span className="lp-arrow">{IC.back}</span></Link>
            <Anchor to="boglanish" className="lp-btn lp-btn--glass lp-btn--lg">{t('Maktabingizni ulang')}</Anchor>
          </div>
          <ul className="lp-hero__tags">
            <li>{IC.atom} {t('Fizika: nazariya va tajriba')}</li>
            <li>{IC.gear} {t('Robototexnika')}</li>
            <li>{IC.flask} {t('STEAM loyihalar')}</li>
          </ul>
        </div>
        <div className="lp-orbit" aria-hidden="true">
          <span className="lp-orbit__ring lp-orbit__ring--1" />
          <span className="lp-orbit__ring lp-orbit__ring--2" />
          <span className="lp-orbit__core"><img src="/logo.png" alt="" width={120} height={120} /></span>
          <span className="lp-orbit__node lp-orbit__node--a">{IC.atom}</span>
          <span className="lp-orbit__node lp-orbit__node--b">{IC.gear}</span>
          <span className="lp-orbit__node lp-orbit__node--c">{IC.flask}</span>
          <span className="lp-orbit__node lp-orbit__node--d">{IC.cap}</span>
          <span className="lp-orbit__f lp-orbit__f--1">F = m·a</span>
          <span className="lp-orbit__f lp-orbit__f--2">U = I·R</span>
          <span className="lp-orbit__f lp-orbit__f--3">v = s / t</span>
          <img className="lp-orbit__sign" src="/muhandis-d-on-dark.png" alt="" width={751} height={160} />
        </div>
      </div>
    </section>
  )
}

function SectionHead({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <div className="lp-shead">
      <span className="lp-shead__k">{kicker}</span>
      <h2 className="lp-shead__t">{title}</h2>
      {lead && <p className="lp-shead__l">{lead}</p>}
    </div>
  )
}

function Subjects() {
  const { t } = useTranslation()
  const cards = [
    {
      key: 'fizika', icon: IC.atom, tag: t('Nazariy + amaliy'), title: t('Amaliy fizika'),
      text: t("Qonunni kitobdan yodlamay, o'z qo'li bilan o'lchab topadi: har bir mavzuda nazariya, tajriba va masala bir darsda."),
      points: [
        t('Darslikka mos tayyor dars ishlanmalari'),
        t("Bosqichma-bosqich laboratoriya tajribalari"),
        t('Masalalar, testlar va uy vazifalari'),
        t("Elektron jurnal va o'zlashtirish tahlili"),
      ],
    },
    {
      key: 'steam', icon: IC.gear, tag: t('1–9-sinflar'), title: t('STEAM / Robototexnika'),
      text: t("Fan, texnologiya, muhandislik, san'at va matematika — loyiha orqali: kichik sinflarda konstruktor, kattalarida dasturlash va robot."),
      points: [
        t("STEM chamadonlar bilan amaliy mashg'ulotlar"),
        t("Robot yig'ish va dasturlash"),
        t('Jamoaviy muhandislik loyihalari'),
        t('Tanlov va musobaqalarga tayyorgarlik'),
      ],
    },
  ]
  return (
    <section id="yonalishlar" className="lp-sec">
      <div className="lp-wrap">
        <SectionHead
          kicker={t("Yo'nalishlar")}
          title={t("Ikki yo'nalish — bitta maqsad")}
          lead={t("Har bir o'qituvchi va o'quvchi ma'muriyat tomonidan o'ziga mos fanga yo'naltiriladi; dars, material va natijalar shu fan bo'yicha ko'rinadi.")}
        />
        <div className="lp-subjects">
          {cards.map((c) => (
            <article key={c.key} className={`lp-subject lp-subject--${c.key}`}>
              <div className="lp-subject__top">
                <span className="lp-subject__ic">{c.icon}</span>
                <span className="lp-subject__tag">{c.tag}</span>
              </div>
              <h3 className="lp-subject__t">{c.title}</h3>
              <p className="lp-subject__p">{c.text}</p>
              <ul className="lp-ticks">
                {c.points.map((p) => <li key={p}>{IC.check2} {p}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    { t: t("Maktab hamkor bo'ladi"), p: t("Kelishuvdan so'ng maktabning sinflari, dars jadvali va o'qituvchilari platformaga kiritiladi.") },
    { t: t('O\'qituvchi tayyor dars bilan keladi'), p: t("Dars ishlanmasi, tajriba yo'riqnomasi, taqdimot va materiallar bitta joyda — darsga tayyorgarlik daqiqalarda.") },
    { t: t("O'quvchi amalda o'rganadi"), p: t("Tajriba, loyiha, test va o'yinlar; har bir yutuq ball va reytingda ko'rinadi.") },
    { t: t("Natija ko'rinib turadi"), p: t("Elektron jurnal, chorak baholari, o'zlashtirish va sifat ko'rsatkichlari — o'qituvchi va ma'muriyat uchun.") },
  ]
  const roles = [
    { icon: IC.cap, title: t("O'qituvchi uchun"), items: [t('Dars jadvali va elektron jurnal'), t('Tayyor dars ishlanmalari va tajribalar'), t("Kutubxona va o'quv materiallari"), t('Malaka oshirish kurslari')] },
    { icon: IC.user, title: t("O'quvchi uchun"), items: [t('Shaxsiy kabinet va vazifalar'), t("Interaktiv o'yinlar va testlar"), t('Yutuqlar, ballar va reyting')] },
    { icon: IC.school, title: t("Ma'muriyat uchun"), items: [t("Maktablar, sinflar va o'qituvchilar nazorati"), t("O'zlashtirish va sifat statistikasi"), t('Dars hisobotlari va baholash')] },
  ]
  return (
    <section id="platforma" className="lp-sec lp-sec--tint">
      <div className="lp-wrap">
        <SectionHead
          kicker={t('Qanday ishlaydi')}
          title={t("Maktabdan natijagacha — to'rt qadam")}
        />
        <ol className="lp-steps">
          {steps.map((s, i) => (
            <li key={s.t} className="lp-step">
              <span className="lp-step__n">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="lp-step__t">{s.t}</h3>
              <p className="lp-step__p">{s.p}</p>
            </li>
          ))}
        </ol>
        <div className="lp-roles">
          {roles.map((r) => (
            <article key={r.title} className="lp-role">
              <span className="lp-role__ic">{r.icon}</span>
              <h3 className="lp-role__t">{r.title}</h3>
              <ul className="lp-ticks lp-ticks--sm">
                {r.items.map((x) => <li key={x}>{IC.check2} {x}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Mission({ videoUrl, onVideo }: { videoUrl: string; onVideo: (url: string) => void }) {
  const { t } = useTranslation()
  const embed = videoUrl ? embedUrl(videoUrl) : null
  return (
    <section className="lp-mission">
      <div className="lp-wrap lp-mission__in">
        <div>
          <span className="lp-kicker lp-kicker--dark">{t('Bizning maqsadimiz')}</span>
          <h2 className="lp-mission__t">{t("O'zbekistonda kuchli muhandislar avlodini tarbiyalash")}</h2>
          <p className="lp-mission__p">
            {t("Yoshlar muhandislikni maktabdan o'rgansa, ertaga yurtimiz texnologiya va ishlab chiqarishda dunyoning yetakchilari qatoridan joy oladi. Shuning uchun har bir darsni tajriba, loyiha va ixtiro sari qadamga aylantiramiz.")}
          </p>
        </div>
        {videoUrl && (
          embed ? (
            <button type="button" className="lp-play" onClick={() => onVideo(embed)}>
              <span className="lp-play__ic">{IC.play}</span>
              <span>{t("Video: biz qanday dars o'tamiz")}</span>
            </button>
          ) : (
            <a className="lp-play" href={videoUrl} target="_blank" rel="noreferrer">
              <span className="lp-play__ic">{IC.play}</span>
              <span>{t("Video: biz qanday dars o'tamiz")}</span>
            </a>
          )
        )}
      </div>
    </section>
  )
}

function Gallery({ photos }: { photos: LandingData['photos'] }) {
  const { t } = useTranslation()
  const shown = photos.filter((p) => p.image)
  if (!shown.length) return null
  return (
    <section id="lavhalar" className="lp-sec">
      <div className="lp-wrap">
        <SectionHead kicker={t('Lavhalar')} title={t('Darslarimizdan lavhalar')} />
        <div className="lp-gallery">
          {shown.map((p) => (
            <figure key={p.id} className="lp-gallery__i">
              <img src={p.image!} alt={p.caption || ''} loading="lazy" />
              {p.caption && <figcaption>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonials({ items, onVideo }: { items: LandingData['testimonials']; onVideo: (url: string) => void }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return (
    <section id="fikrlar" className="lp-sec lp-sec--tint">
      <div className="lp-wrap">
        <SectionHead kicker={t('Fikrlar')} title={t('Ular biz haqimizda')} />
        <div className="lp-quotes">
          {items.map((q) => {
            const embed = q.video_url ? embedUrl(q.video_url) : null
            return (
              <figure key={q.id} className="lp-quote">
                <blockquote>{q.text}</blockquote>
                <figcaption>
                  {q.photo ? <img src={q.photo} alt="" loading="lazy" /> : <span className="lp-ava">{initials(q.name)}</span>}
                  <span>
                    <b>{q.name}</b>
                    {q.subtitle && <small>{q.subtitle}</small>}
                  </span>
                </figcaption>
                {q.video_url && (embed
                  ? <button type="button" className="lp-quote__v" onClick={() => onVideo(embed)}>{IC.play} {t("Videoni ko'rish")}</button>
                  : <a className="lp-quote__v" href={q.video_url} target="_blank" rel="noreferrer">{IC.play} {t("Videoni ko'rish")}</a>)}
              </figure>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Mentors({ items }: { items: LandingData['mentors'] }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return (
    <section id="ustozlar" className="lp-sec">
      <div className="lp-wrap">
        <SectionHead kicker={t('Ustozlar')} title={t('Darslarni kimlar olib boradi')} />
        <div className="lp-mentors">
          {items.map((m) => (
            <article key={m.id} className="lp-mentor">
              <div className="lp-mentor__ph">
                {m.photo ? <img src={m.photo} alt="" loading="lazy" /> : <span className="lp-ava lp-ava--lg">{initials(m.name)}</span>}
              </div>
              <h3 className="lp-mentor__n">{m.name}</h3>
              {m.title && <p className="lp-mentor__r">{m.title}</p>}
              {m.bio && <p className="lp-mentor__b">{m.bio}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Partners({ names }: { names: string[] }) {
  const { t } = useTranslation()
  if (!names.length) return null
  // The strip is one run long enough to fill the screen, then that run
  // again — sliding by half loops without a seam. Screen readers get the
  // list once; with reduced motion only the names themselves stay.
  const run: string[] = []
  while (run.length < 8) run.push(...names)
  const loop = [...run, ...run]
  return (
    <section id="hamkorlar" className="lp-sec lp-sec--tight">
      <div className="lp-wrap">
        <SectionHead kicker={t('Hamkorlar')} title={t('Hamkor maktablarimiz')} />
      </div>
      <ul className="lp-sr">{names.map((n) => <li key={n}>{n}</li>)}</ul>
      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee__track" style={{ ['--dur' as string]: `${Math.max(24, run.length * 4)}s` }}>
          {loop.map((n, i) => <span key={i} className="lp-marquee__i" data-dup={i >= names.length ? '' : undefined}>{IC.school} {n}</span>)}
        </div>
      </div>
    </section>
  )
}

function LeadForm() {
  const { t } = useTranslation()
  const guard = useFormGuard('lead')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tg, setTg] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [note, setNote] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (phone.length !== 9) return setNote(t("Telefon raqamni to'liq kiriting: +998 90 123 45 67."))
    setBusy(true)
    setNote('')
    try {
      await api.post('/public/leads/', {
        ...(await guard.fields()), name, phone: fullPhone(phone), telegram: tg, message: msg,
      })
      setDone(true)
    } catch (err) {
      setNote(t(isAxiosError(err) && err.response?.status === 429 ? "Juda ko'p urinish. Biroz kutib qayta urining" : errText(err)))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="lp-lead__done" role="status">
        <span className="lp-lead__ok">{IC.check2}</span>
        <h3>{t('Rahmat! So\'rovingiz qabul qilindi')}</h3>
        <p>{t("Jamoamiz tez orada siz bilan bog'lanadi.")}</p>
      </div>
    )
  }

  return (
    <form className="lp-lead__form" onSubmit={submit}>
      <label className="field">
        <span className="field__label">{t('Ismingiz')}</span>
        <input className="input" required minLength={2} autoComplete="name" placeholder={t('Ism familiya')} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <PhoneField value={phone} onChange={setPhone} />
      <label className="field">
        <span className="field__label">{t('Telegram')} <small className="muted">({t('ixtiyoriy')})</small></span>
        <span className="ifield ifield--phone">
          <span className="ifield__pre" aria-hidden="true">@</span>
          <input className="input input--at" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="username" value={tg} onChange={(e) => setTg(e.target.value.replace(/^@+/, ''))} />
        </span>
      </label>
      <label className="field">
        <span className="field__label">{t('Xabar')} <small className="muted">({t('ixtiyoriy')})</small></span>
        <textarea className="input lp-lead__msg" rows={3} maxLength={500} placeholder={t("Maktab nomi, hudud yoki savolingiz")} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </label>
      <button className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block" type="submit" disabled={busy}>
        {busy ? t('Yuborilmoqda…') : t('Yuborish')}
      </button>
      {note && <p className="form__note form__note--err" role="alert">{note}</p>}
      <HoneypotField guard={guard} />
    </form>
  )
}

function contactRows(c: LandingData['contacts'] | undefined) {
  if (!c) return []
  return [
    c.phone && { ic: IC.smartphone, label: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, '')}` },
    c.telegram && { ic: IC.telegram, label: c.telegram.startsWith('http') ? 'Telegram' : `@${c.telegram.replace(/^@/, '')}`, href: telegramUrl(c.telegram) },
    c.email && { ic: IC.mail, label: c.email, href: `mailto:${c.email}` },
    c.address && { ic: IC.home, label: c.address, href: '' },
  ].filter(Boolean) as { ic: ReactNode; label: string; href: string }[]
}

function Contact({ contacts }: { contacts: LandingData['contacts'] | undefined }) {
  const { t } = useTranslation()
  const rows = contactRows(contacts)
  return (
    <section id="boglanish" className="lp-sec lp-sec--tint">
      <div className="lp-wrap lp-lead">
        <div className="lp-lead__text">
          <span className="lp-shead__k">{t("Bog'lanish")}</span>
          <h2 className="lp-shead__t">{t('Maktabingizda darslarni boshlaymizmi?')}</h2>
          <p className="lp-shead__l">
            {t("Ma'lumot qoldiring — jamoamiz siz bilan bog'lanib, hamkorlik shartlari, jihozlar va o'qituvchilar tayyorgarligi haqida batafsil gaplashadi.")}
          </p>
          {rows.length > 0 && (
            <ul className="lp-contacts">
              {rows.map((r) => (
                <li key={r.label}>
                  <span className="lp-contacts__ic">{r.ic}</span>
                  {r.href ? <a href={r.href} target={r.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{r.label}</a> : <span>{r.label}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lp-lead__card">
          <LeadForm />
        </div>
      </div>
    </section>
  )
}

function Footer({ data, sections }: { data: LandingData | undefined; sections: { id: string; label: string }[] }) {
  const { t } = useTranslation()
  const c = data?.contacts
  const socials = c ? [
    { ic: IC.telegram, label: 'Telegram', url: telegramUrl(c.telegram) },
    { ic: IC.instagram, label: 'Instagram', url: socialUrl(c.instagram, 'https://instagram.com/') },
    { ic: IC.youtube, label: 'YouTube', url: socialUrl(c.youtube, 'https://youtube.com/@') },
    { ic: IC.globe, label: 'Facebook', url: socialUrl(c.facebook, 'https://facebook.com/') },
  ].filter((s) => s.url) : []
  const rows = contactRows(c)
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot__grid">
        <div className="lp-foot__brand">
          <span className="lp-brand lp-brand--foot"><img src="/logo.png" alt="" width={38} height={38} /><span>KO'RAGONIY EDU</span></span>
          <p>{t("Ko'ragoniy Education va Muhandis D loyihalari: fizika, STEAM va robototexnika orqali muhandislikka ilk qadam.")}</p>
          {socials.length > 0 && (
            <nav className="lp-foot__social" aria-label={t('Ijtimoiy tarmoqlar')}>
              {socials.map((s) => <a key={s.label} href={s.url} target="_blank" rel="noreferrer" aria-label={s.label} title={s.label}>{s.ic}</a>)}
            </nav>
          )}
        </div>
        <div>
          <h3 className="lp-foot__h">{t('Platforma')}</h3>
          <ul className="lp-foot__links">
            <li><Link to="/login">{t('Kirish')}</Link></li>
            <li><Link to="/register">{t("O'qituvchi sifatida ro'yxatdan o'tish")}</Link></li>
            <li><Link to="/join">{t("O'quvchilar: sinf kodi bilan qo'shilish")}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="lp-foot__h">{t("Bo'limlar")}</h3>
          <ul className="lp-foot__links">
            {sections.map((s) => <li key={s.id}><Anchor to={s.id}>{s.label}</Anchor></li>)}
          </ul>
        </div>
        {rows.length > 0 && (
          <div>
            <h3 className="lp-foot__h">{t('Aloqa')}</h3>
            <ul className="lp-foot__links">
              {rows.map((r) => <li key={r.label}>{r.href ? <a href={r.href} target={r.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{r.label}</a> : r.label}</li>)}
            </ul>
          </div>
        )}
      </div>
      <div className="lp-wrap lp-foot__base">
        © {new Date().getFullYear()} KO'RAGONIY EDU · Muhandis D · {t('Barcha huquqlar himoyalangan')}
      </div>
    </footer>
  )
}

export function LandingPage() {
  const { t } = useTranslation()
  const { data } = useLanding()
  const [video, setVideo] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.title
    document.title = "KO'RAGONIY EDU — fizika, STEAM va robototexnika"
    return () => { document.title = prev }
  }, [])

  const sections = [
    { id: 'yonalishlar', label: t("Yo'nalishlar") },
    { id: 'platforma', label: t('Qanday ishlaydi') },
    ...(data?.mentors.length ? [{ id: 'ustozlar', label: t('Ustozlar') }] : []),
    ...(data?.partners.length ? [{ id: 'hamkorlar', label: t('Hamkorlar') }] : []),
    { id: 'boglanish', label: t("Bog'lanish") },
  ]

  return (
    <div className="lp" ref={scroller}>
      <Header sections={sections} scroller={scroller} />
      <main>
        <Hero />
        <Subjects />
        <HowItWorks />
        <Mission videoUrl={data?.contacts.video_url ?? ''} onVideo={setVideo} />
        <Gallery photos={data?.photos ?? []} />
        <Testimonials items={data?.testimonials ?? []} onVideo={setVideo} />
        <Mentors items={data?.mentors ?? []} />
        <Partners names={data?.partners ?? []} />
        <Contact contacts={data?.contacts} />
      </main>
      <Footer data={data} sections={sections} />
      {video && <VideoModal url={video} onClose={() => setVideo(null)} />}
    </div>
  )
}
