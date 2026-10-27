import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { MODULES, useModules, type ModuleKey, type ModulesState } from '@/lib/modules'

/** Boshqaruv → Modullar: switch optional sections off for everyone, with
 * how much each one holds beside it. */
export function ModulesPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { on, data } = useModules()
  const save = useMutation({
    mutationFn: async (patch: Partial<Record<ModuleKey, boolean>>) =>
      (await api.patch<ModulesState>('/common/modules/', { modules: patch })).data,
    onSuccess: (next) => queryClient.setQueryData(['modules'], next),
  })

  const toggle = async (key: ModuleKey) => {
    try {
      await save.mutateAsync({ [key]: !on(key) })
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <section className="panel modpanel">
      <h3 className="panel__title">{t('Modullar')}</h3>
      <p className="modpanel__hint">
        {t("O'chirilgan bo'lim hamma uchun menyudan, yorliqlardan va o'quvchi portalidan yashiriladi. Ma'lumotlari saqlanib qoladi va qayta yoqilganda joyida bo'ladi.")}
      </p>
      <ul className="modlist">
        {MODULES.map((m) => {
          const n = data?.usage?.[m.key]
          return (
            <li key={m.key} className="modlist__row">
              <span className="modlist__txt">
                <b>{t(m.label)}</b>
                <small>
                  {t(m.sub)}
                  {n != null && <> · {n ? `${n} ${t('ta yozuv')}` : t('hali ishlatilmagan')}</>}
                </small>
              </span>
              <button type="button" role="switch" aria-checked={on(m.key)} aria-label={t(m.label)}
                className={`qswitch ${on(m.key) ? 'is-on' : ''}`} disabled={save.isPending} onClick={() => void toggle(m.key)}>
                <span className="qswitch__dot" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
