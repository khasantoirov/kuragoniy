import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { subjectLabel, subjectShort, type Subject } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { useSubjects } from '@/lib/subjects'
import { useUIStore } from '@/store/uiStore'

import './fan.css'

/* Fan oynalari: Amaliy fizika va STEAM / Robototexnika — alohida oynalar,
   biri ikkinchisiga aralashmaydi (backend common/subjects.window; brauzer
   oynani har so'rovda X-Fan sarlavhasida yuboradi). Ikkala fanni
   ko'radigan (ma'muriyat, dasturchi) yuqoridagi almashtirgich bilan
   o'tadi — kirishda alohida tanlash ekrani yo'q; bitta fanli kishi
   to'g'ri o'z oynasida. */

const ICONS: Record<Subject, keyof typeof IC> = { fizika: 'atom', steam: 'gear' }

/** Enter a window: everything shown so far belonged to the other one. */
function useEnterWindow() {
  const setSubject = useUIStore((s) => s.setSubject)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (s: Subject, home = true) => {
    setSubject(s)
    void queryClient.resetQueries()
    if (home) navigate('/')
  }
}

/** The top bar's window switch — for whoever sees both fans; a quiet
 *  label of the one window for everyone else. */
export function FanSwitch() {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const { visible, current, mixed } = useSubjects()
  const enter = useEnterWindow()
  if (!mixed) {
    return <span className={`fanpill fanpill--${current}`} title={subjectLabel(current, lang)}>{IC[ICONS[current]]} {subjectShort(current, lang)}</span>
  }
  return (
    <div className="fanswitch" role="group" aria-label={t('Oyna')}>
      {visible.map((s) => (
        <button key={s} type="button" className={`fanswitch__b fanswitch__b--${s} ${s === current ? 'is-on' : ''}`}
          aria-pressed={s === current} title={subjectLabel(s, lang)} onClick={() => s !== current && enter(s)}>
          {IC[ICONS[s]]} <span>{subjectShort(s, lang)}</span>
        </button>
      ))}
    </div>
  )
}
