import { isAxiosError } from 'axios'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { mediaSrc, shrinkImage } from '@/features/library/cover'
import { PageHead } from '@/features/portal/ui'
import { GuideLink } from '@/features/guide/GuideLink'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

import { useEquipmentImage, useRegistry, useUpdateItem, useUpsertEquipment } from './api'
import {
  analyse, firstUse, fmtSum, GRADES, gradeSummary, isFirstUse, kindOf, KINDS, lessonCost, otherTopics, priceOf, rowCost,
  topicLabel, type Analysis, type Kind, type RegExperiment, type RegItem, type RegLesson, type Registry,
} from './registry'
import './equipment.css'

type Tab = 'umumiy' | `${(typeof GRADES)[number]}`
type Row = { lesson: RegLesson; experiment?: RegExperiment; expNo?: number; item?: RegItem }

const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

function useErrorToast() {
  const toast = useToast()
  const { t } = useTranslation()
  return (err: unknown) => {
    const data = isAxiosError<Record<string, unknown>>(err) ? err.response?.data : undefined
    const first = data ? Object.values(data)[0] : undefined
    toast(t(String(Array.isArray(first) ? first[0] : first ?? 'Saqlashda xatolik')), 'error')
  }
}

/** Photo of the equipment (catalogue): pick to upload, × to remove. */
function PhotoCell({ item, reg, canEdit }: { item: RegItem; reg: Registry; canEdit: boolean }) {
  const { t } = useTranslation()
  const upsert = useUpsertEquipment()
  const image = useEquipmentImage()
  const onError = useErrorToast()
  const src = mediaSrc(reg.catalog[item.key]?.image)
  const busy = upsert.isPending || image.isPending

  const pick = async (f: File) => {
    try {
      const entry = reg.catalog[item.key] ?? (await upsert.mutateAsync({ name: item.name }))
      await image.mutateAsync({ id: entry.id, file: await shrinkImage(f) })
    } catch (e) {
      onError(e)
    }
  }
  return (
    <div className={`eqphoto ${busy ? 'is-busy' : ''}`}>
      {src ? <img src={src} alt={item.name} loading="lazy" /> : <span className="eqphoto__none">{IC.image}</span>}
      {canEdit && (
        <>
          <label className="eqphoto__pick" title={t('Rasm yuklash')}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void pick(f)
              }}
            />
          </label>
          {src && (
            <button
              type="button"
              className="eqphoto__del"
              aria-label={t("Rasmni o'chirish")}
              disabled={busy}
              onClick={() => image.mutateAsync({ id: reg.catalog[item.key].id, file: null }).catch(onError)}
            >
              ×
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** One equipment row's cells (from "Rasmlari" to "Yana qaysi mavzuga"). */
function ItemCells({ item, lesson, reg, an, canEdit, goTo }: {
  item: RegItem
  lesson: RegLesson
  reg: Registry
  an: Analysis
  canEdit: boolean
  goTo: (lessonId: number) => void
}) {
  const { t } = useTranslation()
  const upsert = useUpsertEquipment()
  const update = useUpdateItem()
  const onError = useErrorToast()
  const kind = kindOf(reg, item.key)
  const price = priceOf(reg, item.key)
  const cat = reg.catalog[item.key]
  const first = isFirstUse(an, item)
  const origin = firstUse(an, item.key)
  const others = otherTopics(an, item, lesson)
  const save = (body: { kind?: Kind; build_materials?: string; price?: number | null }) =>
    upsert.mutateAsync({ name: item.name, ...body }).catch(onError)

  return (
    <>
      <td className="eqt__photo"><PhotoCell item={item} reg={reg} canEdit={canEdit} /></td>
      <td className={`eqt__name eqk--${kind}`}>
        {canEdit ? (
          <input
            key={item.name}
            className="eqin"
            onKeyDown={enterBlurs}
            defaultValue={item.name}
            aria-label={t('Jihoz nomi')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== item.name) update.mutateAsync({ id: item.id, name: v }).catch(onError)
              else e.target.value = item.name
            }}
          />
        ) : item.name}
      </td>
      <td className={`eqt__kind eqk--${kind}`}>
        {canEdit ? (
          <select className="eqin eqin--kind" value={kind} aria-label={t('Jihoz turi')} onChange={(e) => save({ kind: e.target.value as Kind })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
          </select>
        ) : t(KINDS.find((k) => k.id === kind)!.label)}
      </td>
      <td className="eqt__build">
        {canEdit ? (
          <textarea
            key={cat?.build_materials ?? ''}
            className="eqin eqin--area"
            rows={2}
            defaultValue={cat?.build_materials ?? ''}
            placeholder="—"
            aria-label={t('Yasash uchun kerakli jihozlar')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (cat?.build_materials ?? '')) void save({ build_materials: v })
            }}
          />
        ) : cat?.build_materials || '—'}
      </td>
      <td className="eqt__qty">
        {canEdit ? (
          <input
            key={item.quantity}
            className="eqin eqin--num"
            onKeyDown={enterBlurs}
            type="number"
            min={1}
            defaultValue={item.quantity}
            aria-label={t('Miqdori')}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value))
              if (v >= 1 && v !== item.quantity) update.mutateAsync({ id: item.id, quantity: v }).catch(onError)
              else e.target.value = String(item.quantity)
            }}
          />
        ) : item.quantity}
      </td>
      <td className="eqt__price">
        {canEdit ? (
          <input
            key={String(price)}
            className="eqin eqin--num"
            onKeyDown={enterBlurs}
            type="number"
            min={0}
            step={1000}
            defaultValue={price ?? ''}
            placeholder={t("so'm")}
            aria-label={t('Narxi (1 dona)')}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              const v = raw === '' ? null : Math.round(Number(raw))
              if (v !== null && (Number.isNaN(v) || v < 0)) {
                e.target.value = price === null ? '' : String(price)
                return
              }
              if (v !== price) void save({ price: v })
            }}
          />
        ) : price === null ? '—' : fmtSum(price)}
      </td>
      <td className="eqt__sum">
        {first ? (
          price === null ? <span className="eqmuted">{t("narx yo'q")}</span> : <b>{fmtSum(rowCost(reg, an, item))}</b>
        ) : origin ? (
          <button type="button" className="eqlink eqlink--up" onClick={() => goTo(origin.lesson.id)} title={t("Birinchi marta shu yerda ishlatilgan va hisoblangan")}>
            ↑ {origin.lesson.grade}-sinf, {origin.lesson.hafta}-hafta
          </button>
        ) : null}
      </td>
      <td className="eqt__refs">
        {others.map((l) => (
          <button key={l.id} type="button" className="eqlink" onClick={() => goTo(l.id)}>→ {topicLabel(l)}</button>
        ))}
      </td>
    </>
  )
}

