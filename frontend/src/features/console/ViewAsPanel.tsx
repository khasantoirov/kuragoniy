import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/Skeleton'
import { useClassStudents, useTeacherClasses } from '@/features/learning/api'
import { subjectLabel } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { MAIN_ORIGIN, viewLink } from '@/lib/adminHost'
import { api } from '@/lib/api/client'
import { useUIStore } from '@/store/uiStore'

import './viewas.css'

/* admin.kuragoniy.uz → Ko'rinish (owner, 2026-11-27: "fan ustozlarida,
   adminda, dasturchida, o'quvchida oyna qanday ochilayotganini ko'rsam"):
   the developer opens kuragoniy.uz in a new tab exactly as a chosen person
   sees it — a teacher of the fan window picked on top, a pupil, the
   administration's roles — read-only (backend common/viewas.py; pupils
   learning view_as_pupil). The tab starts the view itself (lib/viewAs.ts
   takes the link's ?korinish=…). */

type Who = 'teacher' | 'student' | 'admin' | 'boshliq' | 'kuzatuvchi' | 'maktab' | 'dev'

const WHO: { k: Who; label: string; sub: string; icon: keyof typeof IC }[] = [
  { k: 'teacher', label: "O'qituvchi", sub: "Tanlangan o'qituvchi: darslari, jurnali, jadvali", icon: 'user' },
  { k: 'student', label: "O'quvchi", sub: "Sinf → o'quvchi: uning portali", icon: 'cap' },
  { k: 'admin', label: 'Admin', sub: "Admin kuragoniy.uz'da ko'radigan oyna", icon: 'shield' },
  { k: 'dev', label: 'Dasturchi', sub: "O'zingiz — dars beradigan oynangiz", icon: 'settings' },
  { k: 'boshliq', label: 'Rahbar', sub: 'Rahbar oynasi: nazorat va statistika', icon: 'chart' },
  { k: 'kuzatuvchi', label: 'Kuzatuvchi', sub: 'Inspektor yoki metodist', icon: 'eye' },
  { k: 'maktab', label: 'Direktor/zavuch', sub: "Hamkor maktab ma'muriyati", icon: 'school' },
]

interface Person {
  id: string
  name: string
  role: string
  subjects: string[]
  schools: string[]
}

function usePeople(role: 'teacher' | 'kuzatuvchi' | 'maktab' | null, fan: string) {
  return useQuery({
    queryKey: ['viewas-people', role, fan],
    enabled: !!role,
    queryFn: async () => (await api.get<Person[]>('/accounts/view-as/', { params: { role } })).data,
  })
}

function OpenButton({ href }: { href: string }) {
  const { t } = useTranslation()
  return (
    <a className="btn btn--sm btn--primary vwp__open" href={href} target="_blank" rel="noopener">
      {t('Ochish')} {IC.external}
    </a>
  )
}

function PeopleList({ role }: { role: 'teacher' | 'kuzatuvchi' | 'maktab' }) {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const lang = useUIStore((s) => s.lang)
  const { data, isLoading } = usePeople(role, fan)
  const [q, setQ] = useState('')
  if (isLoading) return <Skeleton lines={4} />
  const needle = q.trim().toLowerCase()
  const rows = (data ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle))
  return (
    <>
      <input className="input vwp__search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t('Ism bo\'yicha qidirish')} aria-label={t('Qidirish')} />
      {rows.length ? (
        <ul className="vwp__list">
          {rows.map((p) => (
            <li key={p.id} className="vwp__row">
              <span className="vwp__who">
                <b>{p.name}</b>
                <small>
                  {role === 'maktab' ? p.schools.join(', ') || '—'
                    : p.subjects.length ? p.subjects.map((s) => subjectLabel(s as 'fizika' | 'steam', lang)).join(', ') : t('Fan belgilanmagan')}
                </small>
              </span>
              <OpenButton href={viewLink({ korinish: p.id, fan })} />
            </li>
          ))}
        </ul>
      ) : <p className="prose prose--note">{q ? t('Hech kim topilmadi.') : t("Bu rolda hali hech kim yo'q.")}</p>}
    </>
  )
}

