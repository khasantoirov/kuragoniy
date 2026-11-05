import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { useModules, type ModulesState, type Protection } from '@/lib/modules'

type Flag = Exclude<keyof Protection, 'scope'>

const FLAGS: { key: Flag; label: string; sub: string }[] = [
  { key: 'watermark', label: 'Suv belgisi', sub: "Har sahifada ko'ruvchining ismi, logini va sanasi xira yozuv bo'lib turadi — tarqalgan rasm kimdan chiqqanini ko'rsatadi" },
  { key: 'no_copy', label: 'Nusxa olishni cheklash', sub: "Matnni belgilash, nusxalash, o'ng tugma menyusi va rasmni sudrab olish o'chadi (yozish maydonlari ishlayveradi)" },
  { key: 'no_print', label: 'Chop etishni cheklash', sub: "Brauzerning «Chop etish» (Ctrl+P) bo'sh varaq beradi; platformaning o'z «Chop etish» tugmalari ishlaydi" },
  { key: 'screenshot', label: 'Skrinshotga qarshi', sub: "PrintScreen bosilsa ekran yopiladi va urinish xavfsizlik jurnaliga yoziladi; boshqa oynaga o'tilganda sahifa xiralashadi" },
]

/** Boshqaruv → Himoya: the developer's content-protection switches. Others
 *  see them read-only. */
export function ProtectionPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data } = useModules()
  const p = data?.protection
  const dev = !!user?.is_dev_superuser
  const save = useMutation({
    mutationFn: async (patch: Partial<Protection>) =>
      (await api.patch<ModulesState>('/common/modules/', { protection: patch })).data,
    onSuccess: (next) => queryClient.setQueryData(['modules'], (old: ModulesState | undefined) => ({ ...old, ...next })),
  })
  const put = async (patch: Partial<Protection>) => {
    try {
      await save.mutateAsync(patch)
      toast(t('Saqlandi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  if (!p) return null
  return (
    <section className="panel modpanel">
      <h3 className="panel__title">{t('Kontent himoyasi')}</h3>
      <p className="modpanel__hint">
        {t("Ma'lumotlarni platformadan olib chiqishni qiyinlashtiradi. Brauzer skrinshotni butunlay to'xtata olmaydi (telefon kamerasi, tizim vositalari) — shuning uchun suv belgisi eng ishonchli himoya: rasm tarqalsa, kimniki ekani ko'rinadi. Dasturchiga cheklovlar qo'llanmaydi.")}
      </p>
      <ul className="modlist">
        {FLAGS.map((f) => (
          <li key={f.key} className="modlist__row">
            <span className="modlist__txt">
              <b>{t(f.label)}</b>
              <small>{t(f.sub)}</small>
            </span>
            <button type="button" role="switch" aria-checked={p[f.key]} aria-label={t(f.label)}
              className={`qswitch ${p[f.key] ? 'is-on' : ''}`} disabled={!dev || save.isPending}
              onClick={() => void put({ [f.key]: !p[f.key] })}>
              <span className="qswitch__dot" />
            </button>
          </li>
        ))}
        <li className="modlist__row">
          <span className="modlist__txt">
            <b>{t('Kimlarga')}</b>
            <small>{t("Hammaga (dasturchidan tashqari) yoki faqat o'quvchilarga")}</small>
          </span>
          <select className="input modlist__sel" value={p.scope} disabled={!dev || save.isPending}
            onChange={(e) => void put({ scope: e.target.value as Protection['scope'] })}>
            <option value="all">{t('Hammaga')}</option>
            <option value="students">{t("Faqat o'quvchilarga")}</option>
          </select>
        </li>
      </ul>
      {!dev && <p className="prose prose--note">{t("Bu sozlamalarni faqat dasturchi o'zgartiradi.")}</p>}
    </section>
  )
}
