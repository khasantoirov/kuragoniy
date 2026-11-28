import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { RoleBadge } from '@/components/RoleBadge'
import { Skeleton } from '@/components/Skeleton'
import { IC } from '@/icons'
import type { User } from '@/lib/api/types'

import { type PeopleTab, useStaffList, useStudentAccounts } from './staffApi'
import './roles.css'

/* Boshqaruv paneli → Rollar: who is in each role, and what each role may
   do, as one table. Static reference, not read from the permission code —
   keep it in step by hand when backend accounts/models.py (is_admin and
   friends), common/adminhost.py or a view's permissions change. */

type RoleKey = 'dev' | 'admin' | 'boshliq' | 'kuzatuvchi' | 'maktab' | 'teacher' | 'student'

interface RoleInfo {
  key: RoleKey
  badge: Pick<User, 'is_dev_superuser' | 'role'>
  sub: string
  tab: PeopleTab
  count: (staff: User[]) => number
}

const ROLES: RoleInfo[] = [
  { key: 'dev', badge: { is_dev_superuser: true, role: 'teacher' }, tab: 'mamuriyat',
    sub: "Platformaning texnik egasi: hamma narsa, rollarni berish", count: (s) => s.filter((u) => u.is_dev_superuser).length },
  { key: 'admin', badge: { is_dev_superuser: false, role: 'admin' }, tab: 'mamuriyat',
    sub: "Boshqaruv admin.kuragoniy.uz'da; kuragoniy.uz'da o'qituvchi sifatida", count: (s) => s.filter((u) => !u.is_dev_superuser && u.role === 'admin').length },
  { key: 'boshliq', badge: { is_dev_superuser: false, role: 'boshliq' }, tab: 'mamuriyat',
    sub: "Rahbar: darslar va natijalarni nazorat qiladi", count: (s) => s.filter((u) => !u.is_dev_superuser && u.role === 'boshliq').length },
  { key: 'kuzatuvchi', badge: { is_dev_superuser: false, role: 'kuzatuvchi' }, tab: 'kuzatuvchilar',
    sub: "Inspektor yoki metodist: hammasini faqat ko'radi", count: (s) => s.filter((u) => !u.is_dev_superuser && u.role === 'kuzatuvchi').length },
  { key: 'maktab', badge: { is_dev_superuser: false, role: 'maktab' }, tab: 'maktab',
    sub: "Direktor yoki zavuch: faqat o'z maktabini ko'radi", count: (s) => s.filter((u) => !u.is_dev_superuser && u.role === 'maktab').length },
  { key: 'teacher', badge: { is_dev_superuser: false, role: 'teacher' }, tab: 'oqituvchilar',
    sub: "Darslar, o'z jurnali va dars jadvali", count: (s) => s.filter((u) => !u.is_dev_superuser && u.role === 'teacher').length },
  { key: 'student', badge: { is_dev_superuser: false, role: 'student' }, tab: 'oquvchilar',
    sub: "O'quvchi oynasi: darslar, vazifalar, natijalar", count: () => 0 },
]

type Kind = 'edit' | 'view' | 'own' | 'none'
type Cell = Kind | [Kind, string]

const KIND: Record<Kind, { label: string; icon?: keyof typeof IC }> = {
  edit: { label: 'Tahrirlaydi', icon: 'edit' },
  view: { label: "Ko'radi", icon: 'eye' },
  own: { label: "O'zinikini", icon: 'user' },
  none: { label: "Yo'q" },
}

