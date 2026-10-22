import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { ATT } from '@/features/journal/attendance'
import { bandText, LEVELS, SCALES } from '@/features/journal/scales'
import { PageHead } from '@/features/portal/ui'

import './guide.css'

/* Yo'riqnoma — the explanations that used to sit on the pages themselves
   (hints, colour legends, "past days are closed" notes, info boxes), in
   one place. Pages link here with a small "?" (/guide#<section>). */

const SECTIONS: { id: string; title: string }[] = [
  { id: 'jurnal', title: 'Jurnal: baho va davomat kiritish' },
  { id: 'baholash', title: 'Baholash shkalalari va ranglar' },
  { id: 'davomat', title: 'Davomat belgilari' },
  { id: 'yopilgan-kunlar', title: "Yopilgan kunlar va ruxsat so'rash" },
  { id: 'statistika', title: "Statistika ko'rsatkichlari" },
  { id: 'faollik', title: "Faollik ko'rinishi" },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section id={id} className="guide__sec">
      <h2 className="guide__h">{t(title)}</h2>
      <div className="guide__body">{children}</div>
    </section>
  )
}

export function GuidePage() {
  const { t } = useTranslation()
  const { hash } = useLocation()

  // After the shell's scroll restoration has put a new page at the top.
  useEffect(() => {
    if (!hash) return
    let off = 0
    const id = window.setTimeout(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (!el) return
      el.scrollIntoView({ block: 'start' })
      el.classList.add('is-flash')
      off = window.setTimeout(() => el.classList.remove('is-flash'), 1600)
    }, 120)
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(off)
    }
  }, [hash])

  return (
    <div className="guide">
      <PageHead title={t("Yo'riqnoma")} sub={t("Platformadagi belgilar, ranglar va qoidalar izohi")} />
      <nav className="guide__toc" aria-label={t('Mundarija')}>
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="chip">{t(s.title)}</a>)}
      </nav>

      <Section id="jurnal" title={SECTIONS[0].title}>
        <ul>
          <li>{t("Jurnal jadvalida sana yoki istalgan katakni bosing — o'sha darsning sahifasi ochiladi. Davomat va baholar shu sahifada kiritiladi va «Saqlash» tugmasi bilan birga saqlanadi.")}</li>
          <li>{t("«Bugungi dars» tugmasi bugungi dars sahifasini to'g'ridan-to'g'ri ochadi; boshqa kun uchun «+ Dars kuni» dan foydalaning.")}</li>
          <li>{t("Sinflar orasida tepadagi tanlagich yoki uning yonidagi ‹ › tugmalari bilan o'tiladi; choraklar uning yonida.")}</li>
          <li>{t("Chorak bahosi jadvalning «Chorak» ustunidagi katakni bosib qo'yiladi.")}</li>
        </ul>
      </Section>

      <Section id="baholash" title={SECTIONS[1].title}>
        <p>{t("Har bir sinf o'z maktabining tizimida baholanadi: 5, 10 yoki 100 ballik. Shkala sinfni qo'shish yoki tahrirlashda tanlanadi. Har bir baho avtomatik ravishda rang toifasiga moslanadi:")}</p>
        <div className="guide__tablewrap">
          <table className="guide__table">
            <thead>
              <tr>
                <th>{t('Rang toifasi')}</th>
                {SCALES.map((s) => <th key={s.v}>{t(s.label)}</th>)}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l.l}>
                  <td><span className={`gchip gchip--${l.l} guide__dot`} aria-hidden="true" /> {t(l.label)}</td>
                  {SCALES.map((s) => <td key={s.v} className="guide__num">{bandText(l.l, s.v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t("Shkala o'zgartirilsa, mavjud baholar yangi shkalaga o'tkaziladi va har birining rangi saqlanadi (masalan, 100 ballikdagi 87 — a'lo — 5 ballikda 5 bo'ladi).")}</p>
        <p>{t("Statistika sahifalari turli shkaladagi sinflarni solishtirish uchun baholarni rang toifasi bo'yicha 5 ballik asosga keltiradi.")}</p>
      </Section>

      <Section id="davomat" title={SECTIONS[2].title}>
        <ul className="guide__att">
          {ATT.filter((a) => a.k).map((a) => (
            <li key={a.k}><span className={`at ${a.cls}`}>{a.ic}</span> <b>{t(a.label)}</b> — {t(
              a.k === 'n' ? 'darsga kelmadi (sababsiz)'
                : a.k === 'k' ? 'darsga kechikib keldi; qoldirilgan dars hisoblanmaydi'
                  : a.k === 'x' ? "maktabda bor, lekin darsga kirmadi; sababsiz qoldirilgan dars hisoblanadi"
                    : "sababli qoldirilgan (eski yozuvlarda uchraydi)",
            )}</li>
          ))}
        </ul>
        <p>{t("Belgisi yo'q katak — o'quvchi darsda bo'lgan.")}</p>
      </Section>

      <Section id="yopilgan-kunlar" title={SECTIONS[3].title}>
        <ul>
          <li>{t("Baho va davomat faqat dars kunining o'zida kiritiladi; o'tgan kunlar yopiladi. Kelgusi kunlarga ham kiritilmaydi.")}</li>
          <li>{t("O'tgan kunni o'zgartirish kerak bo'lsa, jadvaldagi sana yonidagi qulfni bosing va administratordan ruxsat so'rang. Javob bildirishnomada keladi.")}</li>
          <li>{t("Administrator qulfni bosib kunni o'zi yoki o'qituvchi uchun ochadi. Barcha so'rovlar va berilgan ruxsatlar «Jurnal → Ruxsatlar» bo'limida.")}</li>
          <li>{t("Administrator boshqa o'qituvchining jurnalini faqat ko'radi — o'zgartira olmaydi.")}</li>
        </ul>
      </Section>

      <Section id="statistika" title={SECTIONS[4].title}>
        <dl className="guide__dl">
          <dt>{t("O'rtacha baho")}</dt>
          <dd>{t("Davrdagi barcha baholarning o'rtachasi. Jurnalda sinfning o'z shkalasida, statistika sahifalarida 5 ballik asosda ko'rsatiladi.")}</dd>
          <dt>{t("O'zlashtirish")}</dt>
          <dd>{t("O'rtacha bahosi 3,5 va undan yuqori («4»–«5», ya'ni yaxshi va a'lo) o'quvchilar ulushi.")}</dd>
          <dt>{t('Davomat')}</dt>
          <dd>{t("Qoldirilgan (sababli va sababsiz) darslardan tashqari qatnashuv; kechikish alohida sanaladi.")}</dd>
          <dt>{t('Sifat')}</dt>
          <dd>{t("Baho va davomatning umumlashmasi: o'zlashtirish va davomat foizlarining o'rtachasi.")}</dd>
        </dl>
      </Section>

      <Section id="faollik" title={SECTIONS[5].title}>
        <p>{t("Platformadagi faolligingiz (hozir onlayn yoki oxirgi marta qachon kirgansiz) ma'muriyatga ko'rinadi. Ish vaqtingiz yoki ekrandagi harakatlaringiz yozib olinmaydi.")}</p>
      </Section>
    </div>
  )
}
