/** Brend belgisi — "KO'RAGONIY" yozuvi, uning tagida "Muhandis D" imzosi
 * (Amaliy Fizikadagi kabi). Imzoning kunduzgi rasmida yozuv to'q,
 * tungisida oq; D belgisi ikkalasida ham oq ramkali plitka ichida, shuning
 * uchun har qanday fonda to'g'ri o'qiladi. O'lcham konteyner CSS'i orqali
 * (.edside__brand / .edtop__brand, skin-edumin.css) beriladi. */
export function BrandMark() {
  return (
    <span className="brandmark">
      <span className="brandmark__name">KO'RAGONIY</span>
      <img className="brandmark__sig brandmark__sig--day" src="/muhandis-d-on-light.png" alt="Muhandis D" width={751} height={160} />
      <img className="brandmark__sig brandmark__sig--night" src="/muhandis-d-on-dark.png" alt="Muhandis D" width={751} height={160} />
    </span>
  )
}
