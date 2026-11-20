"""Jihozlar jadvali (from amaliyfizika.uz) in the Fizika window: the
registry of the physics lessons' equipment and its priced catalogue."""
import sqlite3
from io import StringIO

import pytest
from django.core.management import call_command

from lessons.models import EquipmentItem, Experiment, LabEquipment, Lesson, equipment_key

from .test_import_af import _af_db

pytestmark = pytest.mark.django_db


def _lesson(grade, title):
    lesson = Lesson.objects.create(title=title, grade=grade, chorak=1, hafta=1)
    exp = Experiment.objects.create(lesson=lesson, name='Tajriba')
    item = EquipmentItem.objects.create(experiment=exp, name="Chizg’ich ", quantity=2)
    return lesson, item


def test_registry_lists_the_physics_lessons_with_their_catalogue(as_user, admin, teacher):
    _lesson('F8', 'Bosim')
    _lesson('5-6', 'Robot')  # STEAM: not in the physics registry
    LabEquipment.objects.create(key="chizg'ich", name="Chizg'ich", price=5000)
    data = as_user(admin).get('/api/lessons/equipment-registry/').data
    assert [(l['title'], l['grade']) for l in data['lessons']] == [('Bosim', 8)]
    item = data['lessons'][0]['experiments'][0]['items'][0]
    assert item['key'] == "chizg'ich" and data['catalog']["chizg'ich"]['price'] == 5000
    assert as_user(teacher).get('/api/lessons/equipment-registry/').status_code == 403


def test_catalogue_upsert_and_quick_item_edit(as_user, admin):
    _l, item = _lesson('F7', 'Harakat')
    resp = as_user(admin).post('/api/lessons/lab-equipment/upsert/', {'name': ' Chizg‘ich ', 'price': 7000,
                                                                     'kind': 'ikkilamchi'}, format='json')
    assert resp.status_code == 200 and resp.data['key'] == equipment_key('chizg’ich')
    resp = as_user(admin).post('/api/lessons/lab-equipment/upsert/', {'name': "CHIZG'ICH", 'price': 8000}, format='json')
    assert LabEquipment.objects.count() == 1 and LabEquipment.objects.get().price == 8000
    EquipmentItem.objects.filter(pk=item.pk).update(name_ru='Линейка')
    resp = as_user(admin).patch(f'/api/lessons/equipment-items/{item.pk}/', {'name': 'Lineyka', 'quantity': 3}, format='json')
    assert resp.status_code == 200
    item.refresh_from_db()
    assert (item.name, item.quantity, item.name_ru) == ('Lineyka', 3, '')


def test_import_af_brings_the_catalogue(tmp_path):
    db, media = tmp_path / 'af.sqlite3', tmp_path / 'af-media'
    _af_db(db, media)
    c = sqlite3.connect(db)
    c.executescript('''
        create table lessons_labequipment (id int, key text, name text, kind text, build_materials text, price int,
            image text, updated_at text);
        insert into lessons_labequipment values (1, 'dinamometr', 'Dinamometr', 'birlamchi', '', 45000, '', '2026-11-01');
        insert into lessons_labequipment values (2, 'shar', 'Shar', 'uchlamchi', 'Rezina', null, '', '2026-11-01');
    ''')
    c.commit()
    c.close()
    LabEquipment.objects.create(key='shar', name='Shar', price=100)  # already here: stays
    out = StringIO()
    call_command('import_af', source=str(db), media=str(media), apply=True, stdout=out)
    assert LabEquipment.objects.get(key='dinamometr').price == 45000
    assert LabEquipment.objects.get(key='shar').price == 100
    out = StringIO()
    call_command('import_af', source=str(db), media=str(media), stdout=out)
    assert 'Jihozlar jadvali (katalog): 0' in out.getvalue()  # a second run: nothing new
