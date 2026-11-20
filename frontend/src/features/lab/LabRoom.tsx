import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { BENCHES, EQUIP, type BenchId, type EquipId } from './equipment'

/* ══ Virtual laboratoriya xonasi ═════════════════════════════
   One SVG scene (viewBox 1200×620): window, blackboard with formulas,
   a live wall clock, the equipment cabinet and four benches — mechanics,
   heat, electricity, optics — each with its own working apparatus
   (swinging pendulum, cart rolling down the ramp, flickering spirit lamp,
   current running through the wires, light through a lens). Benches and
   the cabinet are links. Colours come from --lab-* variables (lab.css)
   so the room has a night version too. */

const BENCH_X = [20, 315, 610, 905]
const BW = 275

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** A clickable part of the scene (bench, cabinet): Enter/Space work too. */
function Hot({ label, onGo, className, children }: { label: string; onGo: () => void; className: string; children: ReactNode }) {
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onGo()
    }
  }
  return (
    <g className={className} role="link" tabIndex={0} aria-label={label} onClick={onGo} onKeyDown={key}>
      <title>{label}</title>
      {children}
    </g>
  )
}

/** An equipment icon placed in the scene (cabinet shelves). */
function Item({ id, x, y, size = 40 }: { id: EquipId; x: number; y: number; size?: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 48 48" overflow="visible">
      {EQUIP[id].icon}
    </svg>
  )
}

function Bench({ x, children }: { x: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {/* body */}
      <rect x="10" y="440" width={BW - 20} height="128" rx="4" fill="var(--lab-bench)" stroke="var(--lab-line)" strokeWidth="1.5" />
      <rect x="22" y="502" width={(BW - 56) / 2} height="58" rx="3" fill="var(--lab-door)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x={34 + (BW - 56) / 2} y="502" width={(BW - 56) / 2} height="58" rx="3" fill="var(--lab-door)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x={BW / 2 - 16} y="528" width="10" height="4" rx="2" fill="var(--lab-handle)" />
      <rect x={BW / 2 + 6} y="528" width="10" height="4" rx="2" fill="var(--lab-handle)" />
      <rect x="16" y="566" width={BW - 32} height="8" fill="var(--lab-plinth)" />
      {/* top */}
      <path d={`M8 418 H${BW - 8} L${BW} 430 H0 Z`} fill="var(--lab-top)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="0" y="430" width={BW} height="12" rx="2" fill="var(--lab-top-edge)" stroke="var(--lab-line)" strokeWidth="1.2" />
      {children}
    </g>
  )
}

function Plate({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <g className="labroom__plate">
      <rect x={BW / 2 - 100} y="452" width="200" height="40" rx="8" fill={color} />
      <rect x={BW / 2 - 100} y="452" width="200" height="40" rx="8" fill="url(#lab-plate-shine)" />
      <text x={BW / 2} y="470" textAnchor="middle" className="labroom__plate-t">{label}</text>
      <text x={BW / 2} y="485" textAnchor="middle" className="labroom__plate-c">{count}</text>
    </g>
  )
}

/* ── Apparatus on each bench (local coordinates, table top at y≈418) ── */

function MechanicsKit({ motion }: { motion: boolean }) {
  // slope from (128,418) up to (262,338): 30.8°
  return (
    <>
      {/* stand + pendulum */}
      <rect x="22" y="412" width="58" height="8" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="31" y="292" width="6" height="122" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="31" y="295" width="78" height="6" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <circle cx="34" cy="298" r="5" fill="var(--eq-dark)" />
      <g>
        {motion && <animateTransform attributeName="transform" type="rotate" values="-18 104 301;18 104 301;-18 104 301" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />}
        <line x1="104" y1="301" x2="104" y2="382" stroke="var(--lab-line)" strokeWidth="1.4" />
        <circle cx="104" cy="390" r="10" fill="#E0A82E" stroke="var(--lab-line)" strokeWidth="1.4" />
        <circle cx="100" cy="386" r="3" fill="#fff" opacity=".6" />
      </g>
      {/* weights */}
      <rect x="86" y="407" width="30" height="11" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="90" y="399" width="22" height="8" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="94" y="393" width="14" height="6" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      {/* ramp + rolling cart */}
      <path d="M128 418 H262 V338 Z" fill="var(--eq-wood)" stroke="var(--lab-line)" strokeWidth="1.4" />
      <path d="M150 418 a24 24 0 0 0 -3 -12" fill="none" stroke="var(--lab-line)" strokeWidth="1.2" />
      <g transform="translate(236 353)">
        {motion && <animateTransform attributeName="transform" type="translate" values="236 353;160 399;160 399;236 353" keyTimes="0;0.7;0.85;1" dur="3.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.5 0 1 1;0 0 1 1;0.4 0 0.6 1" />}
        <g transform="rotate(-30.8)">
          <rect x="-16" y="-15" width="32" height="11" rx="2" fill="#3B82F6" stroke="var(--lab-line)" strokeWidth="1.3" />
          <circle cx="-9" cy="-3" r="3.6" fill="var(--eq-dark)" />
          <circle cx="9" cy="-3" r="3.6" fill="var(--eq-dark)" />
        </g>
      </g>
    </>
  )
}

