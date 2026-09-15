const FIELD_SELECTOR = 'input, select, textarea, button'

const SKIPPED_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden'])

function isVisible(el: HTMLElement) {
  return el.offsetParent !== null || el === document.activeElement
}

function collectFields(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter((el) => {
    if (el.hasAttribute('disabled')) return false
    if (!isVisible(el)) return false
    if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) return false
    return true
  })
}

/** Installs a document-wide Enter handler for the modal/panel-style forms
 * across the app (SlotEditor, LessonEditor, ExperimentEditor, LibraryPage,
 * ProfilePage, etc.) that aren't backed by a real <form> — those get
 * Enter-to-submit for free from the browser, so this skips them entirely.
 * Enter in a field moves focus to the next field in reading order within
 * the nearest .modal/.pf__pw/.panel; from the last field it activates that
 * section's primary action directly (any .btn--primary — Saqlash,
 * Qo'shish, etc.) instead of requiring an extra Tab+Enter. Returns a
 * cleanup function, same shape as AppShell's other global key handlers. */
export function setupEnterKeyNav(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return

    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return
    if (target.closest('form')) return

    const container =
      target.closest<HTMLElement>('.modal') ??
      target.closest<HTMLElement>('.pf__pw') ??
      target.closest<HTMLElement>('.panel') ??
      document.body
    const fields = collectFields(container)
    const at = fields.indexOf(target)
    if (at === -1) return

    e.preventDefault()
    let i = at + 1
    while (i < fields.length && fields[i].tagName === 'BUTTON' && !fields[i].classList.contains('btn--primary')) i++
    const next = fields[i]
    if (!next) return

    if (next instanceof HTMLButtonElement) {
      next.click()
    } else {
      next.focus()
      if (next instanceof HTMLInputElement) next.select()
    }
  }

  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}
