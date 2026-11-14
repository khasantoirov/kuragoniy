import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'
import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { errText, fmtDateTime, PageHead, StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { isAdmin, isObserver, useAuth } from '@/lib/auth/AuthContext'

import './feed.css'

interface Author { id: string; name: string; photo: string | null }
interface FeedPost {
  id: number
  kind: 'post' | 'auto'
  body: string
  link_url: string
  is_pinned: boolean
  hidden: boolean
  created_at: string
  edited_at: string | null
  author: Author
  likes: number
  liked: boolean
  comments: number
  mine: boolean
}
interface FeedComment { id: number; body: string; created_at: string; mine: boolean; author: Author }

function useFeed() {
  return useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) =>
      (await api.get<{ posts: FeedPost[]; next: number | null }>('/feed/', { params: pageParam ? { before: pageParam } : {} })).data,
    getNextPageParam: (last) => last.next,
  })
}

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</>
}

function Composer() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [withLink, setWithLink] = useState(false)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await api.post('/feed/', { body, link_url: withLink ? link : '' })
      setBody('')
      setLink('')
      setWithLink(false)
      qc.invalidateQueries({ queryKey: ['feed'] })
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel fcompose">
      <textarea className="input" rows={3} maxLength={3000} value={body}
        placeholder={t("Hamkasblar bilan bo'lishing: darsda nima yaxshi ishladi, foydali havola yoki savol…")}
        onChange={(e) => setBody(e.target.value)} />
      {withLink && <input className="input" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />}
      <div className="fcompose__acts">
        {!withLink && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setWithLink(true)}>{IC.external} {t('Havola')}</button>}
        <button type="button" className="btn btn--primary" disabled={busy || !body.trim()} onClick={send}>{t('Joylash')}</button>
      </div>
    </section>
  )
}

function Comments({ post }: { post: FeedPost }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const canWrite = !isObserver(user)
  const { data, isLoading } = useQuery({
    queryKey: ['feed', 'comments', post.id],
    queryFn: async () => (await api.get<FeedComment[]>(`/feed/${post.id}/comments/`)).data,
  })
  const [body, setBody] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['feed'] })
  const send = async () => {
    try {
      await api.post(`/feed/${post.id}/comments/`, { body })
      setBody('')
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const remove = async (id: number) => {
    try {
      await api.delete(`/feed/comments/${id}/`)
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  return (
    <div className="fcomments">
      {isLoading && <Skeleton lines={1} />}
      {data?.map((c) => (
        <div key={c.id} className="fcomment">
          <Avatar name={c.author.name} photo={c.author.photo} className="fpost__av fpost__av--sm" />
          <div className="fcomment__body">
            <b>{c.author.name}</b> <small>{fmtDateTime(c.created_at)}</small>
            <p>{c.body}</p>
          </div>
          {(c.mine || isAdmin(user)) && <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={() => remove(c.id)}>{IC.close}</button>}
        </div>
      ))}
      {canWrite && (
        <div className="fcomment__new">
          <input className="input input--sm" maxLength={1000} value={body} placeholder={t('Izoh yozing…')}
            onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && body.trim()) send() }} />
          <button type="button" className="btn btn--sm" disabled={!body.trim()} onClick={send}>{t('Yuborish')}</button>
        </div>
      )}
    </div>
  )
}

