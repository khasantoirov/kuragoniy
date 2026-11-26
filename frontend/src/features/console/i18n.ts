import i18n, { whenDictionaries } from '@/lib/i18n'

/** ru/en for the Boshqaruv paneli (admin.kuragoniy.uz): the console,
 *  Rollar and Foydalanuvchilar — loaded with the console's chunk only. */
const ru: Record<string, string> = {
  // the console
  'Odamlar': 'Люди',
  "Xodimlar va o'quvchilar, rol bo'yicha": 'Сотрудники и ученики по ролям',
  'Rollar': 'Роли',
  'Har bir rol va uning vakolatlari': 'Каждая роль и её полномочия',
  "O'quv jarayoni": 'Учебный процесс',
  "Choraklar, darslar importi, e'lonlar": 'Четверти, импорт уроков, объявления',
  "O'quv yili va choraklar sanalari": 'Учебный год и даты четвертей',
  'Modullar': 'Модули',
  "Bo'limlarni yoqish va o'chirish": 'Включение и отключение разделов',
  'Suv belgisi va skrinshotdan himoya': 'Водяной знак и защита от скриншотов',
  'Hamkor maktablar litsenziyalari': 'Лицензии школ-партнёров',
  'Sayt': 'Сайт',
  'kuragoniy.uz bosh sahifasi va arizalar': 'Главная страница kuragoniy.uz и заявки',
  'Xavfsizlik': 'Безопасность',
  'Kirishlar va muhim amallar': 'Входы и важные действия',
  // the people list
  'Kuzatuvchilar': 'Наблюдатели',
  'Ism, login yoki telefon': 'Имя, логин или телефон',
  'Hech kim topilmadi.': 'Никого не найдено.',
  "Hali o'quvchi hisobi yo'q.": 'Учётных записей учеников пока нет.',
  "Bu rolda hali hech kim yo'q.": 'В этой роли пока никого нет.',
  "{{n}} ta o'quvchidan {{k}} tasi ko'rsatilmoqda — kerakli o'quvchini ismi yoki logini bilan qidiring.":
    'Показано {{k}} из {{n}} учеников — найдите нужного по имени или логину.',
  // Rollar
  "Har bir rolda nechta odam borligi. Kartochkani bossangiz, o'sha roldagilar ro'yxati ochiladi.":
    'Сколько людей в каждой роли. Нажмите на карточку, чтобы открыть их список.',
  "Ro'yxatni ochish": 'Открыть список',
  'Kim nimani qila oladi': 'Кто что может',
  'Belgilar': 'Обозначения',
  'kira olmaydi': 'нет доступа',
  "Bo'lim": 'Раздел',
  'Batafsil': 'Подробно',
  'Tahrirlaydi': 'Изменяет',
  "Ko'radi": 'Видит',
  "O'zinikini": 'Своё',
  "Yo'q": 'Нет',
  'Boshqaruv paneli': 'Панель управления',
  'Xodim hisoblari': 'Учётные записи сотрудников',
  'Yaratish, tasdiqlash, bloklash, parol': 'Создание, подтверждение, блокировка, пароль',
  'Rol berish': 'Назначение ролей',
  'Admin, Boshliq, Kuzatuvchi qilish': 'Сделать админом, руководителем, наблюдателем',
  "o'qituvchilarni": 'учителей',
  'ochiq choraklar': 'открытые четверти',
  "o'z sinfi": 'свой класс',
  "hammasini ko'radi": 'видит все',
  'hammasini': 'все',
  "Statistika'da": 'в Статистике',
  "o'z maktabi": 'своя школа',
  'hammaniki': 'всех',
  "boshqalarnikini ko'radi": 'чужие видит',
  "o'z sinflari": 'свои классы',
  "o'z natijalari": 'свои результаты',
  "Platformaning texnik egasi: hamma narsa, rollarni berish": 'Технический владелец платформы: всё, назначение ролей',
  'Boshqaruv paneli: xodimlar, choraklar, modullar, sayt': 'Панель управления: сотрудники, четверти, модули, сайт',
  'Rahbar: darslar va natijalarni nazorat qiladi': 'Руководитель: контролирует уроки и результаты',
  "Inspektor yoki metodist: hammasini faqat ko'radi": 'Инспектор или методист: всё только просматривает',
  "Direktor yoki zavuch: faqat o'z maktabini ko'radi": 'Директор или завуч: видит только свою школу',
  "Darslar, o'z jurnali va dars jadvali": 'Уроки, свой журнал и расписание',
  "O'quvchi oynasi: darslar, vazifalar, natijalar": 'Окно ученика: уроки, задания, результаты',
  'Admin va Boshliqning barcha vakolatlariga ega': 'Имеет все полномочия админа и руководителя',
  "Boshqa foydalanuvchini Admin, Boshliq yoki Kuzatuvchi qilishi (va bu huquqni olishi) mumkin — faqat u":
    'Только он может сделать пользователя админом, руководителем или наблюдателем (и снять эту роль)',
  "Boshqa admin, boshliq va dasturchi hisobini boshqaradi (bloklash, parolni tiklash, rad etish)":
    'Управляет учётными записями админов, руководителей и разработчиков (блокировка, сброс пароля, отклонение)',
  "Yuqoridagi «Rol» tugmasi bilan platformani boshqa rol yoki aniq odam ko'zi bilan ko'radi (faqat ko'rish)":
    'Кнопкой «Роль» вверху смотрит на платформу глазами другой роли или конкретного человека (только просмотр)',
  "Boshqaruv paneliga (admin.kuragoniy.uz) kiradi: xodimlar, choraklar, modullar, himoya, litsenziyalar, o'quv yillari, sayt":
    'Входит в панель управления (admin.kuragoniy.uz): сотрудники, четверти, модули, защита, лицензии, учебные годы, сайт',
  "O'qituvchilarni yaratish, tasdiqlash, bloklash, parolini tiklash, fan biriktirish":
    'Создание, подтверждение и блокировка учителей, сброс пароля, назначение предмета',
  "Darslarni qo'shish, tahrirlash, o'chirish (barcha choraklar), choraklarni ochish va yopish":
    'Добавление, изменение и удаление уроков (все четверти), открытие и закрытие четвертей',
  "Kutubxonaga material qo'shish, e'lon yuborish, darslar va tarjimalarni import-eksport qilish":
    'Добавление материалов в библиотеку, объявления, импорт и экспорт уроков и переводов',
  "Har qanday o'qituvchining dars jadvalini tahrirlaydi; barcha o'qituvchilarning jurnal statistikasini ko'radi":
    'Изменяет расписание любого учителя; видит статистику журналов всех учителей',
  "Boshqa admin, boshliq va dasturchini boshqara olmaydi — faqat dasturchi":
    'Не управляет другими админами, руководителями и разработчиками — это делает только разработчик',
  "Darslar, kutubxona, dars jadvali va hamkor maktablarda admin bilan bir xil vakolatga ega":
    'В уроках, библиотеке, расписании и школах-партнёрах имеет те же полномочия, что и админ',
  "Barcha o'qituvchilarning natijalari va statistikasini ko'radi": 'Видит результаты и статистику всех учителей',
  "Boshqaruv paneliga (admin.kuragoniy.uz) kirmaydi — xodimlar va sozlamalarni admin boshqaradi":
    'Не входит в панель управления (admin.kuragoniy.uz) — сотрудниками и настройками управляет админ',
  "Odatda shaxsiy dars, jurnal va jadval yuritmaydi, faqat nazorat qiladi":
    'Обычно не ведёт свои уроки, журнал и расписание, только контролирует',
  "Barcha tahlil, reyting, natija va dars hisobotlarini ko'radi (barcha o'qituvchilar bo'yicha)":
    'Видит всю аналитику, рейтинги, результаты и отчёты об уроках (по всем учителям)',
  "Hech narsani o'zgartira olmaydi — server darajasida faqat o'qish huquqi":
    'Ничего не может изменить — на сервере только право чтения',
  'Faqat dasturchi tayinlaydi': 'Назначает только разработчик',
  "Hamkor maktabning direktori yoki zavuchi — faqat o'z maktabini ko'radi":
    'Директор или завуч школы-партнёра — видит только свою школу',
  "Maktab statistikasi, o'qituvchilari, sinflari va litsenziya holati": 'Статистика школы, учителя, классы и состояние лицензии',
  "O'qituvchilar jurnallarini faqat ko'rish rejimida ochadi": 'Открывает журналы учителей только для просмотра',
  "Hech narsani o'zgartira olmaydi (o'z profilidan tashqari)": 'Ничего не может изменить (кроме своего профиля)',
  "Faqat ochiq choraklardagi darslarni va kutubxonani ko'radi": 'Видит уроки только открытых четвертей и библиотеку',
  "Faqat o'z sinflari va o'quvchilari uchun jurnal yuritadi (baho, davomat)":
    'Ведёт журнал только своих классов и учеников (оценки, посещаемость)',
  "O'zining haftalik dars jadvalini tahrirlaydi, boshqalarnikini faqat ko'radi":
    'Изменяет своё недельное расписание, чужие только просматривает',
  "Dars, kutubxona materiali yoki e'lon qo'sha olmaydi": 'Не может добавлять уроки, материалы библиотеки или объявления',
  "Faqat o'quvchi oynasi: darslar, test va masalalar, uyga vazifa, o'yinlar, natijalari":
    'Только окно ученика: уроки, тесты и задачи, домашние задания, игры, результаты',
  "O'qituvchi oynasi va ma'muriyat bo'limlariga umuman kira olmaydi": 'Не имеет доступа к окну учителя и разделам администрации',
  "Hisobini o'qituvchisi yaratadi yoki sinf kodi bilan o'zi ro'yxatdan o'tadi; parolini o'qituvchisi tiklaydi":
    'Учётную запись создаёт учитель, или ученик регистрируется по коду класса; пароль сбрасывает учитель',
  'Boshqaruv paneliga kirish rad etildi (administrator emas)': 'Вход в панель управления отклонён (не администратор)',
}

