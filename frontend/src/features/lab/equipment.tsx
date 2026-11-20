import type { ReactElement } from 'react'

import { SIM_CATS, SIMS, type Sim } from './sims'

/* ══ Laboratoriya jihozlari ═══════════════════════════════════
   Each piece of equipment has an icon (48×48, colours from the --eq-*
   variables in lab.css so it reads in light and dark mode) and the bench
   it lives on. SIM_EQUIP says which pieces an experiment uses — that's
   what the bench strip, the cabinet and the experiment's "Jihozlar" list
   are built from. */

export type BenchId = 'mex' | 'molterm' | 'elkt' | 'opt'

export const BENCHES: { id: BenchId; label: string; sub: string; color: string }[] = [
  { id: 'mex', label: 'Mexanika', sub: "Harakat, kuch, energiya, bosim", color: '#1B6E5F' },
  { id: 'molterm', label: 'Issiqlik hodisalari', sub: 'Gaz qonunlari, issiqlik, faza o‘zgarishi', color: '#B3372B' },
  { id: 'elkt', label: 'Elektr va magnetizm', sub: "Tok, zanjir, maydon, induksiya", color: '#0052CC' },
  { id: 'opt', label: 'Optika', sub: "Yorug'lik, linza, oyna, prizma", color: '#C2410C' },
]

export const benchOf = (simId: string) => SIM_CATS[simId] as BenchId | undefined
export const simsOfBench = (bench: BenchId) => SIMS.filter((s) => SIM_CATS[s.id] === bench)

