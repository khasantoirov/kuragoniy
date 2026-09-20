import type { ReactElement } from 'react'

// Ported 1:1 from js/icons.js — inline SVG, currentColor-based so it
// adapts to light/dark automatically, matching the old design exactly.
function wrap(paths: ReactElement): ReactElement {
  return (
    <svg className="svic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  )
}

export const IC = {
  edit: wrap(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  trash: wrap(<><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>),
  search: wrap(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  close: wrap(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  back: wrap(<><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>),
  external: wrap(<><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>),
  download: wrap(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>),
  upload: wrap(<><path d="M12 17V5" /><path d="m7 10 5-5 5 5" /><path d="M5 21h14" /></>),
  user: wrap(<><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>),
  users: wrap(<><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16 5.2a3.3 3.3 0 0 1 0 6.4" /><path d="M18.4 20a6.2 6.2 0 0 0-3-5.3" /></>),
  lock: wrap(<><rect x="4.5" y="11" width="15" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  unlock: wrap(<><rect x="4.5" y="11" width="15" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.6-2.3" /></>),
  grip: wrap(<><circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none" /></>),
  check2: wrap(<><path d="M1.5 12.5 6 17 14.5 7.5" /><path d="m11.5 14.5 2 2.5L22 8" /></>),
  megaphone: wrap(<><path d="M3 11v2a1 1 0 0 0 1 1h2l4.5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M14 8.5a4 4 0 0 1 0 7" /></>),
  chart: wrap(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>),
  grid: wrap(<><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>),
  list: wrap(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>),
  image: wrap(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>),
  play: wrap(<path d="M7 4v16l13-8Z" fill="currentColor" stroke="none" />),
  copy: wrap(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  move: wrap(<><path d="M5 12h14" /><path d="m13 5 7 7-7 7" /></>),
  file: wrap(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>),
  print: wrap(<><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></>),
  home: wrap(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /><path d="M9.5 21v-6h5v6" /></>),
  atom: wrap(<><circle cx="12" cy="12" r="1.2" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(120 12 12)" /></>),
  clipboard: wrap(<><rect x="8" y="2.5" width="8" height="4" rx="1" /><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" /><path d="M8 11h8" /><path d="M8 15h6" /></>),
  calendar: wrap(<><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M8 2.5v4" /><path d="M16 2.5v4" /><path d="M3 9.5h18" /></>),
  book: wrap(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>),
  settings: wrap(<><path d="M4 21v-6" /><path d="M4 11V3" /><path d="M12 21v-8" /><path d="M12 9V3" /><path d="M20 21v-4" /><path d="M20 13V3" /><path d="M1.5 15h5" /><path d="M9.5 9h5" /><path d="M17.5 17h5" /></>),
  flask: wrap(<><path d="M9 3h6" /><path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" /><path d="M7 14.5h10" /></>),
  target: wrap(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
  calc: wrap(<><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M8 6.5h8" /><path d="M8 11h.01" /><path d="M12 11h.01" /><path d="M16 11h.01" /><path d="M8 15h.01" /><path d="M12 15h.01" /><path d="M16 15h.01" /><path d="M8 18.5h.01" /><path d="M12 18.5h4" /></>),
  cards: wrap(<><rect x="3" y="7" width="13" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" /></>),
  star: wrap(<path d="M12 2.7 14.7 8.6 21.1 9.4 16.4 13.7 17.7 20.1 12 16.9 6.3 20.1 7.6 13.7 2.9 9.4 9.3 8.6Z" />),
  dice: wrap(<><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none" /></>),
  mail: wrap(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  eye: wrap(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: wrap(<><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.6M6.3 6.3C3.6 7.9 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.85" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>),
  bell: wrap(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  profile: wrap(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  logout: wrap(<><path d="M15 17l5-5-5-5" /><path d="M20 12H9" /><path d="M11 3H5v18h6" /></>),
  info: wrap(<><circle cx="12" cy="12" r="9.5" /><path d="M12 11v6" /><path d="M12 7.5h.01" /></>),
  gear: wrap(<><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13a7.6 7.6 0 0 0 .1-2l2-1.5-2-3.4-2.4.6a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.4-.6-2 3.4L4.5 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-.6a7.6 7.6 0 0 0 1.7 1L9 21h6l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.4.6 2-3.4Z" /></>),
  telegram: wrap(<path d="M21 4.5 3 11.3l6 2.2m12-9-2.2 14c-.15.95-1.28 1.35-2.02.75L13 15.6l-3 2.9v-4.3l9.3-8.4c.4-.35-.1-.55-.6-.25L7 13.5" />),
  instagram: wrap(<><rect x="3" y="3" width="18" height="18" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r=".9" fill="currentColor" stroke="none" /></>),
  youtube: wrap(<><rect x="2" y="5.5" width="20" height="13" rx="4" /><path d="M10 9.2v5.6l5-2.8Z" fill="currentColor" stroke="none" /></>),
} as const

export type IconName = keyof typeof IC

export function themeIconSun() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a7 7 0 0 0 9.5 9.5z" />
    </svg>
  )
}
export function themeIconMoon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  )
}
