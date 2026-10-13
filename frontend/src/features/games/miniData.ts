/** Content of the single-player mini-games (grades 7–9 physics). Plain
 * data so a teacher-facing editor or more items can be added later. */

export type MiniGameKey = 'units' | 'formulas' | 'truefalse' | 'convert'

export const MINI_GAMES: { key: MiniGameKey; title: string; desc: string; icon: string }[] = [
  { key: 'units', title: 'Birliklar', desc: "Kattalik va uning SI birligini toping. 10 savol, har biriga 10 soniya.", icon: '📏' },
  { key: 'formulas', title: 'Formula ustasi', desc: "Kattalikning to'g'ri formulasini tanlang.", icon: '🧮' },
  { key: 'truefalse', title: "To'g'ri yoki noto'g'ri", desc: '60 soniyada imkon qadar ko\'p fikrni baholang.', icon: '⚡' },
  { key: 'convert', title: 'Birlik konvertori', desc: "Birliklarni o'zgartiring: km/soat → m/s va boshqalar.", icon: '🔁' },
]

export const UNIT_PAIRS: [string, string][] = [
  ['Kuch', 'N (nyuton)'],
  ['Massa', 'kg (kilogramm)'],
  ['Uzunlik', 'm (metr)'],
  ['Vaqt', 's (sekund)'],
  ['Tezlik', 'm/s'],
  ['Tezlanish', 'm/s²'],
  ['Mexanik ish', 'J (joul)'],
  ['Quvvat', 'W (vatt)'],
  ['Bosim', 'Pa (paskal)'],
  ['Zichlik', 'kg/m³'],
  ['Hajm', 'm³'],
  ['Yuza', 'm²'],
  ['Tok kuchi', 'A (amper)'],
  ['Kuchlanish', 'V (volt)'],
  ['Elektr qarshilik', 'Ω (om)'],
  ['Elektr zaryadi', 'C (kulon)'],
  ['Absolyut harorat', 'K (kelvin)'],
  ['Chastota', 'Hz (gers)'],
  ['Impuls', 'kg·m/s'],
  ['Bikrlik', 'N/m'],
  ['Solishtirma issiqlik sig\'imi', 'J/(kg·°C)'],
]

/** [description, formula] — formulas use the same plain syntax as lesson
 * material (rendered by <Formula>). */
export const FORMULA_PAIRS: [string, string][] = [
  ['Tekis harakat tezligi', 'v = s/t'],
  ['Zichlik', 'rho = m/V'],
  ["Og'irlik kuchi", 'F = m*g'],
  ['Bosim', 'p = F/S'],
  ['Mexanik ish', 'A = F*s'],
  ['Quvvat', 'N = A/t'],
  ['Kinetik energiya', 'E_k = m*v^2/2'],
  ['Potensial energiya', 'E_p = m*g*h'],
  ['Om qonuni', 'I = U/R'],
  ['Elektr quvvati', 'P = U*I'],
  ['Arximed kuchi', 'F_A = rho*g*V'],
  ['Nyutonning ikkinchi qonuni', 'F = m*a'],
  ['Tezlanish', 'a = (v - v_0)/t'],
  ['Isitish uchun issiqlik miqdori', 'Q = c*m*Delta t'],
  ['Suyuqlik ustuni bosimi', 'p = rho*g*h'],
  ['Elastiklik kuchi (Guk qonuni)', 'F = k*x'],
  ['Jism impulsi', 'p = m*v'],
  ['Ishqalanish kuchi', 'F = mu*N'],
  ['Elektr tokining ishi', 'A = U*I*t'],
  ['Tebranish davri', 'T = t/N'],
]