const L = 'var(--eq-line)'
const METAL = 'var(--eq-metal)'
const GLASS = 'var(--eq-glass)'
const WOOD = 'var(--eq-wood)'
const DARK = 'var(--eq-dark)'
const PAPER = 'var(--eq-paper)'
const s2 = { stroke: L, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

function gauge(letter: string, color: string): ReactElement {
  return (
    <>
      <rect x="7" y="10" width="34" height="30" rx="4" fill={DARK} {...s2} />
      <path d="M12 31a12 12 0 0 1 24 0" fill={PAPER} {...s2} />
      <path d="M15 27l2 1M24 19v2M33 27l-2 1M19 21l1 2M29 21l-1 2" stroke={L} strokeWidth="1.4" />
      <path d="M24 31l6-8" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="31" r="2" fill={L} />
      <text x="24" y="38.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={PAPER} fontFamily="system-ui, sans-serif">{letter}</text>
    </>
  )
}

export type EquipId =
  | 'stand' | 'cart' | 'ramp' | 'block' | 'stopwatch' | 'ruler' | 'dynamometer' | 'weights' | 'spring' | 'pulley'
  | 'lever' | 'balance' | 'cylinder' | 'ball' | 'hydraulic' | 'barometer'
  | 'burner' | 'thermometer' | 'flask' | 'calorimeter' | 'syringe' | 'manometer' | 'capillary' | 'engine'
  | 'battery' | 'ammeter' | 'voltmeter' | 'resistor' | 'bulb' | 'capacitor' | 'coil' | 'magnet' | 'compass'
  | 'electroscope' | 'transformer' | 'electrolyzer' | 'motor'
  | 'lamp' | 'lens' | 'mirror' | 'prism' | 'screen' | 'protractor' | 'glassblock' | 'solarpanel' | 'luxmeter' | 'camerabox'

export interface Equip {
  name: string
  bench: BenchId
  hint: string
  icon: ReactElement
}

export const EQUIP: Record<EquipId, Equip> = {
  // ── Mexanika ────────────────────────────────────────────
  stand: {
    name: 'Shtativ va mayatnik', bench: 'mex', hint: "Jismlarni osish, mayatnik tebranishlari",
    icon: <><rect x="8" y="40" width="22" height="4" rx="1" fill={METAL} {...s2} /><path d="M13 40V7h22" fill="none" {...s2} /><path d="M32 7l-6 22" stroke={L} strokeWidth="1.4" /><circle cx="26" cy="31" r="4" fill="#E0A82E" {...s2} /></>,
  },
  cart: {
    name: 'Aravacha', bench: 'mex', hint: "To'g'ri chiziqli harakat, impuls, to'qnashuv",
    icon: <><rect x="7" y="20" width="34" height="12" rx="2" fill="#3B82F6" {...s2} /><path d="M11 20v-4h10v4" fill="none" {...s2} /><circle cx="14" cy="35" r="4" fill={DARK} {...s2} /><circle cx="34" cy="35" r="4" fill={DARK} {...s2} /><path d="M4 41h40" {...s2} /></>,
  },
  ramp: {
    name: 'Qiya tekislik', bench: 'mex', hint: 'Burchak, ishqalanish va tezlanish',
    icon: <><path d="M5 40h38V14z" fill={WOOD} {...s2} /><rect x="22" y="16" width="10" height="7" rx="1" transform="rotate(-34 27 20)" fill="#3B82F6" {...s2} /><path d="M12 40a8 8 0 0 0-1-5" fill="none" stroke={L} strokeWidth="1.4" /></>,
  },
  block: {
    name: "Yog'och brusok", bench: 'mex', hint: 'Ishqalanish kuchini o‘lchash',
    icon: <><path d="M8 22l10-6h22l-10 6z" fill="#D9A066" {...s2} /><path d="M8 22h22v14H8z" fill={WOOD} {...s2} /><path d="M30 22l10-6v14l-10 6z" fill="#8A5A2B" {...s2} /><circle cx="19" cy="29" r="1.6" fill={L} /></>,
  },
  stopwatch: {
    name: 'Sekundomer', bench: 'mex', hint: "Vaqtni o'lchash",
    icon: <><circle cx="24" cy="27" r="15" fill={PAPER} {...s2} /><path d="M21 7h6M24 7v5M36 14l3-3" {...s2} /><path d="M24 27V18M24 27l6 4" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" /><circle cx="24" cy="27" r="1.8" fill={L} /></>,
  },
  ruler: {
    name: "O'lchov chizg'ichi", bench: 'mex', hint: "Masofa va uzunlikni o'lchash",
    icon: <><rect x="4" y="18" width="40" height="12" rx="1.5" fill="#FACC15" {...s2} /><path d="M9 18v5M14 18v3M19 18v5M24 18v3M29 18v5M34 18v3M39 18v5" stroke={L} strokeWidth="1.4" /></>,
  },
  dynamometer: {
    name: 'Dinamometr', bench: 'mex', hint: "Kuchni o'lchash (N)",
    icon: <><path d="M24 3v4" {...s2} /><rect x="16" y="7" width="16" height="28" rx="3" fill={METAL} {...s2} /><path d="M20 12h3M20 17h3M20 22h3M20 27h3" stroke={L} strokeWidth="1.3" /><path d="M27 11v14" stroke="#DC2626" strokeWidth="2" /><path d="M24 35v4m-3 0h6l-3 6z" fill={L} {...s2} /></>,
  },
  weights: {
    name: "Yuklar to'plami", bench: 'mex', hint: "Massasi ma'lum yuklar",
    icon: <><path d="M12 42h24l-3-10H15z" fill={METAL} {...s2} /><path d="M16 30h16l-2-8H18z" fill={METAL} {...s2} /><path d="M19 20h10l-1.5-6h-7z" fill={METAL} {...s2} /><path d="M22 14v-4h4v4" fill="none" {...s2} /></>,
  },
  spring: {
    name: 'Prujina', bench: 'mex', hint: 'Elastiklik, Guk qonuni',
    icon: <><path d="M14 5h20" {...s2} /><path d="M24 5v4l-8 3 16 4-16 4 16 4-16 4 16 4-8 3v4" fill="none" {...s2} /><rect x="18" y="39" width="12" height="6" rx="1" fill="#E0A82E" {...s2} /></>,
  },
  pulley: {
    name: 'Blok (kasnak)', bench: 'mex', hint: 'Atvud mashinasi, kuchdan yutish',
    icon: <><path d="M24 3v8" {...s2} /><circle cx="24" cy="16" r="7" fill={METAL} {...s2} /><circle cx="24" cy="16" r="2" fill={L} /><path d="M17 16v18M31 16v12" stroke={L} strokeWidth="1.5" /><rect x="12" y="34" width="10" height="9" rx="1" fill="#3B82F6" {...s2} /><rect x="27" y="28" width="8" height="8" rx="1" fill="#E0A82E" {...s2} /></>,
  },
  lever: {
    name: 'Richag', bench: 'mex', hint: 'Moment qonuni, muvozanat',
    icon: <><path d="M4 22l40-4" stroke={WOOD} strokeWidth="4" strokeLinecap="round" /><path d="M24 20l-7 20h14z" fill={METAL} {...s2} /><rect x="6" y="24" width="7" height="8" rx="1" fill="#3B82F6" {...s2} /><rect x="35" y="20" width="7" height="10" rx="1" fill="#E0A82E" {...s2} /></>,
  },
  balance: {
    name: 'Tarozi', bench: 'mex', hint: "Massani o'lchash",
    icon: <><path d="M24 8v30M16 42h16M24 38l-6 4M24 38l6 4" fill="none" {...s2} /><path d="M8 13h32" {...s2} /><path d="M8 13l-5 12h10zM40 13l-5 12h10z" fill={METAL} {...s2} /><circle cx="24" cy="8" r="2.5" fill={L} /></>,
  },
  cylinder: {
    name: 'Menzurka', bench: 'mex', hint: "Suyuqlik hajmini o'lchash",
    icon: <><path d="M15 6h18M17 6v34a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V6" fill={GLASS} {...s2} /><path d="M18 22h12v18a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" fill="#38BDF8" opacity=".75" /><path d="M17 12h5M17 18h3M17 24h5M17 30h3M17 36h5" stroke={L} strokeWidth="1.3" /></>,
  },
  ball: {
    name: 'Po‘lat sharcha', bench: 'mex', hint: "Erkin tushish, otilgan jism",
    icon: <><circle cx="24" cy="22" r="13" fill={METAL} {...s2} /><circle cx="19" cy="17" r="4" fill="#fff" opacity=".7" /><path d="M14 42h20" {...s2} /></>,
  },
  hydraulic: {
    name: 'Gidravlik press', bench: 'mex', hint: 'Paskal qonuni',
    icon: <><path d="M6 20h8v20h20V14h8v26a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill={GLASS} {...s2} /><path d="M8 26h4v14h24V22h4v18H8z" fill="#38BDF8" opacity=".7" /><path d="M4 20h12M32 14h12" {...s2} /><path d="M10 20v-8M38 14V8" {...s2} /></>,
  },
  barometer: {
    name: 'Barometr', bench: 'mex', hint: "Atmosfera bosimini o'lchash",
    icon: gauge('hPa', '#0EA5E9'),
  },
  // ── Issiqlik ────────────────────────────────────────────
  burner: {
    name: 'Spirt lampa', bench: 'molterm', hint: 'Qizdirish uchun olov manbai',
    icon: <><path d="M24 6c5 6 6 10 3 15h-6c-3-5-2-9 3-15z" fill="#F97316" {...s2} /><path d="M24 12c2 3 2 6 1 8h-2c-1-2-1-5 1-8z" fill="#FDE047" /><path d="M22 21h4v5h-4z" fill={METAL} {...s2} /><path d="M12 36a12 10 0 0 1 24 0v5H12z" fill={GLASS} {...s2} /><path d="M14 36h20v5H14z" fill="#A5B4FC" opacity=".6" /></>,
  },
  thermometer: {
    name: 'Termometr', bench: 'molterm', hint: "Haroratni o'lchash (°C)",
    icon: <><path d="M20 30V8a4 4 0 0 1 8 0v22a8 8 0 1 1-8 0z" fill={GLASS} {...s2} /><path d="M22.5 31V16h3v15" stroke="#DC2626" strokeWidth="3" /><circle cx="24" cy="36" r="5" fill="#DC2626" /><path d="M30 12h3M30 17h2M30 22h3" stroke={L} strokeWidth="1.3" /></>,
  },
  flask: {
    name: 'Kolba', bench: 'molterm', hint: 'Suyuqlikni qizdirish',
    icon: <><path d="M19 5h10M20 5v12L9 38a3 3 0 0 0 3 5h24a3 3 0 0 0 3-5L28 17V5" fill={GLASS} {...s2} /><path d="M14 30h20l4 8a2 2 0 0 1-2 3H12a2 2 0 0 1-2-3z" fill="#22C55E" opacity=".7" /><circle cx="20" cy="35" r="1.5" fill="#fff" /><circle cx="27" cy="33" r="1.2" fill="#fff" /></>,
  },
  calorimeter: {
    name: 'Kalorimetr', bench: 'molterm', hint: 'Issiqlik miqdorini o‘lchash',
    icon: <><rect x="8" y="14" width="32" height="28" rx="3" fill={METAL} {...s2} /><rect x="13" y="18" width="22" height="20" rx="2" fill={GLASS} {...s2} /><path d="M14 26h20v10a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2z" fill="#38BDF8" opacity=".7" /><path d="M6 14h36" {...s2} /><path d="M29 14V4" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" /></>,
  },
  syringe: {
    name: 'Porshenli silindr', bench: 'molterm', hint: 'Gaz hajmi va bosimi',
    icon: <><rect x="8" y="16" width="28" height="16" rx="2" fill={GLASS} {...s2} /><path d="M22 16v16" {...s2} /><path d="M22 24h20M42 18v12" {...s2} /><circle cx="13" cy="21" r="1.4" fill={L} /><circle cx="17" cy="27" r="1.4" fill={L} /><circle cx="12" cy="28" r="1.4" fill={L} /><path d="M8 24H4" {...s2} /></>,
  },
  manometer: {
    name: 'Manometr', bench: 'molterm', hint: "Gaz bosimini o'lchash",
    icon: gauge('kPa', '#DC2626'),
  },
  capillary: {
    name: 'Kapillyar naychalar', bench: 'molterm', hint: "Ho'llash va kapillyar hodisalar",
    icon: <><path d="M5 30h38v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill={GLASS} {...s2} /><path d="M6 33h36v7H6z" fill="#38BDF8" opacity=".7" /><path d="M14 6v32M22 10v28M30 14v24" stroke={L} strokeWidth="2" /><path d="M14 12v21M22 18v15M30 24v9" stroke="#38BDF8" strokeWidth="2.6" /></>,
  },
  engine: {
    name: 'Dvigatel modeli', bench: 'molterm', hint: 'Issiqlik dvigateli, 4 takt',
    icon: <><rect x="14" y="6" width="20" height="24" rx="2" fill={METAL} {...s2} /><rect x="17" y="16" width="14" height="7" fill="#9CA3AF" {...s2} /><path d="M24 23v9" {...s2} /><circle cx="24" cy="36" r="7" fill={METAL} {...s2} /><path d="M24 36l5 3" {...s2} /><path d="M14 10H8M34 10h6" {...s2} /></>,
  },
  // ── Elektr ──────────────────────────────────────────────
  battery: {
    name: 'Tok manbai', bench: 'elkt', hint: 'Zanjirga kuchlanish beradi',
    icon: <><rect x="6" y="14" width="34" height="22" rx="3" fill={DARK} {...s2} /><rect x="40" y="20" width="4" height="10" rx="1" fill={METAL} {...s2} /><rect x="6" y="14" width="12" height="22" rx="3" fill="#E0A82E" /><path d="M24 25h8M28 21v8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></>,
  },
  ammeter: { name: 'Ampermetr', bench: 'elkt', hint: "Tok kuchini o'lchash (A)", icon: gauge('A', '#DC2626') },
  voltmeter: { name: 'Voltmetr', bench: 'elkt', hint: "Kuchlanishni o'lchash (V)", icon: gauge('V', '#2563EB') },
  resistor: {
    name: 'Reostat (rezistor)', bench: 'elkt', hint: "Qarshilikni o'zgartirish",
    icon: <><path d="M3 24h8l3-7 5 14 5-14 5 14 5-14 3 7h8" fill="none" {...s2} /><rect x="16" y="10" width="16" height="4" rx="2" fill={METAL} {...s2} /><path d="M24 14v4" {...s2} /></>,
  },
  bulb: {
    name: 'Lampochka', bench: 'elkt', hint: 'Tok o‘tishini ko‘rsatadi',
    icon: <><path d="M24 4a12 12 0 0 0-7 22v5h14v-5A12 12 0 0 0 24 4z" fill="#FDE047" {...s2} /><path d="M21 22l3-6 3 6" fill="none" stroke="#B45309" strokeWidth="1.5" /><rect x="17" y="31" width="14" height="8" rx="1" fill={METAL} {...s2} /><path d="M17 35h14" stroke={L} strokeWidth="1.3" /><path d="M21 39h6l-1 4h-4z" fill={L} /></>,
  },
  capacitor: {
    name: 'Kondensator', bench: 'elkt', hint: "Zaryad to'playdi",
    icon: <><path d="M4 24h14M30 24h14" {...s2} /><path d="M18 10v28M30 10v28" stroke={L} strokeWidth="3.5" strokeLinecap="round" /><path d="M21 15v18M27 15v18" stroke="#3B82F6" strokeWidth="1.4" strokeDasharray="2 2" /></>,
  },
  coil: {
    name: "G'altak (solenoid)", bench: 'elkt', hint: 'Magnit maydon, induksiya',
    icon: <><rect x="10" y="12" width="28" height="24" rx="3" fill="#B45309" {...s2} /><path d="M14 12v24M18 12v24M22 12v24M26 12v24M30 12v24M34 12v24" stroke="#FBBF24" strokeWidth="1.6" /><path d="M10 40H5M38 40h5M10 36v4M38 36v4" {...s2} /></>,
  },
  magnet: {
    name: 'Taqasimon magnit', bench: 'elkt', hint: 'Doimiy magnit maydoni',
    icon: <><path d="M10 40V20a14 14 0 0 1 28 0v20h-9V20a5 5 0 0 0-10 0v20z" fill="#DC2626" {...s2} /><path d="M10 34h9v6h-9zM29 34h9v6h-9z" fill={METAL} {...s2} /><text x="14.5" y="46.5" fontSize="5" textAnchor="middle" fill={L} fontWeight="700" fontFamily="system-ui">N</text><text x="33.5" y="46.5" fontSize="5" textAnchor="middle" fill={L} fontWeight="700" fontFamily="system-ui">S</text></>,
  },
  compass: {
    name: 'Magnit strelka', bench: 'elkt', hint: "Magnit maydon yo'nalishi",
    icon: <><circle cx="24" cy="24" r="17" fill={PAPER} {...s2} /><path d="M24 10l4 14h-8z" fill="#DC2626" /><path d="M24 38l-4-14h8z" fill="#2563EB" /><circle cx="24" cy="24" r="2" fill={L} /></>,
  },
  electroscope: {
    name: 'Elektroskop', bench: 'elkt', hint: 'Zaryadni aniqlaydi',
    icon: <><circle cx="24" cy="6" r="3.5" fill={METAL} {...s2} /><path d="M24 10v14" {...s2} /><path d="M12 42V22a12 10 0 0 1 24 0v20z" fill={GLASS} {...s2} /><path d="M24 24l-5 10M24 24l5 10" stroke="#E0A82E" strokeWidth="2.4" strokeLinecap="round" /><path d="M9 42h30" {...s2} /></>,
  },
  transformer: {
    name: 'Transformator', bench: 'elkt', hint: "Kuchlanishni o'zgartiradi",
    icon: <><rect x="8" y="8" width="32" height="32" rx="2" fill={METAL} {...s2} /><rect x="17" y="16" width="14" height="16" fill="var(--eq-bg)" {...s2} /><path d="M10 16h7M10 20h7M10 24h7M10 28h7M10 32h7" stroke="#B45309" strokeWidth="2" /><path d="M31 15h7M31 18h7M31 21h7M31 24h7M31 27h7M31 30h7M31 33h7" stroke="#B45309" strokeWidth="1.6" /></>,
  },
  electrolyzer: {
    name: 'Elektrolizer', bench: 'elkt', hint: 'Elektroliz tajribasi',
    icon: <><path d="M8 16h32v24a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill={GLASS} {...s2} /><path d="M9 24h30v16a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z" fill="#38BDF8" opacity=".6" /><path d="M17 8v28M31 8v28" stroke={L} strokeWidth="3.4" /><circle cx="20" cy="30" r="1.3" fill="#fff" /><circle cx="28" cy="26" r="1.3" fill="#fff" /><circle cx="20" cy="34" r="1" fill="#fff" /></>,
  },
  motor: {
    name: 'Elektr motor modeli', bench: 'elkt', hint: 'Dvigatel va generator',
    icon: <><path d="M6 12h8v24H6zM34 12h8v24h-8z" fill="#DC2626" {...s2} /><rect x="17" y="17" width="14" height="14" fill="none" stroke="#B45309" strokeWidth="2.4" transform="rotate(20 24 24)" /><path d="M24 31v9M20 40h8" {...s2} /></>,
  },
  // ── Optika ──────────────────────────────────────────────
  lamp: {
    name: "Yorug'lik manbai", bench: 'opt', hint: 'Lampa yoki lazer nuri',
    icon: <><rect x="5" y="14" width="18" height="14" rx="2" fill={DARK} {...s2} /><path d="M23 17l4-2v12l-4-2" fill={METAL} {...s2} /><path d="M27 21h16M27 18l14-6M27 24l14 6" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" /><path d="M14 28v12M8 40h12" {...s2} /></>,
  },
  lens: {
    name: 'Linza', bench: 'opt', hint: "Yig'uvchi va sochuvchi linzalar",
    icon: <><path d="M24 4c6 6 6 26 0 32-6-6-6-26 0-32z" fill={GLASS} {...s2} /><path d="M24 36v6M16 42h16" {...s2} /><path d="M21 12c-1 4-1 10 0 14" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></>,
  },
  mirror: {
    name: 'Oyna', bench: 'opt', hint: 'Tekis va qavariq oynalar',
    icon: <><rect x="14" y="5" width="20" height="30" rx="2" fill={GLASS} {...s2} /><path d="M18 12l8-5M18 20l12-8M22 26l8-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /><path d="M24 35v6M16 42h16" {...s2} /></>,
  },
  prism: {
    name: 'Prizma', bench: 'opt', hint: "Yorug'likning spektrga ajralishi",
    icon: <><path d="M3 22h13" stroke="#fff" strokeWidth="2.2" /><path d="M3 22h13" stroke={L} strokeWidth="1" /><path d="M24 7l14 28H10z" fill={GLASS} {...s2} /><path d="M31 22l14-4" stroke="#DC2626" strokeWidth="1.6" /><path d="M31 24l14 0" stroke="#EAB308" strokeWidth="1.6" /><path d="M31 26l14 4" stroke="#22C55E" strokeWidth="1.6" /><path d="M31 28l14 8" stroke="#6366F1" strokeWidth="1.6" /></>,
  },
  screen: {
    name: 'Ekran', bench: 'opt', hint: 'Tasvirni tutib oladi',
    icon: <><rect x="12" y="5" width="24" height="30" rx="1.5" fill={PAPER} {...s2} /><circle cx="24" cy="20" r="5" fill="#FACC15" opacity=".8" /><path d="M24 35v6M16 42h16" {...s2} /></>,
  },
  protractor: {
    name: 'Transportir', bench: 'opt', hint: "Burchakni o'lchash",
    icon: <><path d="M4 34a20 20 0 0 1 40 0z" fill={GLASS} {...s2} /><path d="M24 34l12-12" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" /><path d="M10 27l2 1M24 16v3M38 27l-2 1M15 20l2 2M33 20l-2 2" stroke={L} strokeWidth="1.3" /></>,
  },
  glassblock: {
    name: 'Shisha plastinka', bench: 'opt', hint: "Yorug'likning sinishi",
    icon: <><rect x="10" y="16" width="28" height="18" rx="1" fill={GLASS} {...s2} /><path d="M4 6l11 10 6 18 9 10" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  solarpanel: {
    name: 'Quyosh paneli', bench: 'opt', hint: 'Yorug‘likni elektrga aylantiradi',
    icon: <><path d="M6 30l8-18h28l-8 18z" fill="#1E3A8A" {...s2} /><path d="M10 21h30M17 12l-4 18M26 12l-4 18M34 12l-4 18" stroke="#93C5FD" strokeWidth="1.2" /><path d="M24 30v10M16 40h16" {...s2} /><circle cx="40" cy="6" r="3" fill="#FACC15" /></>,
  },
  luxmeter: { name: 'Luksmetr', bench: 'opt', hint: "Yoritilganlikni o'lchash", icon: gauge('lx', '#EAB308') },
  camerabox: {
    name: 'Kamera obskura', bench: 'opt', hint: 'Teshikli qora quti',
    icon: <><path d="M8 14h24v22H8z" fill={DARK} {...s2} /><path d="M32 14l8-4v30l-8-4" fill={PAPER} {...s2} /><circle cx="8" cy="25" r="1.6" fill="#FACC15" /><path d="M35 20v10" stroke="#FACC15" strokeWidth="2" /></>,
  },
}

/** Which equipment each experiment uses, in setup order. */
export const SIM_EQUIP: Record<string, EquipId[]> = {
  uniform: ['cart', 'ruler', 'stopwatch'],
  velocity_graph: ['cart', 'stopwatch', 'ruler'],
  distance_graph: ['cart', 'ruler', 'stopwatch'],
  acceleration: ['cart', 'ramp', 'stopwatch'],
  freefall: ['ball', 'stand', 'stopwatch', 'ruler'],
  vertical: ['ball', 'stopwatch', 'ruler'],
  projectile: ['ball', 'protractor', 'ruler'],
  density_mass_volume: ['balance', 'cylinder', 'weights'],
  circular: ['stand', 'ball', 'stopwatch'],
  centripetal: ['ball', 'dynamometer', 'stopwatch'],
  gravity_comp: ['weights', 'ruler'],
  pressure: ['dynamometer', 'weights', 'ruler'],
  elastic_deformation: ['spring', 'dynamometer', 'ruler'],
  rope_tension: ['stand', 'weights', 'dynamometer'],
  newton2: ['cart', 'dynamometer', 'weights'],
  friction: ['block', 'dynamometer', 'weights'],
  inclined: ['ramp', 'block', 'protractor'],
  impulse: ['cart', 'dynamometer', 'stopwatch'],
  elastic_collision: ['cart', 'balance', 'ruler'],
  atwood: ['pulley', 'weights', 'stand', 'stopwatch'],
  buoyancy: ['cylinder', 'dynamometer', 'weights'],
  potential: ['weights', 'ruler', 'stand'],
  work_power: ['dynamometer', 'ruler', 'stopwatch'],
  kinetic: ['cart', 'balance', 'stopwatch'],
  energy_cons: ['stand', 'ball', 'ruler'],
  leverage: ['lever', 'weights', 'ruler'],
  center_mass: ['lever', 'weights'],
  relative_motion: ['cart', 'stopwatch'],
  vector_addition: ['dynamometer', 'protractor'],
  bernoulli: ['manometer', 'cylinder'],
  continuity: ['cylinder', 'stopwatch'],
  newton_first_third: ['cart', 'spring'],
  pascal_law: ['hydraulic', 'weights'],
  atmospheric_pressure: ['barometer', 'cylinder'],
  gas: ['syringe', 'manometer', 'thermometer'],
  ideal_gas_combined: ['syringe', 'manometer', 'thermometer'],
  temperature: ['flask', 'manometer', 'thermometer', 'burner'],
  boyle_law: ['syringe', 'manometer'],
  charles_law: ['syringe', 'thermometer', 'burner'],
  heat_transfer: ['burner', 'thermometer', 'ruler'],
  heat_capacity: ['calorimeter', 'thermometer', 'burner'],
  thermal_expansion: ['burner', 'thermometer', 'ruler'],
  phase_change: ['flask', 'burner', 'thermometer'],
  carnot_cycle: ['engine', 'thermometer'],
  calorimetry: ['calorimeter', 'thermometer', 'balance'],
  adiabatic_process: ['syringe', 'manometer', 'thermometer'],
  surface_tension: ['dynamometer', 'flask'],
  internal_combustion: ['engine'],
  combustion_heat: ['burner', 'calorimeter', 'balance'],
  crystal_amorphous: ['burner', 'thermometer', 'stopwatch'],
  wetting_capillary: ['capillary', 'flask'],
  coulomb_force: ['electroscope', 'ruler'],
  electric_field: ['electroscope'],
  circuit_diagram: ['battery', 'bulb', 'resistor'],
  ohm: ['battery', 'ammeter', 'voltmeter', 'resistor'],
  wire_resistance: ['battery', 'ammeter', 'resistor', 'ruler'],
  joule_heating: ['battery', 'resistor', 'calorimeter', 'thermometer'],
  capacitor: ['capacitor', 'battery', 'voltmeter'],
  solenoid: ['coil', 'battery', 'compass'],
  magnetism_types: ['magnet', 'compass'],
  em_field_comparison: ['electroscope', 'magnet'],
  parallel_wires: ['battery', 'ammeter', 'compass'],
  faraday: ['coil', 'magnet', 'ammeter'],
  lenz: ['coil', 'magnet', 'ammeter'],
  transformer: ['transformer', 'voltmeter', 'battery'],
  series_parallel_resistors: ['battery', 'resistor', 'ammeter', 'voltmeter'],
  capacitors_series_parallel: ['capacitor', 'battery', 'voltmeter'],
  electrolysis: ['electrolyzer', 'battery', 'ammeter', 'stopwatch'],
  motor_generator: ['motor', 'magnet', 'battery'],
  electrification: ['electroscope'],
  electromagnetic_relay: ['coil', 'battery', 'bulb'],
  refraction: ['lamp', 'glassblock', 'protractor'],
  snell_law_demo: ['lamp', 'glassblock', 'protractor'],
  camera_obscura: ['camerabox', 'lamp'],
  total_internal_reflection: ['lamp', 'glassblock', 'protractor'],
  mirror: ['mirror', 'lamp', 'ruler'],
  convex_mirror: ['mirror', 'lamp'],
  lens: ['lens', 'lamp', 'screen', 'ruler'],
  concave_lens: ['lens', 'lamp', 'screen'],
  prism: ['prism', 'lamp', 'screen'],
  light_intensity: ['lamp', 'luxmeter', 'ruler'],
  heliotechnology: ['solarpanel', 'luxmeter', 'voltmeter'],
}

export const equipOf = (sim: Sim): EquipId[] => SIM_EQUIP[sim.id] ?? []

/** Experiments that use a piece of equipment. */
export const simsWith = (id: EquipId) => SIMS.filter((s) => SIM_EQUIP[s.id]?.includes(id))

/** Equipment used on a bench, most-used first. */
export function benchEquipment(bench: BenchId): EquipId[] {
  const count = new Map<EquipId, number>()
  for (const s of simsOfBench(bench)) for (const e of equipOf(s)) count.set(e, (count.get(e) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)
}

export function EquipIcon({ id, size = 40 }: { id: EquipId; size?: number }) {
  return (
    <svg className="eqic" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {EQUIP[id].icon}
    </svg>
  )
}
