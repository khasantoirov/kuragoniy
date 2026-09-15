import type { Lang } from '@/store/uiStore'

/**
 * Ports js/i18n.js's trField/trArr: picks the `${field}_ru` / `${field}_en`
 * suffixed variant for the current language (written server-side by the
 * Telegram bot's translation worker), falling back to the base Uzbek
 * field when no translation exists yet.
 */
export function trField<T extends Record<string, unknown>>(obj: T, field: string, lang: Lang): string {
  if (lang === 'uz') return (obj[field] as string) ?? ''
  const suffixed = obj[`${field}_${lang}`] as string | undefined
  return suffixed || ((obj[field] as string) ?? '')
}

export function trArr<T extends Record<string, unknown>>(obj: T, field: string, lang: Lang): string[] {
  if (lang === 'uz') return (obj[field] as string[]) ?? []
  const suffixed = obj[`${field}_${lang}`] as string[] | undefined
  return suffixed && suffixed.length > 0 ? suffixed : ((obj[field] as string[]) ?? [])
}
