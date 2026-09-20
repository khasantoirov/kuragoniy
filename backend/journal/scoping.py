"""Which journal classes a given user may see.

Extracted from dashboard/views.py's _scope_class_ids() so the dashboard
and the global search share one boundary: a teacher sees only their own
JournalClass rows (and therefore only their own students), an admin sees
everything, optionally narrowed to one teacher. Mirrors
JournalClassViewSet.get_queryset()'s scoping in journal/views.py.
"""

from .models import JournalClass


def scoped_class_ids(user, teacher_id=None):
    if user.is_admin:
        qs = JournalClass.objects.filter(teacher_id=teacher_id) if teacher_id else JournalClass.objects.all()
    else:
        qs = JournalClass.objects.filter(teacher=user)
    return list(qs.values_list('id', flat=True))