// columns: dev, admin, boshliq, kuzatuvchi, maktab, teacher, student
const MATRIX: { area: string; sub?: string; cells: Cell[] }[] = [
  { area: 'Boshqaruv paneli', sub: 'admin.kuragoniy.uz',
    cells: ['edit', 'edit', 'none', 'none', 'none', 'none', 'none'] },
  { area: 'Xodim hisoblari', sub: "Yaratish, tasdiqlash, bloklash, parol",
    cells: ['edit', ['edit', "o'qituvchilarni"], 'none', 'none', 'none', 'none', 'none'] },
  { area: 'Rol berish', sub: 'Admin, Rahbar, Kuzatuvchi qilish',
    cells: ['edit', 'none', 'none', 'none', 'none', 'none', 'none'] },
  { area: 'Darslar', cells: ['edit', 'edit', 'edit', 'view', 'view', ['view', 'ochiq choraklar'], ['view', "o'z sinfi"]] },
  { area: 'Jurnal', cells: [['own', 'hammasini ko\'radi'], ['own', "hammasini ko'radi"], ['view', 'hammasini'],
    ['view', "Statistika'da"], ['view', "o'z maktabi"], 'own', 'none'] },
  { area: 'Dars jadvali', cells: ['edit', ['edit', 'hammaniki'], 'edit', 'view', 'none', ['own', "boshqalarnikini ko'radi"], 'none'] },
  { area: 'Kutubxona', cells: ['edit', 'edit', 'edit', 'view', 'view', 'view', 'none'] },
  { area: 'Statistika', cells: ['view', 'view', 'view', 'view', ['view', "o'z maktabi"], ['own', "o'z sinflari"], ['own', "o'z natijalari"]] },
  { area: 'Hamkor maktablar', cells: ['edit', 'edit', 'edit', 'view', ['view', "o'z maktabi"], 'none', 'none'] },
]

const DETAILS: Record<RoleKey, string[]> = {
  dev: [
    "Admin va Rahbarning barcha vakolatlariga ega",
    "Boshqa foydalanuvchini Admin, Rahbar yoki Kuzatuvchi qilishi (va bu huquqni olishi) mumkin — faqat u",
    "Boshqa admin, rahbar va dasturchi hisobini boshqaradi (bloklash, parolni tiklash, rad etish)",
    "Yuqoridagi «Rol» tugmasi bilan platformani boshqa rol yoki aniq odam ko'zi bilan ko'radi (faqat ko'rish)",
  ],
  admin: [
    "Boshqaruv paneliga (admin.kuragoniy.uz) kiradi: xodimlar, choraklar, modullar, himoya, litsenziyalar, o'quv yillari, sayt",
    "O'qituvchilarni yaratish, tasdiqlash, bloklash, parolini tiklash, fan biriktirish",
    "Darslarni qo'shish, tahrirlash, o'chirish (barcha choraklar), choraklarni ochish va yopish",
    "Kutubxonaga material qo'shish, e'lon yuborish, darslar va tarjimalarni import-eksport qilish",
    "Har qanday o'qituvchining dars jadvalini tahrirlaydi; barcha o'qituvchilarning jurnal statistikasini ko'radi",
    "Boshqa admin, rahbar va dasturchini boshqara olmaydi — faqat dasturchi",
  ],
  boshliq: [
    "Darslar, kutubxona, dars jadvali va hamkor maktablarda admin bilan bir xil vakolatga ega",
    "Barcha o'qituvchilarning natijalari va statistikasini ko'radi",
    "Boshqaruv paneliga (admin.kuragoniy.uz) kirmaydi — xodimlar va sozlamalarni admin boshqaradi",
    "Odatda shaxsiy dars, jurnal va jadval yuritmaydi, faqat nazorat qiladi",
  ],
  kuzatuvchi: [
    "Barcha tahlil, reyting, natija va dars hisobotlarini ko'radi (barcha o'qituvchilar bo'yicha)",
    "Hech narsani o'zgartira olmaydi — server darajasida faqat o'qish huquqi",
    "Faqat dasturchi tayinlaydi",
  ],
  maktab: [
    "Hamkor maktabning direktori yoki zavuchi — faqat o'z maktabini ko'radi",
    "Maktab statistikasi, o'qituvchilari, sinflari va litsenziya holati",
    "O'qituvchilar jurnallarini faqat ko'rish rejimida ochadi",
    "Hech narsani o'zgartira olmaydi (o'z profilidan tashqari)",
  ],
  teacher: [
    "Faqat ochiq choraklardagi darslarni va kutubxonani ko'radi",
    "Faqat o'z sinflari va o'quvchilari uchun jurnal yuritadi (baho, davomat)",
    "O'zining haftalik dars jadvalini tahrirlaydi, boshqalarnikini faqat ko'radi",
    "Dars, kutubxona materiali yoki e'lon qo'sha olmaydi",
  ],
  student: [
    "Faqat o'quvchi oynasi: darslar, test va masalalar, uyga vazifa, o'yinlar, natijalari",
    "O'qituvchi oynasi va ma'muriyat bo'limlariga umuman kira olmaydi",
    "Hisobini o'qituvchisi yaratadi yoki sinf kodi bilan o'zi ro'yxatdan o'tadi; parolini o'qituvchisi tiklaydi",
  ],
}