function HeatKit({ motion }: { motion: boolean }) {
  const bubble = (cx: number, delay: string) => (
    <circle cx={cx} cy="352" r="2.2" fill="#fff" opacity={motion ? 0 : 0.8}>
      {motion && <animate attributeName="cy" values="353;336" dur="1.6s" begin={delay} repeatCount="indefinite" />}
      {motion && <animate attributeName="opacity" values="0;.9;0" dur="1.6s" begin={delay} repeatCount="indefinite" />}
    </circle>
  )
  const steam = (d: string, delay: string) => (
    <path d={d} fill="none" stroke="var(--lab-steam)" strokeWidth="3" strokeLinecap="round" opacity={motion ? 0 : 0.5}>
      {motion && <animate attributeName="opacity" values="0;.7;0" dur="3s" begin={delay} repeatCount="indefinite" />}
      {motion && <animateTransform attributeName="transform" type="translate" values="0 6;0 -8" dur="3s" begin={delay} repeatCount="indefinite" />}
    </path>
  )
  return (
    <>
      {/* tripod with gauze */}
      <path d="M48 418 L56 360 M102 418 L94 360 M75 418 V360" stroke="var(--eq-metal-dark)" strokeWidth="3" strokeLinecap="round" />
      <rect x="44" y="355" width="62" height="6" rx="1" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      {/* spirit lamp + flame */}
      <path d="M57 418 a18 15 0 0 1 36 0 Z" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <path d="M60 418 a15 9 0 0 1 30 0 Z" fill="#A5B4FC" opacity=".55" />
      <rect x="71" y="397" width="8" height="7" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1" />
      <g transform="translate(75 397)">
        <g>
          {motion && <animateTransform attributeName="transform" type="scale" values="1 1;0.9 1.12;1.06 0.94;0.95 1.06;1 1" dur="0.9s" repeatCount="indefinite" />}
          <path d="M0 -30 c 8 9 10 18 5 28 h -10 c -5 -10 -3 -19 5 -28 z" fill="#F97316" opacity=".95" />
          <path d="M0 -20 c 4 5 5 11 2 17 h -4 c -3 -6 -2 -12 2 -17 z" fill="#FDE047" />
        </g>
      </g>
      {/* flask on the gauze */}
      <path d="M69 292 H81 V318 L100 350 Q102 355 97 355 H53 Q48 355 50 350 L69 318 Z" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.4" />
      <path d="M60 333 H90 L100 350 Q102 355 97 355 H53 Q48 355 50 350 Z" fill="#F97316" opacity=".75" />
      {bubble(64, '0s')}{bubble(75, '.5s')}{bubble(86, '1s')}
      {steam('M72 286 q -6 -9 0 -18 q 6 -9 0 -18', '0s')}
      {steam('M79 286 q 6 -9 0 -18 q -6 -9 0 -18', '1.5s')}
      {/* thermometer in a clamp */}
      <rect x="132" y="412" width="40" height="8" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="146" y="298" width="8" height="104" rx="4" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <circle cx="150" cy="405" r="7.5" fill="#DC2626" stroke="var(--lab-line)" strokeWidth="1.2" />
      <rect x="148.5" y="330" width="3" height="72" fill="#DC2626">
        {motion && <animate attributeName="y" values="345;318;345" dur="6s" repeatCount="indefinite" />}
        {motion && <animate attributeName="height" values="57;84;57" dur="6s" repeatCount="indefinite" />}
      </rect>
      <path d="M156 310h5M156 320h3M156 330h5M156 340h3M156 350h5M156 360h3M156 370h5M156 380h3" stroke="var(--lab-line)" strokeWidth="1.1" />
      {/* beaker (calorimeter) with steam */}
      <path d="M192 350 h58 v60 a8 8 0 0 1 -8 8 h-42 a8 8 0 0 1 -8 -8 z" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.4" />
      <path d="M193 372 h56 v38 a7 7 0 0 1 -7 7 h-42 a7 7 0 0 1 -7 -7 z" fill="#38BDF8" opacity=".65" />
      <path d="M236 338 L226 400" stroke="var(--eq-metal-dark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M199 360h8M199 372h5M199 384h8M199 396h5" stroke="var(--lab-line)" strokeWidth="1.1" />
      {steam('M206 344 q -5 -8 0 -16 q 5 -8 0 -16', '.8s')}
      {steam('M220 344 q 5 -8 0 -16 q -5 -8 0 -16', '2.2s')}
    </>
  )
}

