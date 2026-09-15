export const NAV_STYLE_KEYS = [
  'raised',
  'liquid',
  'magnetic',
  'capsule',
  'segmented',
  'orbit',
  'wave',
  'neon',
  'blob',
  'cards',
  'minimal',
] as const

export type NavStyleKey = (typeof NAV_STYLE_KEYS)[number]

export const NAV_STYLES: { key: NavStyleKey; label: string; desc: string }[] = [
  { key: 'raised', label: 'Raised Action Dock', desc: "Faol ikonka qora yumaloq to'rtburchak fon bilan ajralib turadi" },
  { key: 'liquid', label: 'Liquid Floating Bar', desc: "Faol ikonka ortida yumshoq suyuq shakl sirpanib yuradi" },
  { key: 'magnetic', label: 'Magnetic Dock', desc: "Faol ikonka magnitdek to'rtburchak fonga ilashadi" },
  { key: 'capsule', label: 'Glass Capsule Dock', desc: 'Shishasimon panel, faol ikonka doira ichida' },
  { key: 'segmented', label: 'Segmented Dynamic Bar', desc: "Panel ikki bo'lakka ajratilgan, orasida bo'shliq" },
  { key: 'orbit', label: 'Orbit Navigation', desc: 'Faol ikonka atrofida ikkita kesishgan orbit aylanadi' },
  { key: 'wave', label: 'Wave Indicator Nav', desc: "Panel ostida to'lqin chizig'i faol ikonka tagida ko'tariladi" },
  { key: 'neon', label: 'Cyber Neon Dock', desc: "To'q panel, faol ikonka neon nur bilan yonadi" },
  { key: 'blob', label: 'Morphing Blob Nav', desc: "Rangli suyuq tomchi shakli faol ikonkaga qarab suzib o'tadi" },
  { key: 'cards', label: 'Layered Card Navigation', desc: "Faol ikonka qatlamli kartochkalar sifatida ko'tariladi" },
  { key: 'minimal', label: 'Minimal Luxury Dock', desc: "Juda soddalashtirilgan, faqat kichik nuqta belgisi" },
]
