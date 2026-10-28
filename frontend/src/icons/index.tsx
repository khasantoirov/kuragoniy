import type { ReactElement } from 'react'

// Emoji icons. Each emoji is drawn as text inside the old 24×24 icon box
// (svg.svic), so every size rule written for the line icons keeps working.
export function emojiIcon(char: string, className = ''): ReactElement {
  return (
    <svg className={`svic svic--emo ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize="19">{char}</text>
    </svg>
  )
}

export const IC = {
  edit: emojiIcon('✏️'),
  trash: emojiIcon('🗑️'),
  search: emojiIcon('🔍'),
  close: emojiIcon('✖️'),
  back: emojiIcon('⬅️'),
  external: emojiIcon('↗️'),
  menu: emojiIcon('☰'),
  chevron: emojiIcon('▶️'),
  arrowUp: emojiIcon('⬆️'),
  globe: emojiIcon('🌐'),
  download: emojiIcon('📥'),
  upload: emojiIcon('📤'),
  user: emojiIcon('👤'),
  users: emojiIcon('👥'),
  lock: emojiIcon('🔒'),
  unlock: emojiIcon('🔓'),
  grip: emojiIcon('↕️'),
  check2: emojiIcon('✅'),
  megaphone: emojiIcon('📢'),
  grid: emojiIcon('🔳'),
  list: emojiIcon('📃'),
  tasks: emojiIcon('📝'),
  image: emojiIcon('🖼️'),
  play: emojiIcon('▶️'),
  pause: emojiIcon('⏸️'),
  copy: emojiIcon('📑'),
  move: emojiIcon('➡️'),
  file: emojiIcon('📄'),
  report: emojiIcon('📨'),
  print: emojiIcon('🖨️'),
  home: emojiIcon('🏠'),
  atom: emojiIcon('⚛️'),
  chart: emojiIcon('📊'),
  clipboard: emojiIcon('📋'),
  calendar: emojiIcon('📅'),
  book: emojiIcon('📖'),
  lessons: emojiIcon('📘'),
  library: emojiIcon('📚'),
  settings: emojiIcon('🎛️'),
  flask: emojiIcon('🧪'),
  equipment: emojiIcon('🔬'),
  target: emojiIcon('🎯'),
  calc: emojiIcon('🧮'),
  cards: emojiIcon('🗂️'),
  shop: emojiIcon('🛒'),
  star: emojiIcon('⭐'),
  dice: emojiIcon('🎲'),
  mail: emojiIcon('✉️'),
  eye: emojiIcon('👁️'),
  eyeOff: emojiIcon('🙈'),
  bell: emojiIcon('🔔'),
  profile: emojiIcon('👤'),
  logout: emojiIcon('🚪'),
  info: emojiIcon('ℹ️'),
  guide: emojiIcon('🧭'),
  palette: emojiIcon('🎨'),
  plug: emojiIcon('🔌'),
  shield: emojiIcon('🛡️'),
  monitor: emojiIcon('🖥️'),
  smartphone: emojiIcon('📱'),
  archive: emojiIcon('🗄️'),
  undo: emojiIcon('↩️'),
  volume: emojiIcon('🔊'),
  gear: emojiIcon('⚙️'),
  telegram: emojiIcon('✈️'),
  instagram: emojiIcon('📸'),
  youtube: emojiIcon('📺'),
} as const

export type IconName = keyof typeof IC

// Named after the theme they switch away from: in light mode the toggle
// shows the moon, in dark mode the sun.
export function themeIconSun() {
  return emojiIcon('🌙', 'svic--theme')
}
export function themeIconMoon() {
  return emojiIcon('☀️', 'svic--theme')
}