function MatrixCell({ cell }: { cell: Cell }) {
  const { t } = useTranslation()
  const [kind, note] = typeof cell === 'string' ? [cell, ''] : cell
  const k = KIND[kind]
  return (
    <td>
      <span className={`rmx__c rmx__c--${kind}`}>
        {k.icon && <span className="rmx__ic" aria-hidden="true">{IC[k.icon]}</span>}
        {kind === 'none' ? <span aria-label={t(k.label)}>—</span> : t(k.label)}
      </span>
      {note && <small className="rmx__note">{t(note)}</small>}
    </td>
  )
}

export function RolesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: staff, isLoading } = useStaffList()
  const { data: pupils } = useStudentAccounts('')

  const countOf = (r: RoleInfo) => (r.key === 'student' ? pupils?.count : staff ? r.count(staff) : undefined)

  return (
    <div className="roles">
      <section className="panel">
        <h3 className="panel__title">{t('Rollar')}</h3>
        <p className="prose prose--note">{t("Har bir rolda nechta odam borligi. Kartochkani bossangiz, o'sha roldagilar ro'yxati ochiladi.")}</p>
        <p className="prose prose--note">{t("Admin va dasturchi bitta akkaunt bilan ishlaydi: admin.kuragoniy.uz'da boshqaradi, kuragoniy.uz'da dars beradi (u yerda faqat o'qituvchi sahifalari).")}</p>
        {isLoading ? <Skeleton lines={3} /> : (
          <div className="rcards">
            {ROLES.map((r) => {
              const n = countOf(r)
              return (
                <button key={r.key} type="button" className="rcard" onClick={() => navigate(`/foydalanuvchilar?rol=${r.tab}`)}>
                  <span className="rcard__top">
                    <RoleBadge user={r.badge} />
                    <b className="rcard__n">{n ?? '…'}</b>
                  </span>
                  <span className="rcard__sub">{t(r.sub)}</span>
                  <span className="rcard__go">{t("Ro'yxatni ochish")} →</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Kim nimani qila oladi')}</h3>
        <ul className="rmx__legend" aria-label={t('Belgilar')}>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <li key={k}>
              <span className={`rmx__c rmx__c--${k}`}>
                {KIND[k].icon && <span className="rmx__ic" aria-hidden="true">{IC[KIND[k].icon!]}</span>}
                {k === 'none' ? '—' : t(KIND[k].label)}
              </span>
              {k === 'none' && <span className="muted">{t('kira olmaydi')}</span>}
            </li>
          ))}
        </ul>
        <div className="rmx__wrap">
          <table className="rmx">
            <thead>
              <tr>
                <th scope="col">{t("Bo'lim")}</th>
                {ROLES.map((r) => <th key={r.key} scope="col"><RoleBadge user={r.badge} /></th>)}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.area}>
                  <th scope="row">
                    {t(row.area)}
                    {row.sub && <small>{t(row.sub)}</small>}
                  </th>
                  {row.cells.map((c, i) => <MatrixCell key={ROLES[i].key} cell={c} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Batafsil')}</h3>
        <div className="rdetails">
          {ROLES.map((r) => (
            <details key={r.key} className="rdetail">
              <summary><RoleBadge user={r.badge} /> <span>{t(r.sub)}</span></summary>
              <ul className="rolesref__list">
                {DETAILS[r.key].map((item) => <li key={item}>{t(item)}</li>)}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
