"""import_af_fields: lessons copied before Ko'ragoniy had cat / sim_id /
experiment type get them from amaliyfizika.uz — only where still unset."""
import sqlite3
from io import StringIO

import pytest
from django.core.management import call_command

from lessons.models import Experiment, Lesson

from .test_import_af import _af_db


@pytest.mark.django_db
def test_fills_only_what_is_unset(tmp_path):
    db, media = tmp_path / 'af.sqlite3', tmp_path / 'af-media'
    _af_db(db, media)
    c = sqlite3.connect(db)
    c.execute("update lessons_experiment set type = 'wow' where id = 2")
    c.execute("update lessons_experiment set type = 'oyin' where id = 3")
    c.execute("update lessons_lesson set sim_id = 'pressure' where id = 2")
    c.commit()
    c.close()
    call_command('import_af', source=str(db), media=str(media), apply=True, stdout=StringIO())

    # as it was before KE had these fields
    Lesson.objects.update(cat='', sim_id='')
    Experiment.objects.update(type='oddiy')
    harakat, bosim = Lesson.objects.get(title='Mexanik harakat'), Lesson.objects.get(title='Bosim')
    Lesson.objects.filter(pk=bosim.pk).update(cat='optika')            # set here since: kept
    Experiment.objects.filter(name='Tajriba 3').update(name='Boshqa')  # renamed here: left alone

    out = StringIO()
    call_command('import_af_fields', source=str(db), stdout=out)
    report = out.getvalue()
    assert "Darslar: 2 tasiga" in report and "'wow': 1" in report and 'Boshqa' not in report
    assert 'Tajriba 3' in report  # listed as not found
    assert Lesson.objects.get(pk=harakat.pk).cat == ''  # report only

    call_command('import_af_fields', source=str(db), apply=True, stdout=StringIO())
    harakat.refresh_from_db()
    bosim.refresh_from_db()
    assert (harakat.cat, harakat.sim_id) == ('mexanika', 'sim-1')
    assert (bosim.cat, bosim.sim_id) == ('optika', 'pressure')
    assert dict(Experiment.objects.values_list('name', 'type')) == {
        'Tajriba 1': 'oddiy', 'Tajriba 2': 'wow', 'Boshqa': 'oddiy'}

    # a second run has nothing left to do
    out = StringIO()
    call_command('import_af_fields', source=str(db), apply=True, stdout=out)
    assert 'Tayyor: 0 dars, 0 tajriba' in out.getvalue()


@pytest.mark.django_db
def test_new_imports_carry_the_fields(tmp_path):
    db, media = tmp_path / 'af.sqlite3', tmp_path / 'af-media'
    _af_db(db, media)
    c = sqlite3.connect(db)
    c.execute("update lessons_experiment set type = 'wow' where id = 1")
    c.commit()
    c.close()
    call_command('import_af', source=str(db), media=str(media), apply=True, stdout=StringIO())
    lesson = Lesson.objects.get(title='Mexanik harakat')
    assert (lesson.cat, lesson.sim_id) == ('mexanika', 'sim-1')
    assert lesson.experiments.get(name='Tajriba 1').type == 'wow'
