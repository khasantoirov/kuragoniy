import { useTranslation } from 'react-i18next'

/** External video links only (nothing is uploaded to the server):
 * YouTube, Vimeo, Google Drive and direct .mp4/.webm files are embedded;
 * anything else becomes a plain "open" link. */
export function parseVideo(url: string): { kind: 'iframe' | 'file' | 'link'; src: string } {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { kind: 'link', src: '' }
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}` }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
      if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}` }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/\/(\d+)/)?.[1]
      if (id) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}` }
    }
    if (host === 'drive.google.com') {
      const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id')
      if (id) return { kind: 'iframe', src: `https://drive.google.com/file/d/${id}/preview` }
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() }
    return { kind: 'link', src: u.toString() }
  } catch {
    return { kind: 'link', src: '' }
  }
}

export function VideoEmbed({ url, title, onEnded }: { url: string; title?: string; onEnded?: () => void }) {
  const { t } = useTranslation()
  const v = parseVideo(url)
  if (v.kind === 'iframe') {
    return (
      <div className="video">
        <iframe
          src={v.src}
          title={title || t('Video dars')}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }
  if (v.kind === 'file') {
    return (
      <div className="video">
        <video src={v.src} controls preload="metadata" onEnded={onEnded} />
      </div>
    )
  }
  if (!v.src) return null
  return (
    <a className="btn" href={v.src} target="_blank" rel="noopener noreferrer">
      {t('Videoni ochish')} ↗
    </a>
  )
}
