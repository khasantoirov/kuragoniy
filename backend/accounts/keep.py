"""What an account carries that must outlive it — so that turning a sign-up
down (UserAdminViewSet.reject, which deletes) never takes a teacher's
journal, pupils, timetable or reports with it. On 2026-11-16 a teacher who
had left was blocked and then rejected, and his 8 classes, 164 pupils and
16 timetable cells went too; a teacher who leaves is blocked, not deleted."""

from django.db.models.deletion import Collector, ProtectedError

# what a sign-up gathers before anyone approves it: safe to drop with it
EPHEMERAL = {
    'accounts.User', 'accounts.PasswordResetCode', 'accounts.TelegramLinkToken', 'accounts.UserSession',
    'notifications.Notification', 'notifications.NotificationPreference', 'webpush.PushSubscription',
    'admin.LogEntry', 'achievements.BadgeBaseline',
    'token_blacklist.OutstandingToken', 'token_blacklist.BlacklistedToken',
}

NAMES = {
    'journal.JournalClass': 'jurnal sinflari', 'journal.Student': "o'quvchilar", 'journal.ClassDay': 'dars kunlari',
    'journal.GradeEntry': 'baholar', 'journal.AttendanceEntry': 'davomat', 'timetable.TimetableSlot': 'jadval kataklari',
    'schools.SchoolTeacher': "maktabga a'zolik", 'learning.LessonReport': 'dars hisobotlari',
    'learning.Assignment': 'vazifalar', 'staffroom.PlannedLesson': 'rejalashtirilgan darslar',
}


def work_kept_by(user) -> list[str]:
    """What deleting `user` would take with it beyond the sign-up's own
    leftovers, as "jurnal sinflari: 8"; empty when nothing."""
    collector = Collector(using='default')
    try:
        collector.collect([user])
    except ProtectedError:
        return ["do'kon buyurtmalari"]
    found: dict[str, int] = {}
    for model, objs in collector.data.items():
        if model._meta.label not in EPHEMERAL and objs:
            found[model._meta.label] = found.get(model._meta.label, 0) + len(objs)
    for qs in collector.fast_deletes:
        label = qs.model._meta.label
        if label not in EPHEMERAL:
            n = qs.count()
            if n:
                found[label] = found.get(label, 0) + n
    return [f"{NAMES.get(label, label.split('.')[-1])}: {n}" for label, n in sorted(found.items())]