function PostCard({ post }: { post: FeedPost }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const refresh = () => qc.invalidateQueries({ queryKey: ['feed'] })
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      refresh()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }
  const remove = async () => {
    if (!(await confirm({ title: t("Postni o'chirish"), text: post.body.slice(0, 120), danger: true }))) return
    run(() => api.delete(`/feed/${post.id}/`))
  }

  if (post.kind === 'auto') {
    return (
      <li className="fpost fpost--auto">
        <p>{post.body}</p>
        <small>{fmtDateTime(post.created_at)}</small>
        <button type="button" className={`fpost__like ${post.liked ? 'is-on' : ''}`} disabled={isObserver(user)}
          onClick={() => run(() => api.post(`/feed/${post.id}/like/`))}>👏 {post.likes || ''}</button>
        {admin && <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={remove}>{IC.trash}</button>}
      </li>
    )
  }
  return (
    <li className={`fpost ${post.is_pinned ? 'is-pinned' : ''} ${post.hidden ? 'is-hidden' : ''}`}>
      <div className="fpost__head">
        <Avatar name={post.author.name} photo={post.author.photo} className="fpost__av" />
        <div className="fpost__who">
          <b>{post.author.name}</b>
          <small>{fmtDateTime(post.created_at)}{post.edited_at ? ` · ${t('tahrirlangan')}` : ''}</small>
        </div>
        {post.is_pinned && <StatusPill tone="info">📌 {t('Mahkamlangan')}</StatusPill>}
        {post.hidden && <StatusPill tone="muted">{t('Yashirin')}</StatusPill>}
      </div>
      {editing ? (
        <div className="fpost__edit">
          <textarea className="input" rows={4} maxLength={3000} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="fcompose__acts">
            <button type="button" className="btn btn--sm" onClick={() => { setEditing(false); setDraft(post.body) }}>{t('Bekor qilish')}</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!draft.trim()}
              onClick={() => run(async () => { await api.patch(`/feed/${post.id}/`, { body: draft }); setEditing(false) })}>{t('Saqlash')}</button>
          </div>
        </div>
      ) : (
        <div className="fpost__body"><Paragraphs text={post.body} /></div>
      )}
      {post.link_url && <a className="fpost__link" href={post.link_url} target="_blank" rel="noreferrer noopener">{IC.external} {post.link_url.replace(/^https?:\/\//, '').slice(0, 80)}</a>}
      <div className="fpost__acts">
        <button type="button" className={`fpost__like ${post.liked ? 'is-on' : ''}`} disabled={isObserver(user)}
          onClick={() => run(() => api.post(`/feed/${post.id}/like/`))}>👍 {post.likes || ''} {t('Yoqdi')}</button>
        <button type="button" className="fpost__like" onClick={() => setOpen((o) => !o)}>💬 {post.comments || ''} {t('Izohlar')}</button>
        <span className="fpost__tools">
          {post.mine && !editing && <button type="button" className="icon-btn" aria-label={t('Tahrirlash')} onClick={() => setEditing(true)}>{IC.edit}</button>}
          {admin && <button type="button" className="icon-btn" aria-label={t('Mahkamlash')} title={t('Mahkamlash')}
            onClick={() => run(() => api.patch(`/feed/${post.id}/`, { is_pinned: !post.is_pinned }))}>📌</button>}
          {admin && !post.mine && <button type="button" className="icon-btn" aria-label={post.hidden ? t("Ko'rsatish") : t('Yashirish')}
            title={post.hidden ? t("Ko'rsatish") : t('Yashirish')}
            onClick={() => run(() => api.patch(`/feed/${post.id}/`, { hidden: !post.hidden }))}>{post.hidden ? IC.eye : IC.eyeOff}</button>}
          {(post.mine || admin) && <button type="button" className="icon-btn" aria-label={t("O'chirish")} onClick={remove}>{IC.trash}</button>}
        </span>
      </div>
      {open && <Comments post={post} />}
    </li>
  )
}

/** Ustozlar lentasi — teachers share with each other. */
export function FeedPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeed()
  const posts = data?.pages.flatMap((p) => p.posts) ?? []
  return (
    <div className="feed">
      <PageHead title={t('Ustozlar lentasi')} sub={t("Tajriba almashing: darsdagi g'oyalar, foydali havolalar, savollar. Platforma ham yangiliklarni shu yerga yozadi.")} />
      {!isObserver(user) && <Composer />}
      {isLoading && <Skeleton lines={6} />}
      {!isLoading && !posts.length && <EmptyState title={t("Lenta hali bo'sh")} hint={t("Birinchi bo'lib yozing — darsingizdagi qiziq bir lahza yoki foydali havola.")} />}
      <ul className="fposts">{posts.map((p) => <PostCard key={p.id} post={p} />)}</ul>
      {hasNextPage && (
        <button type="button" className="btn feed__more" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>{t("Ko'proq")}</button>
      )}
    </div>
  )
}
