"""Data behind the Fizika window's "Jihozlar jadvali" page (from
amaliyfizika.uz): every Amaliy fizika lesson with its experiments and
their equipment (each item tagged with its catalogue key), plus the
LabEquipment catalogue. Cross-references ("Yana qaysi mavzuga
ishlatiladi?") and money totals are worked out on the client from this, so
the page and its Excel export share one calculation. Grades go out as
7 / 8 / 9, as the page counts them."""

from .models import LabEquipment, Lesson, equipment_key
from .serializers import LabEquipmentSerializer

GRADE_NUMBER = {'F7': 7, 'F8': 8, 'F9': 9}


def build_registry(request):
    lessons = (
        Lesson.objects.filter(grade__in=GRADE_NUMBER).prefetch_related('experiments__equipment_items')
        .order_by('grade', 'hafta', 'chorak', 'id')
    )
    data = []
    for lesson in lessons:
        data.append({
            'id': lesson.id,
            'grade': GRADE_NUMBER[lesson.grade],
            'chorak': lesson.chorak,
            'hafta': lesson.hafta,
            'title': lesson.title,
            'experiments': [
                {
                    'id': exp.id,
                    'name': exp.name,
                    'desc': exp.desc,
                    'items': [
                        {'id': item.id, 'name': item.name, 'quantity': item.quantity, 'key': equipment_key(item.name)}
                        for item in exp.equipment_items.all()
                    ],
                }
                for exp in lesson.experiments.all()
            ],
        })
    catalog = {
        e.key: LabEquipmentSerializer(e, context={'request': request}).data
        for e in LabEquipment.objects.all()
    }
    return {'lessons': data, 'catalog': catalog}