function GradeTable({ grade, reg, an, q, onlyUnpriced, canEdit, goTo }: {
  grade: number
  reg: Registry
  an: Analysis
  q: string
  onlyUnpriced: boolean
  canEdit: boolean
  goTo: (lessonId: number) => void
}) {
  const { t } = useTranslation()
  const term = q.trim().toLowerCase()
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const lesson of reg.lessons.filter((l) => l.grade === grade)) {
      const topicHit = !term || lesson.title.toLowerCase().includes(term)
      const push = (r: Row) => {
        const hit = topicHit
          || (r.experiment && r.experiment.name.toLowerCase().includes(term))
          || (r.item && r.item.name.toLowerCase().includes(term))
        const unpricedOk = !onlyUnpriced || (r.item && isFirstUse(an, r.item) && priceOf(reg, r.item.key) === null)
        if (hit && unpricedOk) out.push(r)
      }
      if (!lesson.experiments.length) push({ lesson })
      lesson.experiments.forEach((experiment, i) => {
        if (!experiment.items.length) push({ lesson, experiment, expNo: i + 1 })
        for (const item of experiment.items) push({ lesson, experiment, expNo: i + 1, item })
      })
    }
    return out
  }, [reg, an, grade, term, onlyUnpriced])

  if (!rows.length) return <p className="prose">{t('Hech narsa topilmadi')}.</p>

  // row spans over the (possibly filtered) rows
  const span = (i: number, same: (a: Row, b: Row) => boolean) => {
    let n = 1
    while (i + n < rows.length && same(rows[i], rows[i + n])) n++
    return n
  }
  return (
    <div className="eqt-wrap">
      <table className="eqt">
        <thead>
          <tr>
            <th>{t('Hafta')}</th>
            <th>{t('Mavzular')}</th>
            <th>{t('Tajriba nomi va tavsifi')}</th>
            <th>{t('Rasmlari')}</th>
            <th>{t('Kerakli jihozlar nomlari')}</th>
            <th>{t('Jihoz turi')}</th>
            <th>{t('Yasash uchun kerakli jihozlar')}</th>
            <th>{t('Miqdori')}</th>
            <th>{t('Narxi (1 dona)')}</th>
            <th>{t('Jami narxi')}</th>
            <th>{t('Yana qaysi mavzuga ishlatiladi?')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i - 1]
            const lessonStart = !prev || prev.lesson.id !== r.lesson.id
            const expStart = lessonStart || prev?.experiment?.id !== r.experiment?.id
            return (
              <tr key={`${r.lesson.id}-${r.experiment?.id ?? 0}-${r.item?.id ?? 0}`} id={lessonStart ? `eqr-${r.lesson.id}` : undefined} className={lessonStart ? 'eqt__first' : ''}>
                {lessonStart && (
                  <>
                    <td className="eqt__hafta" rowSpan={span(i, (a, b) => a.lesson.id === b.lesson.id)}><div className="eqt__stick">{r.lesson.hafta}</div></td>
                    <td className="eqt__topic" rowSpan={span(i, (a, b) => a.lesson.id === b.lesson.id)}>
                      <div className="eqt__stick">
                        {r.lesson.title}
                        <small>{fmtSum(lessonCost(reg, an, r.lesson))}</small>
                      </div>
                    </td>
                  </>
                )}
                {expStart && (
                  <td className="eqt__exp" rowSpan={span(i, (a, b) => a.lesson.id === b.lesson.id && a.experiment?.id === b.experiment?.id)}>
                    {r.experiment ? (
                      <div className="eqt__stick">
                        <b>{r.expNo}-{t('tajriba')}.</b> {r.experiment.name}
                        {r.experiment.desc && <small>{r.experiment.desc}</small>}
                      </div>
                    ) : <span className="eqmuted">{t("Tajriba yo'q")}</span>}
                  </td>
                )}
                {r.item ? (
                  <ItemCells item={r.item} lesson={r.lesson} reg={reg} an={an} canEdit={canEdit} goTo={goTo} />
                ) : (
                  <td colSpan={8} className="eqmuted eqt__none">{r.experiment ? t("Jihozlar ko'rsatilmagan") : ''}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Summary({ reg, an, goTo }: { reg: Registry; an: Analysis; goTo: (lessonId: number) => void }) {
  const { t } = useTranslation()
  const sums = GRADES.map((g) => gradeSummary(reg, an, g))
  const total = (f: (s: (typeof sums)[number]) => number) => sums.reduce((a, s) => a + f(s), 0)
  return (
    <>
      <div className="eqt-wrap eqt-wrap--auto">
        <table className="eqt eqt--sum">
          <thead>
            <tr>
              <th>{t('Sinf')}</th>
              <th>{t('Mavzular soni')}</th>
              <th>{t('Tajribalar soni')}</th>
              <th>{t('Jami narx')}</th>
              <th className="eqk--birlamchi">{t('Birlamchi narxi')}</th>
              <th className="eqk--ikkilamchi">{t('Ikkilamchi narxi')}</th>
              <th className="eqk--uchlamchi">{t('Uchlamchi narxi')}</th>
              <th>{t('Narxi kiritilmagan')}</th>
            </tr>
          </thead>
          <tbody>
            {sums.map((s) => (
              <tr key={s.grade}>
                <td><b>{s.grade}-{t('sinf')}</b></td>
                <td>{s.topics}</td>
                <td>{s.experiments}</td>
                <td className="eqt__money">{fmtSum(s.total)}</td>
                <td className="eqk--birlamchi">{fmtSum(s.byKind.birlamchi)}</td>
                <td className="eqk--ikkilamchi">{fmtSum(s.byKind.ikkilamchi)}</td>
                <td className="eqk--uchlamchi">{fmtSum(s.byKind.uchlamchi)}</td>
                <td>{s.unpriced ? `${s.unpriced} ${t('ta jihoz')}` : '—'}</td>
              </tr>
            ))}
            <tr className="eqt__total">
              <td colSpan={3}>{t('Jami')}:</td>
              <td className="eqt__money">{fmtSum(total((s) => s.total))}</td>
              <td>{fmtSum(total((s) => s.byKind.birlamchi))}</td>
              <td>{fmtSum(total((s) => s.byKind.ikkilamchi))}</td>
              <td>{fmtSum(total((s) => s.byKind.uchlamchi))}</td>
              <td>{total((s) => s.unpriced) || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="eqnote"><GuideLink section="jihozlar" /> {t('Narx qanday hisoblanadi')}</p>

      <h3 className="eqh">{t("Mavzular bo'yicha")}</h3>
      <div className="eqt-wrap eqt-wrap--auto">
        <table className="eqt eqt--topics">
          <thead>
            <tr><th>{t('Sinf')}</th><th>{t('Hafta')}</th><th>{t('Mavzu')}</th><th>{t('Tajribalar soni')}</th><th>{t('Mavzu jami narxi')}</th></tr>
          </thead>
          <tbody>
            {reg.lessons.map((l) => (
              <tr key={l.id}>
                <td>{l.grade}-{t('sinf')}</td>
                <td>{l.hafta}</td>
                <td className="eqt__left"><button type="button" className="eqlink" onClick={() => goTo(l.id)}>{l.title}</button></td>
                <td>{l.experiments.length}</td>
                <td className="eqt__money">{fmtSum(lessonCost(reg, an, l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Ma'muriyat → Jihozlar jadvali: every experiment's equipment from the
 * lessons database, with kind, what it takes to build it, quantity and
 * price — editable here (admins) and exported as the Excel workbook. */
export function EquipmentRegistryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const canEdit = isAdminInView(user, viewMode)
  const { data: reg, isLoading } = useRegistry()
  const [params, setParams] = useSearchParams()
  const tab = (['7', '8', '9'].includes(params.get('tab') ?? '') ? params.get('tab') : 'umumiy') as Tab
  const [q, setQ] = useState('')
  const [onlyUnpriced, setOnlyUnpriced] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  const an = useMemo(() => (reg ? analyse(reg) : null), [reg])

  const setTab = (next: Tab) => setParams(next === 'umumiy' ? {} : { tab: next }, { replace: true })
  const goTo = (lessonId: number) => {
    const lesson = reg?.lessons.find((l) => l.id === lessonId)
    if (!lesson) return
    setQ('')
    setOnlyUnpriced(false)
    setTab(String(lesson.grade) as Tab)
    setFocus(lessonId)
  }

  useEffect(() => {
    if (focus === null) return
    // The other grade's table may not be rendered yet (the tab switch is a
    // navigation); this effect runs again when `tab` changes, so focus is
    // only cleared once the row has been found.
    const id = window.setTimeout(() => {
      const el = document.getElementById(`eqr-${focus}`)
      const wrap = el?.closest<HTMLElement>('.eqt-wrap')
      if (!el || !wrap) return
      // scroll the table box only vertically, back to its first columns
      wrap.scrollIntoView({ block: 'nearest' })
      wrap.scrollTo({ top: Math.max(0, el.offsetTop - 60), left: 0 })
      el.classList.add('is-flash')
      window.setTimeout(() => el.classList.remove('is-flash'), 1800)
      setFocus(null)
    }, 80)
    return () => window.clearTimeout(id)
  }, [focus, tab])

  const download = async () => {
    if (!reg) return
    setExporting(true)
    try {
      const { exportRegistryXlsx } = await import('./exportXlsx')
      await exportRegistryXlsx(reg)
    } catch {
      toast(t('Yuklab olishda xatolik'), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="eqpage">
      <PageHead
        title={t('Jihozlar jadvali')}
        sub={t("Darslar bazasidagi tajribalar uchun kerakli jihozlar, turi, narxi va qayta ishlatilishi")}
        actions={
          <button type="button" className="btn btn--primary" onClick={download} disabled={!reg || exporting}>
            {IC.download} {exporting ? t('Tayyorlanmoqda…') : t('Excel yuklab olish')}
          </button>
        }
      />
      {isLoading || !reg || !an ? (
        <Skeleton lines={8} />
      ) : !reg.lessons.length ? (
        <EmptyState title={t("Darslar yo'q")} hint={t("Darslar bazasiga mavzu va tajribalar qo'shilgach jadval shu yerda chiqadi.")} />
      ) : (
        <>
          <div className="eqbar">
            <div className="chips">
              <button type="button" className={`chip ${tab === 'umumiy' ? 'is-on' : ''}`} onClick={() => setTab('umumiy')}>{t('Umumiy')}</button>
              {GRADES.map((g) => (
                <button key={g} type="button" className={`chip ${tab === String(g) ? 'is-on' : ''}`} onClick={() => setTab(String(g) as Tab)}>{g}-{t('sinf')}</button>
              ))}
            </div>
            {tab !== 'umumiy' && (
              <>
                <label className="search eqbar__q">
                  <span className="search__ic" aria-hidden="true">{IC.search}</span>
                  <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Mavzu, tajriba yoki jihoz…')} autoComplete="off" />
                </label>
                <button type="button" className={`chip ${onlyUnpriced ? 'is-on' : ''}`} aria-pressed={onlyUnpriced} onClick={() => setOnlyUnpriced((v) => !v)}>
                  {t('Faqat narxsiz')}
                </button>
              </>
            )}
          </div>
          {!canEdit && <p className="eqnote">{IC.eye} {t("Faqat ko'rish: tahrirlash administratorlar uchun.")}</p>}
          {tab === 'umumiy' ? (
            <Summary reg={reg} an={an} goTo={goTo} />
          ) : (
            <Fragment key={tab}>
              <GradeTable grade={Number(tab)} reg={reg} an={an} q={q} onlyUnpriced={onlyUnpriced} canEdit={canEdit} goTo={goTo} />
            </Fragment>
          )}
        </>
      )}
    </div>
  )
}
