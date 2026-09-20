// sign-day.png / sign-night.png: 1188x243, siyoh butun rasmni egallaydi
// (chetlarida shaffof bo'shliq yo'q).
const W = 1188
const H = 243

// "KO'RAGONIY EDU" Roboto Condensed 700 da 6.90 em enga ega (brauzerda
// o'lchangan). Shrift o'lchami shunday tanlanganki, matnning TABIIY eni
// imzo eniga deyarli aynan teng keladi — textLength faqat ~0.1% tuzatadi,
// ya'ni harflar buzilmaydi.
const FONT_SIZE = 172
// Bosh harflar balandligi ~0.75 em (O va apostrof ustidan/ostidan biroz
// chiqadi) — katak balandligi va asosiy chiziq shundan.
const TEXT_H = 132
const BASELINE = 130

/** "KO'RAGONIY EDU" yozuvi va uning tagida "Muhandis D" imzosi — bir xil eni.
 *
 *  Balandligi bir xil EMAS, va bu ataylab: imzo rasmi 4.89:1, "KO'RAGONIY EDU"
 *  esa tabiiy holda ~9:1, ya'ni bir xil enda matn imzodan ~1.8 barobar past.
 *  Ikkalasini bir xil eni VA bo'yiga keltirishning yagona yo'li — matnni
 *  vertikal ~1.8 barobar siqib cho'zish, bu esa harflarni buzadi (avval
 *  shunday qilingan edi va xunuk chiqdi). Imzoni cho'zish esa mumkin emas.
 *  Shuning uchun matn to'g'ri proporsiyada qoladi, eni imzoga tenglashtiriladi.
 *
 *  Ikkala element ham width: 100%, imzo height: auto — rasm hech qachon
 *  cho'zilmaydi. Umumiy o'lchamni ota element belgilaydi (.brandmark
 *  kengligi, CSS'da). Kunduzgi/tungi imzo almashinuvi legacy.css'dagi
 *  .brand__sig--day / --night qoidalari orqali bo'ladi. */
export function BrandMark() {
  return (
    <span className="brandmark">
      <svg className="brandmark__name" viewBox={`0 0 ${W} ${TEXT_H}`} role="img" aria-label="KO'RAGONIY EDU">
        <text
          x="0"
          y={BASELINE}
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
