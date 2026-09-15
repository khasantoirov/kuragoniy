import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { gradeLabel } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { useUIStore } from '@/store/uiStore'

import { useCreateLessonPoster, useDeleteLessonPoster, useLessonPosters, useUpdateLessonPoster, type LessonPoster } from './postersApi'

interface PosterImage {
  id: string
  url: string
  name: string
}

interface PosterExperiment {
  id: string
  name: string
  images: PosterImage[]
  safety: string
}

const MIN_EXPERIMENTS = 1
const MAX_EXPERIMENTS = 12

// Cycles through these for each experiment's header bar — approximates the
// navy/blue/teal/purple rotation teachers already use in hand-made slides,
// then repeats with a couple more so a poster with >4 experiments doesn't
// immediately reuse identical adjacent colors.
const CARD_COLORS = ['#16233D', '#1F5C8B', '#127A6B', '#5B2A9E', '#8C2F39', '#4B5320']

// A poster's column count for a given experiment count — biased toward
// wider, roomier cells (2 cols up to 4 experiments, matching the 2x2
// reference layout) rather than a plain sqrt() grid, which would spread
// out to as many thin, hard-to-fill columns as there are experiments.
function gridCols(n: number): number {
  if (n <= 2) return n
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

// When `n` doesn't evenly fill `cols` columns, the last card would
// otherwise leave a blank gap next to it (e.g. 3 experiments in a 2-column
// grid — 2 on the first row, 1 alone on the second). Spanning the last
// card across the remaining columns fills that gap instead of leaving it
// empty.
function lastCardSpan(n: number, cols: number): number {
  return cols - ((n - 1) % cols)
}

function emptyExperiment(): PosterExperiment {
  return { id: crypto.randomUUID(), name: '', images: [], safety: '' }
}

function stripExt(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

function posterFilename(p: LessonPoster): string {
  return `${p.grade}-sinf_${p.hafta}-hafta_${(p.topic || 'dars').trim().slice(0, 40)}.jpg`
}

function EditPosterModal({ poster, onClose }: { poster: LessonPoster; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const update = useUpdateLessonPoster()
  const [grade, setGrade] = useState(poster.grade)
  const [hafta, setHafta] = useState(poster.hafta)
  const [topic, setTopic] = useState(poster.topic)

  const submit = async () => {
    try {
      await update.mutateAsync({ id: poster.id, grade, hafta, topic })
      toast(t('Saqlandi'))
      onClose()
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    }
  }

  return (
    <Modal
      title={t('Rasm ma\'lumotlarini tahrirlash')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={update.isPending}>{t('Saqlash')}</button>
        </>
      }
    >
      <p className="prose prose--note">
        {t("Faqat sinf/hafta/mavzu o'zgaradi — rasmning o'zini qayta yaratish uchun yuqoridagi asosiy shakldan foydalaning.")}
      </p>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {[7, 8, 9].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Hafta')}</span>
          <input className="input" type="number" min={1} max={40} value={hafta} onChange={(e) => setHafta(Number(e.target.value) || 1)} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('Mavzu nomi')}</span>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </label>
    </Modal>
  )
}

export function LessonPosterPage() {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const toast = useToast()
  const confirm = useConfirm()
  const posterRef = useRef<HTMLDivElement>(null)
  const [grade, setGrade] = useState(7)
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('')
  const [experiments, setExperiments] = useState<PosterExperiment[]>([emptyExperiment()])
  const { data: posters, isLoading: postersLoading } = useLessonPosters()
  const createPoster = useCreateLessonPoster()
  const deletePoster = useDeleteLessonPoster()
  const [editingPoster, setEditingPoster] = useState<LessonPoster | null>(null)
  const [exporting, setExporting] = useState(false)

  const setCount = (n: number) => {
    n = Math.max(MIN_EXPERIMENTS, Math.min(MAX_EXPERIMENTS, n || MIN_EXPERIMENTS))
    setExperiments((prev) => {
      if (n === prev.length) return prev
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, emptyExperiment)]
      return prev.slice(0, n)
    })
  }

  const updateExp = (id: string, patch: Partial<PosterExperiment>) => {
    setExperiments((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  const removeExp = (id: string) => {
    setExperiments((prev) => (prev.length <= MIN_EXPERIMENTS ? prev : prev.filter((e) => e.id !== id)))
  }

  const addImage = (expId: string, file: File) => {
    const url = URL.createObjectURL(file)
    const image: PosterImage = { id: crypto.randomUUID(), url, name: stripExt(file.name) }
    setExperiments((prev) => prev.map((e) => (e.id === expId ? { ...e, images: [...e.images, image] } : e)))
  }

  const removeImage = (expId: string, imgId: string) => {
    setExperiments((prev) =>
      prev.map((e) => {
        if (e.id !== expId) return e
        const img = e.images.find((i) => i.id === imgId)
        if (img) URL.revokeObjectURL(img.url)
        return { ...e, images: e.images.filter((i) => i.id !== imgId) }
      }),
    )
  }

  const updateImageName = (expId: string, imgId: string, name: string) => {
    setExperiments((prev) =>
      prev.map((e) => (e.id === expId ? { ...e, images: e.images.map((i) => (i.id === imgId ? { ...i, name } : i)) } : e)),
    )
  }

  const save = async () => {
    if (!posterRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(posterRef.current, { backgroundColor: '#ffffff', scale: 2 })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95))
      if (!blob) return

      await createPoster.mutateAsync({ grade, hafta: week, topic, image: blob })
      toast(t('Rasm galereyaga saqlandi — pastdan yuklab olishingiz mumkin'))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const onDeletePoster = async (p: LessonPoster) => {
    if (!(await confirm({ title: t("O'chirish"), text: `${p.grade}-sinf, ${p.hafta}-hafta — ${t('galereyadan o\'chiriladi.')}`, danger: true }))) return
    try {
      await deletePoster.mutateAsync(p.id)
      toast(t("O'chirildi"))
    } catch {
      toast(t("O'chirishda xatolik"), 'error')
    }
  }

  const cols = gridCols(experiments.length)

  return (
    <div>
      <div className="ttbar">
        <div>
          <h3 className="ttbar__title">{t('Dars rasmi yaratish')}</h3>
          <p className="ttbar__sub">{t("O'quv materiali sifatida tarqatiladigan rasm tayyorlash vositasi.")}</p>
        </div>
      </div>

      <section className="panel">
        <h3 className="panel__title">{t("Dars ma'lumotlari")}</h3>
        <div className="row row--2">
          <label className="field">
            <span className="field__label">{t('Sinf')}</span>
            <select className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {[7, 8, 9].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('Hafta')}</span>
            <input className="input" type="number" min={1} max={40} value={week} onChange={(e) => setWeek(Number(e.target.value) || 1)} />
          </label>
        </div>
        <label className="field">
          <span className="field__label">{t('Mavzu nomi')}</span>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('Masalan: Fizika faniga kirish. Qiziqarli tajribalar')} />
        </label>
        <label className="field">
          <span className="field__label">{t('Tajribalar soni')}</span>
          <input
            className="input"
            type="number"
            min={MIN_EXPERIMENTS}
            max={MAX_EXPERIMENTS}
            value={experiments.length}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{ maxWidth: 120 }}
          />
        </label>
      </section>

      {experiments.map((exp, i) => (
        <section className="panel" key={exp.id}>
          <h3 className="panel__title">
            {i + 1}-{t('tajriba')}
            {experiments.length > MIN_EXPERIMENTS && (
              <button className="icon-btn icon-btn--danger" style={{ marginLeft: 10 }} title={t("Tajribani o'chirish")} onClick={() => removeExp(exp.id)}>
                {IC.trash}
              </button>
            )}
          </h3>
          <label className="field">
            <span className="field__label">{t('Tajriba nomi')}</span>
            <input className="input" value={exp.name} onChange={(e) => updateExp(exp.id, { name: e.target.value })} placeholder={t("Masalan: Dielektrikning isishi")} />
          </label>

          <div className="field">
            <span className="field__label">{t('Rasmlar')} <span className="field__opt">({t('har birining nomini kiriting — Jihozlar qatoriga shular yoziladi')})</span></span>
            {exp.images.map((img) => (
              <div key={img.id} className="row row--2" style={{ alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={img.url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--rule)' }} />
                  <input className="input" value={img.name} onChange={(e) => updateImageName(exp.id, img.id, e.target.value)} placeholder={t('Nomi')} />
                </div>
                <button className="btn btn--sm btn--ghost" type="button" onClick={() => removeImage(exp.id, img.id)}>{IC.trash}</button>
              </div>
            ))}
            <label className="btn btn--sm">
              {IC.upload} {t('Rasm qo\'shish')}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) addImage(exp.id, f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label">{t('Diqqat / Eslatma / Xavfsizlik')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
            <textarea
              className="input"
              rows={2}
              value={exp.safety}
              onChange={(e) => updateExp(exp.id, { safety: e.target.value })}
              placeholder={t("Masalan: Ochiq olov bilan ehtiyot bo'ling")}
            />
          </label>
        </section>
      ))}

      <section className="panel">
        <h3 className="panel__title">{t("Ko'rinishi")}</h3>
        <div className="table-wrap">
          <div ref={posterRef} className="poster">
            <div className="poster__head">
              <b>{grade}-sinf</b> · <b>{week}-hafta</b> · <i>Mavzu: {topic || '…'}</i>
            </div>
            <div className="poster__grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {experiments.map((exp, i) => (
                <div
                  className="poster__card"
                  key={exp.id}
                  style={i === experiments.length - 1 ? { gridColumn: `span ${lastCardSpan(experiments.length, cols)}` } : undefined}
                >
                  <div className="poster__card-head" style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}>
                    {i + 1}-tajriba {exp.name && <span>{exp.name}</span>}
                  </div>
                  <div className="poster__card-body">
                    <div className="poster__images">
                      {exp.images.length ? (
                        exp.images.map((img) => <img key={img.id} src={img.url} alt="" className="poster__img" />)
                      ) : (
                        <span className="poster__img-empty">{t('Rasm yo\'q')}</span>
                      )}
                    </div>
                    <div className="poster__equip">
                      <b>Jihozlar:</b> {exp.images.map((im) => im.name).filter(Boolean).join(', ') || '—'}
                    </div>
                    {exp.safety && <div className="poster__safety">⚠️ {exp.safety}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="panel__acts">
          <button className="btn btn--primary" onClick={save} disabled={exporting}>
            {exporting ? t('Tayyorlanmoqda…') : t('Saqlash')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Yaratilgan rasmlar')}</h3>
        {postersLoading ? (
          <Skeleton lines={3} />
        ) : posters?.length ? (
          [7, 8, 9].map((g) => {
            const rows = posters.filter((p) => p.grade === g)
            if (!rows.length) return null
            return (
              <div key={g} className="poster-gallery__group">
                <h4 className="poster-gallery__grade">{gradeLabel(g, lang)}</h4>
                <div className="poster-gallery__grid">
                  {rows.map((p) => (
                    <div key={p.id} className="poster-gallery__item">
                      <img src={p.image} alt="" className="poster-gallery__thumb" />
                      <span className="poster-gallery__meta">
                        <b>{p.hafta}-{t('hafta')}</b>
                        {p.topic && <span className="poster-gallery__topic">{p.topic}</span>}
                      </span>
                      <span className="poster-gallery__tools">
                        <a className="icon-btn" href={p.image} download={posterFilename(p)} title={t('Yuklab olish')}>
                          {IC.download}
                        </a>
                        <button type="button" className="icon-btn" title={t('Tahrirlash')} onClick={() => setEditingPoster(p)}>
                          {IC.edit}
                        </button>
                        <button type="button" className="icon-btn icon-btn--danger" title={t("O'chirish")} onClick={() => onDeletePoster(p)}>
                          {IC.trash}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        ) : (
          <p className="prose">{t('Hali rasm yaratilmagan.')}</p>
        )}
      </section>

      {editingPoster && <EditPosterModal poster={editingPoster} onClose={() => setEditingPoster(null)} />}
    </div>
  )
}
