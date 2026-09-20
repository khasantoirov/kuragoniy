"""Read-only global search for the 2-rejim topbar.

One request, four groups: lessons, library materials, journal students and
staff. Nothing new is stored; every group is a plain icontains query over
tables that already exist.

Two scoping rules are load-bearing and deliberately reuse the same helpers
the regular list endpoints use, rather than re-deriving them here:

* lessons — lessons.visibility.visible_chorak_set(), the QuarterLock gate
  from LessonViewSet.get_queryset(). Without it, searching would reveal
  the titles of quarters an admin has deliberately kept closed.
* students — journal.scoping.scoped_class_ids(), so a teacher only ever
  matches students on their own rosters.

Staff is admin-only outright: letting any approved teacher type two
letters and page through colleagues' email addresses is not something the
rest of the API allows either (accounts' user list is admin-gated).
"""

from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.permissions import IsApproved
from journal.models import Student
from journal.scoping import scoped_class_ids
from lessons.models import Lesson
from lessons.visibility import visible_chorak_set
from library.models import LibraryItem

# Under two characters every query matches half the database, so the
# result is noise and the scan is wasted work on every keystroke.
MIN_QUERY_LEN = 2
DEFAULT_LIMIT = 5
MAX_LIMIT = 20

GRADE_LABELS = dict(Lesson.Grade.choices)
KIND_LABELS = dict(LibraryItem.Kind.choices)
ROLE_LABELS = dict(User.Role.choices)


def _limit(request):
    raw = request.query_params.get('limit')
    try:
        value = int(raw) if raw is not None else DEFAULT_LIMIT
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    return max(1, min(value, MAX_LIMIT))


def _lessons(user, q, limit):
    qs = Lesson.objects.filter(chorak__in=visible_chorak_set(user)).filter(
        Q(title__icontains=q)
        | Q(title_ru__icontains=q)
        | Q(title_en__icontains=q)
        | Q(goal__icontains=q)
        | Q(experiments__name__icontains=q)
    ).distinct()
    return [
        {
            'id': str(lesson.id),
            'title': lesson.title,
            'subtitle': f'{GRADE_LABELS.get(lesson.grade, lesson.grade)} · '
                        f'{lesson.chorak}-chorak · {lesson.hafta}-hafta',
            'url': f'/lessons/{lesson.id}',
        }
        for lesson in qs[:limit]
    ]


def _library(q, limit):
    qs = LibraryItem.objects.filter(Q(title__icontains=q) | Q(note__icontains=q))
    return [
        {
            'id': str(item.id),
            'title': item.title,
            'subtitle': KIND_LABELS.get(item.kind, item.kind)
            + (f' · {item.grade}-sinf' if item.grade else ''),
            'url': '/library',
        }
        for item in qs[:limit]
    ]


def _students(user, q, limit):
    qs = (
        Student.objects.filter(
            full_name__icontains=q,
            active=True,
            journal_class_id__in=scoped_class_ids(user),
        )
        .select_related('journal_class')
        .order_by('full_name')
    )
    return [
        {
            'id': str(s.id),
            'title': s.full_name,
            'subtitle': s.journal_class.name
            + (f' · {s.journal_class.school}' if s.journal_class.school else ''),
            'url': '/journal',
        }
        for s in qs[:limit]
    ]


def _staff(q, limit):
    qs = User.objects.filter(Q(name__icontains=q) | Q(email__icontains=q))
    return [
        {
            'id': str(u.id),
            'title': u.name or u.email,
            'subtitle': f'{ROLE_LABELS.get(u.role, u.role)} · {u.email}',
            'url': '/admin',
        }
        for u in qs[:limit]
    ]


class GlobalSearchView(APIView):
    """GET /api/search/?q=<text>&limit=5

    Always returns the same four groups in the same order (empty `items`
    rather than a missing group) so the dropdown's layout doesn't jump as
    matches appear and disappear between keystrokes. `staff` is present
    but always empty for a non-admin.
    """

    permission_classes = [IsApproved]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        limit = _limit(request)
        user = request.user

        if len(q) < MIN_QUERY_LEN:
            groups = [
                {'kind': 'lesson', 'label': 'Darslar', 'items': []},
                {'kind': 'library', 'label': 'Kutubxona', 'items': []},
                {'kind': 'student', 'label': "O'quvchilar", 'items': []},
                {'kind': 'staff', 'label': 'Xodimlar', 'items': []},
            ]
            return Response({'q': q, 'total': 0, 'groups': groups})

        groups = [
            {'kind': 'lesson', 'label': 'Darslar', 'items': _lessons(user, q, limit)},
            {'kind': 'library', 'label': 'Kutubxona', 'items': _library(q, limit)},
            {'kind': 'student', 'label': "O'quvchilar", 'items': _students(user, q, limit)},
            {'kind': 'staff', 'label': 'Xodimlar', 'items': _staff(q, limit) if user.is_admin else []},
        ]
        return Response({'q': q, 'total': sum(len(g['items']) for g in groups), 'groups': groups})