function ElectricKit({ motion }: { motion: boolean }) {
  const wire = (d: string, color: string, delay: string) => (
    <>
      <path d={d} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#FDE047" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="2 16" opacity={motion ? 1 : 0}>
        {motion && <animate attributeName="stroke-dashoffset" values="0;-36" dur="0.9s" begin={delay} repeatCount="indefinite" />}
      </path>
    </>
  )
  return (
    <>
      {/* battery */}
      <rect x="14" y="384" width="66" height="34" rx="4" fill="var(--eq-dark)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <rect x="14" y="384" width="20" height="34" rx="4" fill="#E0A82E" />
      <rect x="25" y="377" width="9" height="7" rx="1" fill="#DC2626" />
      <rect x="61" y="377" width="9" height="7" rx="1" fill="#1F2937" stroke="var(--lab-line)" strokeWidth=".8" />
      <text x="56" y="406" textAnchor="middle" className="labroom__mini">4.5 V</text>
      {/* ammeter */}
      <rect x="100" y="364" width="64" height="54" rx="6" fill="var(--eq-dark)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <path d="M110 402 a22 22 0 0 1 44 0 Z" fill="var(--eq-paper)" />
      <path d="M114 394l3 1.5M132 382v3M150 394l-3 1.5M121 386l2 2.2M143 386l-2 2.2" stroke="#334155" strokeWidth="1.2" />
      <g transform="rotate(18 132 402)">
        {motion && <animateTransform attributeName="transform" type="rotate" values="-38 132 402;22 132 402;12 132 402;22 132 402;-38 132 402" keyTimes="0;0.3;0.5;0.7;1" dur="5s" repeatCount="indefinite" />}
        <line x1="132" y1="402" x2="132" y2="384" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <circle cx="132" cy="402" r="2.4" fill="#334155" />
      <text x="132" y="413.5" textAnchor="middle" className="labroom__mini">A</text>
      <rect x="104" y="358" width="8" height="6" rx="1" fill="#DC2626" />
      <rect x="152" y="358" width="8" height="6" rx="1" fill="#1F2937" />
      {/* bulb */}
      <rect x="198" y="410" width="46" height="8" rx="2" fill="var(--eq-wood)" stroke="var(--lab-line)" strokeWidth="1.1" />
      <circle cx="221" cy="358" r="40" fill="url(#lab-glow)">
        {motion && <animate attributeName="opacity" values=".55;1;.7;1;.55" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      <rect x="208" y="384" width="26" height="26" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <path d="M208 392h26M208 400h26" stroke="var(--lab-line)" strokeWidth="1" />
      <path d="M221 334 a22 22 0 0 0 -11 41 v9 h22 v-9 a22 22 0 0 0 -11 -41 z" fill="#FEF08A" stroke="var(--lab-line)" strokeWidth="1.3" />
      <path d="M215 372 l3 -14 l3 8 l3 -8 l3 14" fill="none" stroke="#B45309" strokeWidth="1.4" />
      {/* wires with current */}
      {wire('M29 378 C 29 340, 100 336, 108 358', '#DC2626', '0s')}
      {wire('M156 358 C 168 326, 196 352, 210 392', '#DC2626', '.3s')}
      {wire('M234 398 C 266 398, 262 300, 150 302 C 76 304, 66 336, 66 377', '#1F2937', '.6s')}
    </>
  )
}

function OpticsKit({ motion }: { motion: boolean }) {
  return (
    <>
      {/* optical bench rail */}
      <rect x="10" y="408" width="256" height="10" rx="2" fill="var(--eq-metal)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <path d={Array.from({ length: 21 }, (_, i) => `M${18 + i * 12} 408v${i % 5 === 0 ? 6 : 3}`).join('')} stroke="var(--lab-line)" strokeWidth="1" />
      {/* light rays */}
      <g opacity=".9">
        {motion && <animate attributeName="opacity" values=".65;1;.65" dur="2.2s" repeatCount="indefinite" />}
        <path d="M64 362 L140 342 L140 390 L64 372 Z" fill="url(#lab-ray)" />
        <path d="M140 342 L243 371 L243 375 L140 390 Z" fill="url(#lab-ray2)" />
        <path d="M64 367 L243 373" stroke="#FDE047" strokeWidth="1" opacity=".7" />
      </g>
      {/* lamp */}
      <rect x="36" y="380" width="6" height="28" fill="var(--eq-metal-dark)" />
      <rect x="14" y="350" width="44" height="32" rx="5" fill="var(--eq-dark)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <path d="M20 356h8M20 362h8M20 368h8" stroke="#64748B" strokeWidth="1.5" />
      <circle cx="60" cy="367" r="7" fill="#FEF9C3" stroke="var(--lab-line)" strokeWidth="1.2" />
      {/* convex lens */}
      <rect x="137" y="392" width="6" height="16" fill="var(--eq-metal-dark)" />
      <ellipse cx="140" cy="366" rx="7" ry="27" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <path d="M137 350 q -2 16 0 32" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".8" />
      {/* screen with the image */}
      <rect x="240" y="394" width="6" height="14" fill="var(--eq-metal-dark)" />
      <rect x="226" y="330" width="34" height="66" rx="2" fill="var(--eq-paper)" stroke="var(--lab-line)" strokeWidth="1.3" />
      <ellipse cx="243" cy="373" rx="6" ry="8" fill="#FDE047" opacity=".85" />
      {/* prism with spectrum, front corner */}
      <path d="M176 418 L192 388 L208 418 Z" fill="var(--eq-glass)" stroke="var(--lab-line)" strokeWidth="1.2" />
      <path d="M200 404 L222 398 M200 406 L222 404 M200 408 L222 410 M200 410 L222 416" strokeWidth="2" strokeLinecap="round" stroke="#DC2626" />
      <path d="M200 406 L222 404" stroke="#EAB308" strokeWidth="2" strokeLinecap="round" />
      <path d="M200 408 L222 410" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
      <path d="M200 410 L222 416" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
    </>
  )
}

const KITS: Record<BenchId, (p: { motion: boolean }) => ReactNode> = {
  mex: MechanicsKit, molterm: HeatKit, elkt: ElectricKit, opt: OpticsKit,
}

export function LabRoom({ counts, onBench, onCabinet }: {
  counts: Record<BenchId, number>
  onBench: (b: BenchId) => void
  onCabinet: () => void
}) {
  const { t } = useTranslation()
  const motion = !useReducedMotion()
  const now = useClock()
  const minute = now.getMinutes() + now.getSeconds() / 60
  const hour = (now.getHours() % 12) + minute / 60
  const floorLines = Array.from({ length: 13 }, (_, i) => -300 + i * 150)

  return (
    <svg className="labroom" viewBox="0 0 1200 620" role="group" aria-label={t('Virtual fizika laboratoriyasi')}>
      <defs>
        <linearGradient id="lab-wall-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lab-wall-top)" />
          <stop offset="1" stopColor="var(--lab-wall)" />
        </linearGradient>
        <linearGradient id="lab-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lab-sky-top)" />
          <stop offset="1" stopColor="var(--lab-sky)" />
        </linearGradient>
        <linearGradient id="lab-plate-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lab-glow">
          <stop offset="0" stopColor="#FDE047" stopOpacity=".75" />
          <stop offset="1" stopColor="#FDE047" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lab-ray" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FDE047" stopOpacity=".6" />
          <stop offset="1" stopColor="#FDE047" stopOpacity=".25" />
        </linearGradient>
        <linearGradient id="lab-ray2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FDE047" stopOpacity=".25" />
          <stop offset="1" stopColor="#FDE047" stopOpacity=".7" />
        </linearGradient>
        <clipPath id="lab-floor-clip"><rect x="0" y="430" width="1200" height="190" /></clipPath>
        <clipPath id="lab-window-clip"><rect x="52" y="58" width="196" height="186" /></clipPath>
      </defs>

      {/* wall + floor */}
      <rect width="1200" height="430" fill="url(#lab-wall-g)" />
      <rect y="330" width="1200" height="100" fill="var(--lab-wainscot)" />
      <rect y="326" width="1200" height="6" fill="var(--lab-rail)" />
      <rect y="430" width="1200" height="190" fill="var(--lab-floor)" />
      <g clipPath="url(#lab-floor-clip)" stroke="var(--lab-floor-line)" strokeWidth="1.4">
        {[452, 482, 522, 572].map((y) => <line key={y} x1="0" y1={y} x2="1200" y2={y} />)}
        {floorLines.map((x) => <line key={x} x1={600 + (x - 600) * 0.35} y1="430" x2={x} y2="620" />)}
      </g>
      <rect y="428" width="1200" height="4" fill="var(--lab-skirting)" />

      {/* window */}
      <g>
        <rect x="40" y="46" width="220" height="210" rx="4" fill="var(--lab-frame)" />
        <rect x="52" y="58" width="196" height="186" fill="url(#lab-sky)" />
        <g clipPath="url(#lab-window-clip)">
          <circle cx="206" cy="96" r="18" fill="var(--lab-sun)" />
          <g fill="#fff" opacity=".85">
            {motion && <animateTransform attributeName="transform" type="translate" values="-40 0;150 0" dur="60s" repeatCount="indefinite" />}
            <ellipse cx="90" cy="120" rx="26" ry="9" />
            <ellipse cx="108" cy="113" rx="16" ry="9" />
          </g>
          <path d="M52 214 q 40 -26 80 -8 q 40 18 116 -12 V244 H52 Z" fill="var(--lab-hill)" />
        </g>
        <path d="M150 58 V244 M52 150 H248" stroke="var(--lab-frame)" strokeWidth="8" />
        <rect x="32" y="254" width="236" height="10" rx="2" fill="var(--lab-frame)" />
        {/* plant on the sill */}
        <path d="M218 254 l4 -22 h24 l4 22 z" fill="#B45309" />
        <path d="M234 232 c -14 -6 -18 -20 -12 -30 c 6 8 10 18 12 30 c 2 -14 8 -26 18 -30 c 2 12 -4 24 -18 30" fill="#16A34A" />
      </g>

      {/* blackboard */}
      <g className="labroom__board">
        <rect x="322" y="28" width="556" height="242" rx="6" fill="var(--lab-frame)" />
        <rect x="334" y="40" width="532" height="218" rx="2" fill="var(--lab-board)" />
        <text x="600" y="80" textAnchor="middle" className="labroom__chalk labroom__chalk--title">{t('Fizika laboratoriyasi')}</text>
        <path d="M440 92 H760" stroke="var(--lab-chalk)" strokeWidth="1.2" opacity=".5" />
        <g className="labroom__chalk">
          <text x="372" y="128">F = m·a</text>
          <text x="372" y="166">Eₖ = mv²/2</text>
          <text x="372" y="204">p = m·v</text>
          <text x="372" y="242">P = F / S</text>
          <text x="712" y="128">U = I·R</text>
          <text x="712" y="166">Q = cmΔt</text>
          <text x="712" y="204">n = sin α / sin β</text>
          <text x="712" y="242">E = mc²</text>
        </g>
        <g stroke="var(--lab-chalk)" fill="none" strokeLinecap="round" opacity=".85">
          <path d="M508 234 H690" strokeWidth="1.6" />
          <path d="M516 234 Q 598 96 680 234" strokeWidth="1.6" strokeDasharray="5 6" />
          <path d="M516 234 L548 192 M540 193 l8 -1 l-1 8" strokeWidth="1.8" />
        </g>
        <circle cx="598" cy="165" r="5" fill="var(--lab-chalk)" opacity=".9" />
        <text x="506" y="206" className="labroom__chalk labroom__chalk--small">v₀</text>
        <rect x="380" y="262" width="440" height="8" rx="2" fill="var(--lab-frame-dark)" />
        <rect x="430" y="257" width="22" height="5" rx="2" fill="#F8FAFC" />
        <rect x="470" y="258" width="14" height="4" rx="2" fill="#FDE68A" />
        <rect x="740" y="252" width="40" height="10" rx="2" fill="#475569" />
      </g>

      {/* wall clock (live) */}
      <g>
        <circle cx="915" cy="78" r="31" fill="var(--lab-clock)" stroke="var(--lab-frame)" strokeWidth="5" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="915" y1="52" x2="915" y2={i % 3 === 0 ? 58 : 55} stroke="#334155" strokeWidth={i % 3 === 0 ? 2.2 : 1.2} transform={`rotate(${i * 30} 915 78)`} />
        ))}
        <line x1="915" y1="78" x2="915" y2="62" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" transform={`rotate(${hour * 30} 915 78)`} />
        <line x1="915" y1="78" x2="915" y2="55" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${minute * 6} 915 78)`} />
        <circle cx="915" cy="78" r="2.6" fill="#DC2626" />
      </g>

      {/* equipment cabinet */}
      <Hot className="labroom__hot labroom__cabinet" label={t('Jihozlar shkafi')} onGo={onCabinet}>
        <rect x="956" y="40" width="218" height="232" rx="6" fill="var(--lab-frame)" />
        <rect x="966" y="50" width="198" height="212" rx="2" fill="var(--lab-cab-glass)" />
        <path d="M1000 50 L966 110 M1080 50 L990 262 M1110 50 L1030 262" stroke="#fff" strokeWidth="6" opacity=".08" />
        {[120, 190].map((y) => <rect key={y} x="966" y={y} width="198" height="6" fill="var(--lab-frame)" />)}
        <Item id="flask" x={972} y={74} size={44} />
        <Item id="magnet" x={1018} y={76} size={42} />
        <Item id="prism" x={1066} y={78} size={40} />
        <Item id="cylinder" x={1114} y={72} size={46} />
        <Item id="dynamometer" x={972} y={144} size={44} />
        <Item id="lens" x={1020} y={146} size={42} />
        <Item id="weights" x={1066} y={146} size={42} />
        <Item id="voltmeter" x={1114} y={148} size={42} />
        <Item id="battery" x={974} y={214} size={42} />
        <Item id="bulb" x={1020} y={212} size={44} />
        <Item id="stopwatch" x={1068} y={214} size={42} />
        <Item id="compass" x={1116} y={214} size={40} />
        <rect x="1014" y="26" width="102" height="22" rx="4" fill="#E0A82E" />
        <text x="1065" y="41.5" textAnchor="middle" className="labroom__label">{t('JIHOZLAR')}</text>
      </Hot>

      {/* benches */}
      {BENCHES.map((b, i) => {
        const Kit = KITS[b.id]
        return (
          <Hot key={b.id} className="labroom__hot labroom__bench" label={`${t(b.label)} — ${counts[b.id]} ${t('tajriba')}`} onGo={() => onBench(b.id)}>
            <rect className="labroom__halo" x={BENCH_X[i] - 6} y="280" width={BW + 12} height="300" rx="14" fill={b.color} />
            {/* The hover lift goes on this transform-free group: a CSS transform on
                Bench's own <g> would replace its translate() and throw it to x=0. */}
            <g className="labroom__lift">
              <Bench x={BENCH_X[i]}>
                <Kit motion={motion} />
                <Plate label={t(b.label)} count={`${counts[b.id]} ${t('tajriba')}`} color={b.color} />
              </Bench>
            </g>
          </Hot>
        )
      })}
    </svg>
  )
}
