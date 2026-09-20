// sign-day.png / sign-night.png: 1188x243, siyoh butun rasmni egallaydi
// (chetlarida shaffof bo'shliq yo'q). Matn katagi ham aynan shu o'lchamda.
const W = 1188
const H = 243

// Roboto Condensed'ning bosh harf balandligi ~0.711 em — matn katakning
// to'liq balandligini egallashi uchun shrift o'lchami shundan hisoblanadi.
const FONT_SIZE = H / 0.711

/** "KO'RAGONIY EDU" yozuvi va uning tagida "Muhandis D" imzosi — bir xil
 *  eni VA bir xil bo'yida.
 *
 *  Oddiy matn bilan buni qilib bo'lmaydi: imzo rasmi 4.89:1, "KO'RAGONIY EDU"
 *  esa tabiiy holda ~12:1, shuning uchun ikkalasini bir xil enga qo'ysak matn
 *  imzodan ancha past chiqadi. Rasmni cho'zish esa mumkin emas, shuning uchun
 *  moslashtirilgan narsa MATN: u imzo bilan bir xil nisbatli SVG katagiga
 *  qo'yiladi va textLength bilan katak eniga aniq keltiriladi.
 *
 *  Ikkala element ham width: 100% + bir xil nisbat, imzo esa height: auto —
 *  shuning uchun eni ham, bo'yi ham konstruksiya bo'yicha teng bo'ladi va
 *  rasm hech qachon cho'zilmaydi. Umumiy o'lchamni ota element belgilaydi
 *  (.brandmark kengligi, CSS'da). Kunduzgi/tungi imzo almashinuvi
 *  legacy.css'dagi .brand__sig--day / --night qoidalari orqali bo'ladi. */
export function BrandMark() {
  return (
    <span className="brandmark">
      <svg className="brandmark__name" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="KO'RAGONIY EDU">
        <text
          x="0"
          y={H}
          textLength={W}
          lengthAdjust="spacingAndGlyphs"
          fill="currentColor"
          fontFamily="'Roboto Condensed', Roboto, system-ui, sans-serif"
          fontWeight="700"
          fontSize={FONT_SIZE}
        >
          KO'RAGONIY EDU
        </text>
      </svg>
      <img className="brand__sig brand__sig--day" src="/sign-day.png" alt="Muhandis D" width={W} height={H} />
      <img className="brand__sig brand__sig--night" src="/sign-night.png" alt="Muhandis D" width={W} height={H} />
    </span>
  )
}
