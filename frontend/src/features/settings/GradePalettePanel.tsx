import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { GRADE_PALETTES, useModules, type GradePalette, type ModulesState } from '@/lib/modules'

/** Sozlamalar → Ko'rinish, for the developer only: how marks are coloured
 * on every page, for everyone (common.PlatformSettings.grade_palette). Each
 * card previews its palette in the current theme. */
export function GradePalettePanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data } = useModules()
  const current = data?.grade_palette ?? 'aralash'
  const save = useMutation({
    mutationFn: async (key: GradePalette) => (await api.patch<ModulesState>('/common/modules/', { grade_palette: key })).data,
    onSuccess: (next) => queryClient.setQueryData(['modules'], next),
  })

  const choose = async (key: GradePalette) => {
    if (key === current) return
    try {
      await save.mutateAsync(key)
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <section className="panel">
      <h3 className="panel__title">{t('Baho ranglari')}</h3>
      <p className="form__note">{t("Butun platforma uchun: o'qituvchilar, ma'muriyat va o'quvchilar shu ranglarni ko'radi. Faqat dasturchi tanlaydi.")}</p>
      <div className="palpick" role="radiogroup" aria-label={t('Baho ranglari')}>
        {GRADE_PALETTES.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={current === p.key} data-grades={p.key}
            className={`palpick__opt ${current === p.key ? 'is-on' : ''}`} disabled={save.isPending} onClick={() => choose(p.key)}>
            <span className="palpick__t">{t(p.label)}{current === p.key && <small> · {t('tanlangan')}</small>}</span>
            <span className="palpick__s">{t(p.sub)}</span>
            <span className="palpick__chips" aria-hidden="true">
              {['5', '4', '3', '2', '1'].map((k) => <span key={k} className={`gchip gchip--${k}`}>{k}</span>)}
              <span className="gchip gchip--4 gchip--wide">4.25</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