function PupilPicker() {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const { data: classes, isLoading } = useTeacherClasses()
  const [classId, setClassId] = useState<number | null>(null)
  const { data: roster, isFetching } = useClassStudents(classId)
  const pupils = (roster?.accounts ?? []).filter((a) => a.approved && a.is_active)
  if (isLoading) return <Skeleton lines={3} />
  return (
    <>
      <label className="field">
        <span className="field__label">{t('Sinf')}</span>
        <select className="input" value={classId ?? ''} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t('Sinfni tanlang')}</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.school || c.teacher_name}</option>)}
        </select>
      </label>
      {classId != null && (isFetching && !roster ? <Skeleton lines={3} /> : pupils.length ? (
        <ul className="vwp__list">
          {pupils.map((p) => (
            <li key={p.id} className="vwp__row">
              <span className="vwp__who"><b>{p.name}</b><small className="mono">{p.username}</small></span>
              <OpenButton href={viewLink({ oquvchi: p.id, fan })} />
            </li>
          ))}
        </ul>
      ) : <p className="prose prose--note">{t("Bu sinfda hali platforma hisobi bor o'quvchi yo'q.")}</p>)}
    </>
  )
}

export function ViewAsPanel() {
  const { t } = useTranslation()
  const fan = useUIStore((s) => s.subject)
  const lang = useUIStore((s) => s.lang)
  const [who, setWho] = useState<Who>('teacher')
  const picked = WHO.find((w) => w.k === who)!

  return (
    <div className="vwp">
      <p className="prose prose--note">
        {t("Platformani boshqalar ko'zi bilan ko'ring: tanlangan odamning oynasi kuragoniy.uz'da yangi varaqda, xuddi u ko'rgandek ochiladi. Faqat ko'rish — hech narsa o'zgartirilmaydi; tepadagi bandda «Chiqish» bor. kuragoniy.uz'ga shu akkaunt bilan kirgan bo'lishingiz kerak (kirmagan bo'lsangiz, avval kirish so'raladi).")}
      </p>

      <div className="vwp__roles" role="tablist" aria-label={t('Kim sifatida')}>
        {WHO.map((w) => (
          <button key={w.k} type="button" role="tab" aria-selected={who === w.k}
            className={`vwp__role ${who === w.k ? 'is-on' : ''}`} onClick={() => setWho(w.k)}>
            <span className="vwp__ic" aria-hidden="true">{IC[w.icon]}</span>
            <span className="vwp__rt"><b>{t(w.label)}</b><small>{t(w.sub)}</small></span>
          </button>
        ))}
      </div>

      <section className="panel vwp__pick">
        <h3 className="panel__title">
          {t(picked.label)}
          {(who === 'teacher' || who === 'student') && <span className="vwp__fan">{subjectLabel(fan, lang)}</span>}
        </h3>
        {who === 'teacher' && <PeopleList role="teacher" />}
        {who === 'kuzatuvchi' && <PeopleList role="kuzatuvchi" />}
        {who === 'maktab' && <PeopleList role="maktab" />}
        {who === 'student' && <PupilPicker />}
        {who === 'admin' && (
          <div className="vwp__one">
            <p className="prose">{t("Admin kuragoniy.uz'da faqat o'qituvchi sahifalarini ko'radi (boshqaruv shu panelda). Oyna o'z hisobingizda, Admin roli bilan ochiladi.")}</p>
            <OpenButton href={viewLink({ korinish: 'role:admin', fan })} />
          </div>
        )}
        {who === 'boshliq' && (
          <div className="vwp__one">
            <p className="prose">{t("Rahbar kuragoniy.uz'da darslar va natijalarni nazorat qiladi. Oyna o'z hisobingizda, Rahbar roli bilan ochiladi.")}</p>
            <OpenButton href={viewLink({ korinish: 'role:boshliq', fan })} />
          </div>
        )}
        {who === 'dev' && (
          <div className="vwp__one">
            <p className="prose">{t("Sizning o'z oynangiz — kuragoniy.uz'da dars beradigan sahifalar.")}</p>
            <OpenButton href={`${MAIN_ORIGIN}/`} />
          </div>
        )}
      </section>
    </div>
  )
}
