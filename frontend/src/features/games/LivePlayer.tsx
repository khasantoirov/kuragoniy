import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { useUpdateGuard } from '@/lib/updateGuard'

import { OPTION_STYLES, useGameSocket } from './gameSocket'

interface PlayerState {
  session: number
  status: 'lobby' | 'question' | 'reveal' | 'finished'
  quiz_title: string
  index: number
  total: number
  me: { nickname: string; score: number; rank: number; streak: number; players: number }
  question?: { text: string; image_url: string; options: string[]; time_limit: number; time_left: number; correct?: number }
  answered?: boolean
  my_choice?: number | null
  result?: { is_correct: boolean; points: number }
  leaderboard?: { nickname: string; score: number; rank: number }[]
}

/** Student side of the live quiz: join with the PIN on the board, then
 * big colour+shape answer buttons (readable without colour too). */
export function LivePlayer({ onExit }: { onExit?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [pin, setPin] = useState('')
  const [state, setState] = useState<PlayerState | null>(null)
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(0)

  const refresh = useCallback(async () => {
    if (!state) return
    try {
      const res = await api.get<PlayerState>(`/games/play/${state.session}/state/`)
      setState(res.data)
    } catch {
      // transient — the next ping/poll retries
    }
  }, [state])

  useGameSocket(state?.session ?? null, refresh)
  useUpdateGuard(!!state && state.status !== 'finished')

  useEffect(() => {
    setLeft(Math.ceil(state?.question?.time_left ?? 0))
  }, [state?.question?.time_left, state?.index, state?.status])

  useEffect(() => {
    if (state?.status !== 'question' || left <= 0) return
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left, state?.status])

  const join = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api.post<PlayerState>('/games/play/join/', { pin: pin.trim() })
      setState(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const answer = async (choice: number) => {
    if (!state || state.answered || busy) return
    setBusy(true)
    try {
      const res = await api.post<PlayerState>(`/games/play/${state.session}/answer/`, { choice })
      setState(res.data)
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return (
      <form className="gjoin" onSubmit={join}>
        <h3>{t("Jonli o'yinga qo'shilish")}</h3>
        <p className="prose prose--note">{t("Doskadagi 6 xonali o'yin kodini kiriting.")}</p>
        <input className="input gjoin__pin" inputMode="numeric" maxLength={6} autoComplete="off" placeholder="123456"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <button className="btn btn--primary btn--block" disabled={busy || pin.length !== 6}>{t("Qo'shilish")}</button>
      </form>
    )
  }

  const q = state.question
  return (
    <div className="gplay">
      <div className="gplay__bar">
        <span>{state.quiz_title}</span>
        <span>{state.me.nickname} · <b>{state.me.score}</b> {t('ball')}</span>
      </div>

      {state.status === 'lobby' && (
        <div className="gplay__wait">
          <p className="gplay__big">✓ {t("Siz o'yindasiz!")}</p>
          <p>{t("O'qituvchi o'yinni boshlashini kuting…")}</p>
          <p className="muted">{state.me.players} {t("o'yinchi")}</p>
        </div>
      )}

      {state.status === 'question' && q && (
        <>
          <p className="gplay__meta">{state.index + 1}/{state.total} · ⏱ {Math.max(0, left)} s</p>
          <p className="gplay__q">{q.text}</p>
          {q.image_url && <img className="gplay__img" src={q.image_url} alt="" referrerPolicy="no-referrer" />}
          {state.answered ? (
            <div className="gplay__wait"><p className="gplay__big">{t('Javob qabul qilindi')}</p><p>{t('Natijani kuting…')}</p></div>
          ) : left <= 0 ? (
            <div className="gplay__wait"><p className="gplay__big">⏱ {t('Vaqt tugadi')}</p></div>
          ) : (
            <div className="gansw">
              {q.options.map((opt, i) => (
                <button key={i} type="button" className={`gans ${OPTION_STYLES[i].cls}`} onClick={() => answer(i)} disabled={busy}>
                  <span className="gans__shape" aria-hidden="true">{OPTION_STYLES[i].shape}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {state.status === 'reveal' && (
        <div className={`gplay__res ${state.result?.is_correct ? 'is-ok' : 'is-bad'}`}>
          <p className="gplay__big">{state.result?.is_correct ? `✓ ${t("To'g'ri!")} +${state.result.points}` : `✗ ${t("Noto'g'ri")}`}</p>
          {q?.correct != null && <p>{t("To'g'ri javob")}: <b>{q.options[q.correct]}</b></p>}
          <p>{t("O'rningiz")}: <b>{state.me.rank}</b> / {state.me.players}{state.me.streak > 1 && ` · 🔥 ${state.me.streak}`}</p>
        </div>
      )}

      {state.status === 'finished' && (
        <div className="gplay__wait">
          <p className="gplay__big">🏁 {t("O'yin tugadi")}</p>
          <p>{t("Sizning o'rningiz")}: <b>{state.me.rank}</b> · {state.me.score} {t('ball')}</p>
        </div>
      )}

      {state.leaderboard && (
        <ol className="lboard">
          {state.leaderboard.map((r) => (
            <li key={r.rank} className={r.nickname === state.me.nickname ? 'is-me' : ''}>
              <span className="lboard__rank">{r.rank}</span>
              <span className="lboard__name">{r.nickname}</span>
              <span className="lboard__score">{r.score}</span>
            </li>
          ))}
        </ol>
      )}

      {state.status === 'finished' && onExit && <button className="btn" onClick={onExit}>{t('Chiqish')}</button>}
    </div>
  )
}
