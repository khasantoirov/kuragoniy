import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { IC } from '@/icons'

import { MIN_SEARCH_LEN, useGlobalSearch, type SearchItem, type SearchKind } from './api'

const KIND_ICON: Record<SearchKind, keyof typeof IC> = {
  lesson: 'file',
  library: 'book',
  student: 'users',
  staff: 'user',
}

/** Yuqori paneldagi umumiy qidiruv (2-rejim). Backend bitta so'rovda
 *  to'rt guruh qaytaradi (darslar, kutubxona, o'quvchilar, xodimlar) —
 *  bu komponent faqat bo'sh bo'lmagan guruhlarni chizadi va klaviatura
 *  bilan boshqarishni ta'minlaydi. */
export function GlobalSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Har bosilgan harfda so'rov yubormaslik uchun 250ms kutamiz.
  useEffect(() => {
    const id = window.setTimeout(() => setQ(text.trim()), 250)
    return () => window.clearTimeout(id)
  }, [text])

  const { data, isFetching } = useGlobalSearch(q)

  const groups = useMemo(() => (data?.groups ?? []).filter((g) => g.items.length > 0), [data])
  // Klaviatura bo'ylab yurish uchun guruhlar bitta ro'yxatga yoyiladi.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setActive(0), [q])

  // Tashqariga bosilganda yopiladi.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Ctrl+K / Cmd+K — qidiruvga o'tish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (item: SearchItem) => {
    setOpen(false)
    setText('')
    setQ('')
    navigate(item.url)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape'ni AppShell ushlab, bir sahifa ortga qaytarib yuboradi —
    // qidiruv ochiq bo'lsa u faqat ro'yxatni yopishi kerak.
    if (e.key === 'Escape') {
      if (open || text) {
        e.stopPropagation()
        setOpen(false)
        setText('')
      }
      return
    }
    if (!flat.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) go(item)
    }
  }

  const tooShort = q.length > 0 && q.length < MIN_SEARCH_LEN
  const showPanel = open && q.length >= MIN_SEARCH_LEN
  let flatIndex = -1

  return (
    <div className="gsearch" ref={boxRef}>
      <span className="gsearch__ic">{IC.search}</span>
      <input
        ref={inputRef}
        className="gsearch__input"
        type="search"
        value={text}
        placeholder={t('Dars, material, o‘quvchi yoki xodim izlash…')}
        aria-label={t('Platforma bo‘ylab qidirish')}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="gsearch-list"
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat[active] ? `gsearch-opt-${active}` : undefined}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {text && (
        <button
          className="gsearch__clear"
          type="button"
          aria-label={t('Tozalash')}
          onClick={() => {
            setText('')
            setQ('')
            inputRef.current?.focus()
          }}
        >
          {IC.close}
        </button>
      )}
      {tooShort && <span className="gsearch__kbd">{t('kamida 2 harf')}</span>}

      {showPanel && (
        <div className="gsearch__pop" id="gsearch-list" role="listbox">
          {groups.map((g) => (
            <div className="gsearch__group" key={g.kind}>
              <p className="gsearch__gt">
                <span className="gsearch__gic">{IC[KIND_ICON[g.kind]]}</span>
                {t(g.label)}
              </p>
              {g.items.map((item) => {
                flatIndex += 1
                const i = flatIndex
                return (
                  <button
                    key={`${g.kind}-${item.id}`}
                    id={`gsearch-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={`gsearch__row ${i === active ? 'is-on' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                  >
                    <span className="gsearch__rt">{item.title}</span>
                    <span className="gsearch__rs">{item.subtitle}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {!groups.length && (
            <p className="gsearch__none">{isFetching ? t('Qidirilmoqda…') : t('Hech narsa topilmadi')}</p>
          )}
        </div>
      )}
    </div>
  )
}
