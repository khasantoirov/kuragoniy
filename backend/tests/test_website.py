"""kuragoniy.uz's landing page: the public read, the lead form, the editing."""
import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile

from schools.models import School
from website.models import Lead, Mentor, SiteSettings

PNG = (b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
       b'\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_the_landing_page_reads_live_figures_and_overrides(api_client):
    School.objects.create(name='Iftixor')
    r = api_client.get('/api/public/landing/')
    assert r.status_code == 200
    assert r.data['stats']['schools'] == 1 and r.data['partners'] == ['Iftixor']
    assert r.data['testimonials'] == [] and r.data['mentors'] == []
    s = SiteSettings.get()
    s.stat_pupils = 1500
    s.save()
    cache.clear()
    assert api_client.get('/api/public/landing/').data['stats']['pupils'] == 1500


@pytest.mark.django_db
def test_a_visitor_leaves_a_number(api_client):
    r = api_client.post('/api/public/leads/', {'name': 'Ota-ona', 'phone': '90 123 45 67', 'telegram': 'otaona'}, format='json')
    assert r.status_code == 201
    lead = Lead.objects.get()
    assert lead.phone == '+998901234567' and lead.telegram == '@otaona'
    assert api_client.post('/api/public/leads/', {'name': '', 'phone': '1'}, format='json').status_code == 400


@pytest.mark.django_db
def test_only_the_administration_edits_the_site(as_user, api_client, admin, teacher):
    assert as_user(teacher).get('/api/public/admin/settings/').status_code == 403
    c = as_user(admin)
    assert c.patch('/api/public/admin/settings/', {'phone': '+998 55 500 00 00'}, format='json').status_code == 200
    r = c.post('/api/public/admin/mentors/', {'name': 'Hasan Toirov', 'title': 'Fizika ustozi',
                                              'photo': SimpleUploadedFile('a.png', PNG, content_type='image/png')},
               format='multipart')
    assert r.status_code == 201, r.data
    assert Mentor.objects.get().photo.name.startswith('site/people/')
    landing = api_client.get('/api/public/landing/').data
    assert landing['contacts']['phone'] == '+998 55 500 00 00' and landing['mentors'][0]['name'] == 'Hasan Toirov'
    # a wrong file is refused
    bad = c.post('/api/public/admin/mentors/', {'name': 'X', 'photo': SimpleUploadedFile('a.png', b'not an image')},
                 format='multipart')
    assert bad.status_code == 400


@pytest.mark.django_db
def test_leads_are_marked_called_back(as_user, admin):
    lead = Lead.objects.create(name='A', phone='+998901234567')
    c = as_user(admin)
    assert len(c.get('/api/public/admin/leads/', {'state': 'open'}).data['results']) == 1
    r = c.post(f'/api/public/admin/leads/{lead.id}/handled/', {'note': "Qo'ng'iroq qilindi"}, format='json')
    assert r.status_code == 200 and r.data['handled_at']
    assert c.get('/api/public/admin/leads/', {'state': 'open'}).data['results'] == []