export const TRUE_FALSE: [string, boolean][] = [
  ['Massaning SI birligi — kilogramm.', true],
  ['Tovush vakuumda tarqaladi.', false],
  ["Normal bosimda suv 100 °C da qaynaydi.", true],
  ["Yorug'lik tezligi tovush tezligidan kichik.", false],
  ['Kuch dinamometr bilan o\'lchanadi.', true],
  ['1 km = 100 m.', false],
  ["Metallar elektr tokini yaxshi o'tkazadi.", true],
  ['Bosimning birligi — joul.', false],
  ["Muz suvda cho'kadi.", false],
  ["Oy — Yerning tabiiy yo'ldoshi.", true],
  ['Bir xil ishorali zaryadlar bir-birini tortadi.', false],
  ['Erkin tushish tezlanishi taxminan 9,8 m/s².', true],
  ["Yig'uvchi linza yorug'lik nurlarini sindiradi.", true],
  ['Quvvatning birligi — vatt.', true],
  ['Har qanday jism isitilganda kichrayadi.', false],
  ['Kuchlanish voltmetr bilan o\'lchanadi.', true],
  ['Ampermetr zanjirga parallel ulanadi.', false],
  ["Zichligi suvnikidan katta jism suvda cho'kadi.", true],
  ['Balandlik oshgan sari atmosfera bosimi ortadi.', false],
  ["Tovush — mexanik to'lqin.", true],
  ["Tekis ko'zgu yorug'likni qaytaradi.", true],
  ["Magnitning ikkita qutbi bor: shimoliy va janubiy.", true],
  ["Ishqalanish kuchi doimo harakatga yordam beradi.", false],
  ['Termometr haroratni o\'lchaydi.', true],
  ['1 soat = 3600 sekund.', true],
  ["Jismga kuch ta'sir etmasa, u albatta to'xtab qoladi.", false],
  ["Elektr zanjirida tok kuchi amperlarda o'lchanadi.", true],
  ['Qattiq jismlarda molekulalar umuman harakatlanmaydi.', false],
]

export interface ConvertTask {
  q: string
  answer: number
  unit: string
}

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

const GENERATORS: (() => ConvertTask)[] = [
  () => { const v = pick([18, 36, 54, 72, 90, 108]); return { q: `${v} km/soat = ? m/s`, answer: v / 3.6, unit: 'm/s' } },
  () => { const v = pick([5, 10, 15, 20, 25, 30]); return { q: `${v} m/s = ? km/soat`, answer: v * 3.6, unit: 'km/soat' } },
  () => { const v = pick([1.5, 2, 3.2, 4.5, 0.8]); return { q: `${String(v).replace('.', ',')} km = ? m`, answer: v * 1000, unit: 'm' } },
  () => { const v = pick([150, 250, 80, 1200]); return { q: `${v} sm = ? m`, answer: v / 100, unit: 'm' } },
  () => { const v = pick([500, 250, 1500, 750]); return { q: `${v} g = ? kg`, answer: v / 1000, unit: 'kg' } },
  () => { const v = pick([2, 5, 10, 15]); return { q: `${v} minut = ? s`, answer: v * 60, unit: 's' } },
  () => { const v = pick([1.5, 2, 3]); return { q: `${String(v).replace('.', ',')} soat = ? minut`, answer: v * 60, unit: 'minut' } },
  () => { const v = pick([2, 5, 101, 0.5]); return { q: `${String(v).replace('.', ',')} kPa = ? Pa`, answer: v * 1000, unit: 'Pa' } },
  () => { const v = pick([250, 500, 50, 1500]); return { q: `${v} mA = ? A`, answer: v / 1000, unit: 'A' } },
  () => { const v = pick([2, 3.5, 0.4]); return { q: `${String(v).replace('.', ',')} t = ? kg`, answer: v * 1000, unit: 'kg' } },
  () => { const v = pick([500, 2000, 250]); return { q: `${v} l = ? m³`, answer: v / 1000, unit: 'm³' } },
  () => { const v = pick([3, 12, 0.5]); return { q: `${String(v).replace('.', ',')} kW = ? W`, answer: v * 1000, unit: 'W' } },
]

export function convertTasks(n = 10): ConvertTask[] {
  return Array.from({ length: n }, () => pick(GENERATORS)())
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
