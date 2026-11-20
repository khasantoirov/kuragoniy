import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'

import { subjectLabel, subjectShort, type Subject } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { useSubjects } from '@/lib/subjects'
import { useUIStore } from '@/store/uiStore'

import './fan.css'

/* Fan oynalari: Amaliy fizika va STEAM / Robototexnika — alohida oynalar,
   biri ikkinchisiga aralashmaydi (backend common/subjects.window; brauzer
   oynani har so'rovda X-Fan sarlavhasida yuboradi). Ikkala fanni
   ko'radigan (ma'muriyat, dasturchi) kirgach oynani tanlaydi va yuqoridagi
   almashtirgich bilan o'tadi; bitta fanli kishi to'g'ri o'z oynasida. */

const PICKED_KEY = 'ke-fan-picked'

function readPicked(): boolean {
  try {
    return sessionStorage.getItem(PICKED_KEY) === '1'
  } catch {
    return true // storage blocked: don't keep showing the chooser
  }
}

/** Chosen in this browser session already (the chooser shows once per session). */
export const useFanPicked = create<{ picked: boolean; mark: () => void }>()((set) => ({
  picked: readPicked(),
  mark: () => {
    try {
      sessionStorage.setItem(PICKED_KEY, '1')
    } catch {
      // storage blocked
    }
    set({ picked: true })
  },
}))

const ICONS: Record<Subject, keyof typeof IC> = { fizika: 'atom', steam: 'gear' }

/** Enter a window: everything shown so far belonged to the other one. */
function useEnterWindow() {
  const setSubject = useUIStore((s) => s.setSubject)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const markPicked = useFanPicked((st) => st.mark)
  return (s: Subject, home = true) => {
    setSubject(s)
    markPicked()
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

/** After signing in, whoever sees both fans picks the window to enter. */
export function FanChooser() {
  const { t } = useTranslation()
  const lang = useUIStore((s) => s.lang)
  const { visible } = useSubjects()
  const enter = useEnterWindow()
  const blurb: Record<Subject, string> = {
    fizika: t("Nazariya va tajriba: darslar, laboratoriya, kutubxona, jurnallar — fizika o'qituvchilari va sinflari"),
    steam: t("Robototexnika, STEAM loyihalar, STEM chamadonlar — o'z o'qituvchilari, sinflari va jurnallari bilan"),
  }
  return (
    <div className="fanpick">
      <div className="fanpick__in">
        <img className="fanpick__logo" src="/logo.png" alt="" width={64} height={64} />
        <h1 className="fanpick__title">{t('Qaysi oynaga kirasiz?')}</h1>
        <p className="fanpick__sub">{t("Har bir fan alohida oynada. Keyin yuqoridagi tugma bilan almashtirasiz.")}</p>
        <div className="fanpick__cards">
          {visible.map((s) => (
            <button key={s} type="button" className={`fanpick__card fanpick__card--${s}`} onClick={() => enter(s, false)}>
              <span className="fanpick__ic">{IC[ICONS[s]]}</span>
              <span className="fanpick__name">{subjectLabel(s, lang)}</span>
              <span className="fanpick__blurb">{blurb[s]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