const en: Record<string, string> = {
  'Odamlar': 'People',
  "Xodimlar va o'quvchilar, rol bo'yicha": 'Staff and pupils, by role',
  'Rollar': 'Roles',
  'Har bir rol va uning vakolatlari': 'Each role and what it may do',
  "O'quv jarayoni": 'Teaching',
  "Choraklar, darslar importi, e'lonlar": 'Quarters, lesson import, announcements',
  "O'quv yili va choraklar sanalari": 'The school year and its quarter dates',
  'Modullar': 'Modules',
  "Bo'limlarni yoqish va o'chirish": 'Turn sections on and off',
  'Suv belgisi va skrinshotdan himoya': 'Watermark and screenshot protection',
  'Hamkor maktablar litsenziyalari': "Partner schools' licences",
  'Sayt': 'Website',
  'kuragoniy.uz bosh sahifasi va arizalar': 'The kuragoniy.uz front page and applications',
  'Xavfsizlik': 'Security',
  'Kirishlar va muhim amallar': 'Sign-ins and important actions',
  'Kuzatuvchilar': 'Observers',
  'Ism, login yoki telefon': 'Name, login or phone',
  'Hech kim topilmadi.': 'Nobody found.',
  "Hali o'quvchi hisobi yo'q.": 'No pupil accounts yet.',
  "Bu rolda hali hech kim yo'q.": 'Nobody in this role yet.',
  "{{n}} ta o'quvchidan {{k}} tasi ko'rsatilmoqda — kerakli o'quvchini ismi yoki logini bilan qidiring.":
    'Showing {{k}} of {{n}} pupils — search for the one you need by name or login.',
  "Har bir rolda nechta odam borligi. Kartochkani bossangiz, o'sha roldagilar ro'yxati ochiladi.":
    'How many people are in each role. Click a card to open their list.',
  "Ro'yxatni ochish": 'Open the list',
  'Kim nimani qila oladi': 'Who can do what',
  'Belgilar': 'Key',
  'kira olmaydi': 'no access',
  "Bo'lim": 'Section',
  'Batafsil': 'In detail',
  'Tahrirlaydi': 'Edits',
  "Ko'radi": 'Views',
  "O'zinikini": 'Own only',
  "Yo'q": 'None',
  'Boshqaruv paneli': 'Admin panel',
  'Xodim hisoblari': 'Staff accounts',
  'Yaratish, tasdiqlash, bloklash, parol': 'Create, approve, block, password',
  'Rol berish': 'Granting roles',
  'Admin, Boshliq, Kuzatuvchi qilish': 'Make admin, head or observer',
  "o'qituvchilarni": "teachers'",
  'ochiq choraklar': 'open quarters',
  "o'z sinfi": 'own class',
  "hammasini ko'radi": 'sees everyone’s',
  'hammasini': 'everyone’s',
  "Statistika'da": 'in Statistics',
  "o'z maktabi": 'own school',
  'hammaniki': 'everyone’s',
  "boshqalarnikini ko'radi": 'views others’',
  "o'z sinflari": 'own classes',
  "o'z natijalari": 'own results',
  "Platformaning texnik egasi: hamma narsa, rollarni berish": "The platform's technical owner: everything, granting roles",
  'Boshqaruv paneli: xodimlar, choraklar, modullar, sayt': 'Admin panel: staff, quarters, modules, website',
  'Rahbar: darslar va natijalarni nazorat qiladi': 'Head: oversees lessons and results',
  "Inspektor yoki metodist: hammasini faqat ko'radi": 'Inspector or methodologist: views everything, changes nothing',
  "Direktor yoki zavuch: faqat o'z maktabini ko'radi": 'Principal or deputy: sees their own school only',
  "Darslar, o'z jurnali va dars jadvali": 'Lessons, their own gradebook and timetable',
  "O'quvchi oynasi: darslar, vazifalar, natijalar": "The pupil's window: lessons, assignments, results",
  'Admin va Boshliqning barcha vakolatlariga ega': 'Has every power of an admin and a head',
  "Boshqa foydalanuvchini Admin, Boshliq yoki Kuzatuvchi qilishi (va bu huquqni olishi) mumkin — faqat u":
    'The only one who may make someone an admin, head or observer (and take it back)',
  "Boshqa admin, boshliq va dasturchi hisobini boshqaradi (bloklash, parolni tiklash, rad etish)":
    "Manages other admins', heads' and developers' accounts (block, password reset, reject)",
  "Yuqoridagi «Rol» tugmasi bilan platformani boshqa rol yoki aniq odam ko'zi bilan ko'radi (faqat ko'rish)":
    'With the «Rol» button on top, sees the platform as another role or a chosen person (view only)',
  "Boshqaruv paneliga (admin.kuragoniy.uz) kiradi: xodimlar, choraklar, modullar, himoya, litsenziyalar, o'quv yillari, sayt":
    'Signs in to the admin panel (admin.kuragoniy.uz): staff, quarters, modules, protection, licences, school years, website',
  "O'qituvchilarni yaratish, tasdiqlash, bloklash, parolini tiklash, fan biriktirish":
    'Creates, approves and blocks teachers, resets passwords, assigns subjects',
  "Darslarni qo'shish, tahrirlash, o'chirish (barcha choraklar), choraklarni ochish va yopish":
    'Adds, edits and deletes lessons (all quarters), opens and closes quarters',
  "Kutubxonaga material qo'shish, e'lon yuborish, darslar va tarjimalarni import-eksport qilish":
    'Adds library materials, sends announcements, imports and exports lessons and translations',
  "Har qanday o'qituvchining dars jadvalini tahrirlaydi; barcha o'qituvchilarning jurnal statistikasini ko'radi":
    "Edits any teacher's timetable; sees every teacher's gradebook statistics",
  "Boshqa admin, boshliq va dasturchini boshqara olmaydi — faqat dasturchi":
    'Cannot manage other admins, heads or developers — only the developer can',
  "Darslar, kutubxona, dars jadvali va hamkor maktablarda admin bilan bir xil vakolatga ega":
    'Has the same powers as an admin in lessons, the library, the timetable and partner schools',
  "Barcha o'qituvchilarning natijalari va statistikasini ko'radi": "Sees every teacher's results and statistics",
  "Boshqaruv paneliga (admin.kuragoniy.uz) kirmaydi — xodimlar va sozlamalarni admin boshqaradi":
    'Does not sign in to the admin panel (admin.kuragoniy.uz) — staff and settings are managed by an admin',
  "Odatda shaxsiy dars, jurnal va jadval yuritmaydi, faqat nazorat qiladi":
    'Usually keeps no lessons, gradebook or timetable of their own; oversees only',
  "Barcha tahlil, reyting, natija va dars hisobotlarini ko'radi (barcha o'qituvchilar bo'yicha)":
    'Sees all analytics, ratings, results and lesson reports (for every teacher)',
  "Hech narsani o'zgartira olmaydi — server darajasida faqat o'qish huquqi":
    'Cannot change anything — read-only on the server',
  'Faqat dasturchi tayinlaydi': 'Appointed by the developer only',
  "Hamkor maktabning direktori yoki zavuchi — faqat o'z maktabini ko'radi":
    'The principal or deputy of a partner school — sees their own school only',
  "Maktab statistikasi, o'qituvchilari, sinflari va litsenziya holati": "The school's statistics, teachers, classes and licence status",
  "O'qituvchilar jurnallarini faqat ko'rish rejimida ochadi": "Opens teachers' gradebooks read-only",
  "Hech narsani o'zgartira olmaydi (o'z profilidan tashqari)": 'Cannot change anything (except their own profile)',
  "Faqat ochiq choraklardagi darslarni va kutubxonani ko'radi": 'Sees lessons of open quarters only, and the library',
  "Faqat o'z sinflari va o'quvchilari uchun jurnal yuritadi (baho, davomat)":
    'Keeps the gradebook for their own classes and pupils only (marks, attendance)',
  "O'zining haftalik dars jadvalini tahrirlaydi, boshqalarnikini faqat ko'radi":
    "Edits their own weekly timetable; views others' only",
  "Dars, kutubxona materiali yoki e'lon qo'sha olmaydi": 'Cannot add lessons, library materials or announcements',
  "Faqat o'quvchi oynasi: darslar, test va masalalar, uyga vazifa, o'yinlar, natijalari":
    "The pupil's window only: lessons, tests and problems, homework, games, results",
  "O'qituvchi oynasi va ma'muriyat bo'limlariga umuman kira olmaydi": "No access at all to the teacher's window or the administration's sections",
  "Hisobini o'qituvchisi yaratadi yoki sinf kodi bilan o'zi ro'yxatdan o'tadi; parolini o'qituvchisi tiklaydi":
    'The account is made by their teacher, or they sign up with a class code; their teacher resets the password',
  'Boshqaruv paneliga kirish rad etildi (administrator emas)': 'Admin panel sign-in refused (not an administrator)',
}

whenDictionaries(() => {
  i18n.addResourceBundle('ru', 'translation', ru, true, false)
  i18n.addResourceBundle('en', 'translation', en, true, false)
})
