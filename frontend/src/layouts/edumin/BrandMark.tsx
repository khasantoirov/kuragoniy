/** Brend yozuvi — "KO'RAGONIY". Imzosiz: matnning eni endi hech qanday
 * tashqi rasmga (avvalgi "Muhandis D" imzosiga) moslashtirilishi shart
 * emas, shu sabab avvalgi SVG o'lchash-va-cho'zish mexanizmi (textLength,
 * alohida viewBox) butunlay ortiqcha bo'lib qoldi — endi shunchaki matn.
 * O'lcham/balandlik konteyner CSS'i orqali (.edside__brand .brandmark /
 * .edtop__brand .brandmark, skin-edumin.css) belgilanadi, logotip bilan
 * bir xil balandlikda ko'rinishi uchun. */
export function BrandMark() {
  return <span className="brandmark">KO'RAGONIY</span>
}
