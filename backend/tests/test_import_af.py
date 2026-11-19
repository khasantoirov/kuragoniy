"""import_af: amaliyfizika.uz's lessons, library and staff come over as the
Amaliy fizika fan — once, with logins and passwords as they were."""
import sqlite3
from io import StringIO

import pytest
from django.contrib.auth.hashers import make_password
from django.core.management import call_command

from accounts.models import User
from lessons.models import EquipmentItem, Experiment, Lesson
from library.models import LibraryItem

HASH = make_password('Af-parol-2026')


def _af_db(path, media):
    (media / 'lesson-files').mkdir(parents=True)
    (media / 'lesson-files' / 'harakat.pdf').write_bytes(b'%PDF-1.4 sinov')
    c = sqlite3.connect(path)
    c.executescript('''
        create table accounts_user (id text, password text, last_login text, email text, username text, name text,
            first_name text, last_name text, role text, is_dev_superuser bool, approved bool, phone text, photo text,
            bday text, telegram_linked bool, telegram_chat_id int, is_active bool, is_staff bool, is_superuser bool,
            must_change_password bool, created_at text, previous_username text);
        create table lessons_lesson (id int, title text, title_ru text, title_en text, grade int, chorak int, hafta int,
            cat text, goal text, goal_ru text, goal_en text, file_url text, file text, sim_id text, updated_at text,
            translated_at text);
        create table lessons_experiment (id int, lesson_id int, "order" int, name text, type text, "desc" text,
            steps text, minutes int, safety text, image text, video text);
        create table lessons_equipmentitem (id int, experiment_id int, "order" int, name text, quantity int, image text);
        create table lessons_equipmentsheet (id int, grade int, hafta int, title text, image text, created_at text);
        create table library_libraryitem (id int, title text, url text, file text, cover text, kind text, grade int,
            note text, updated_at text);
    ''')
    users = [
        ('u-teacher', 'gulirano', 'g@af.uz', 'Guliraʼno Rahmatova', 'teacher', 0, 1, '+998901110001'),
        ('u-boss', 'bilol', 'b@af.uz', 'Bilol Tadjibayev', 'boshliq', 0, 1, ''),
        ('u-blocked', 'shohrux', 's@af.uz', 'Shohrux X', 'teacher', 0, 0, ''),
        ('u-dev', 'hasan', 'dev@here.uz', 'Hasan Toirov', 'admin', 1, 1, ''),
        ('u-here', 'elmurod', 'here@ke.uz', 'Elmurod P', 'boshliq', 0, 1, ''),
    ]
    for uid, login, email, name, role, dev, approved, phone in users:
        c.execute('insert into accounts_user values (?,?,null,?,?,?,?,?,?,?,?,?,null,null,1,123,1,0,0,0,'
                  "'2026-09-01 08:00:00',null)",
                  (uid, HASH, email, login, name, name.split()[0], ' '.join(name.split()[1:]), role, dev, approved, phone))
    c.execute("insert into lessons_lesson values (1,'Mexanik harakat','Механическое движение','','7',1,1,'mexanika',"
              "'Maqsad','','','','lesson-files/harakat.pdf','sim-1','2026-09-01 08:00:00','2026-09-02 08:00:00')")
    c.execute("insert into lessons_lesson values (2,'Bosim','','',8,1,1,'boshqa','','','','','','', "
              "'2026-09-05 08:00:00',null)")
    for i in (1, 2, 3):
        c.execute('insert into lessons_experiment values (?,1,?,?,?,?,?,10,?,?,?)',
                  (i, i, f'Tajriba {i}', 'oddiy', 'tavsif', '["qadam"]', '', '', ''))
    c.execute("insert into lessons_equipmentitem values (1,1,0,'Chizg''ich',2,null)")
    c.execute("insert into library_libraryitem values (1,'Fizika masalalari','https://example.uz/k','','','havola',8,'',"
              "'2026-09-01 08:00:00')")
    c.commit()
    c.close()


@pytest.mark.django_db
def test_amaliy_fizika_comes_over_once(tmp_path, make_user, api_client):
    make_user('here@ke.uz', approved=True)  # already on Ko'ragoniy
    db, media = tmp_path / 'af.sqlite3', tmp_path / 'af-media'
    _af_db(db, media)

    out = StringIO()
    call_command('import_af', source=str(db), media=str(media), stdout=out)
    report = out.getvalue()
    assert "Darslar: 2" in report and 'tajribalar: 3' in report and "Hisoblar: 2 ko'chadi" in report
    assert Lesson.objects.count() == 0 and not User.objects.filter(username='gulirano').exists()  # report only

    call_command('import_af', source=str(db), media=str(media), apply=True, stdout=StringIO())
    lesson = Lesson.objects.get(title='Mexanik harakat')
    assert lesson.grade == 'F7' and lesson.title_ru == 'Механическое движение'
    assert lesson.file.name.startswith('lesson-files/harakat') and lesson.file.read() == b'%PDF-1.4 sinov'
    assert Lesson.objects.get(title='Bosim').grade == 'F8'
    assert Experiment.objects.filter(lesson=lesson).count() == 3 and EquipmentItem.objects.get().quantity == 2
    assert lesson.translated_at and lesson.translated_at >= lesson.updated_at  # translated there: no new job
    book = LibraryItem.objects.get()
    assert book.subject == 'fizika' and book.grade == 8

    t = User.objects.get(username='gulirano')
    assert t.pk == 'u-teacher' and t.subjects == ['fizika'] and t.role == 'teacher' and t.approved
    assert not t.telegram_linked and t.telegram_chat_id is None and t.check_password('Af-parol-2026')
    assert User.objects.get(username='bilol').role == 'boshliq'
    assert not User.objects.filter(username__in=['shohrux', 'hasan', 'elmurod']).exists()
    # the old login and password work here
    r = api_client.post('/api/auth/login/', {'login': 'gulirano', 'password': 'Af-parol-2026'}, format='json')
    assert r.status_code == 200, r.data

    # a second run copies nothing again
    out = StringIO()
    call_command('import_af', source=str(db), media=str(media), apply=True, stdout=out)
    assert Lesson.objects.count() == 2 and Experiment.objects.count() == 3 and LibraryItem.objects.count() == 1
    assert User.objects.filter(username='gulirano').count() == 1
