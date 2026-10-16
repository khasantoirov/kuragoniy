"""
Permission classes replicating the role/approval logic that used to live
in firestore.rules (see repo root firestore.rules for the original):

  isDev()      -> user.is_dev_superuser
  isAdmin()    -> isDev() || role == 'admin'
  isApproved() -> isDev() || approved == true || role == 'admin'

plus the roles added since: students (student portal only — never any
staff endpoint) and Kuzatuvchi (read-only oversight). common/
authentication.py enforces the same split centrally as a second layer.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsApproved(BasePermission):
    """Approved *staff* member. Students are never staff, however approved
    — their approval only opens the student portal (IsStudent)."""

    message = "Hisobingiz hali tasdiqlanmagan."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_staff_member):
            return False
        if user.is_observer and request.method not in SAFE_METHODS:
            self.message = "Kuzatuvchi faqat ko'ra oladi."
            return False
        return True


class IsAdminOrDevSuperuser(BasePermission):
    message = "Bu amal faqat administrator uchun."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class IsDevSuperuser(BasePermission):
    """Only the hardcoded dev superuser may manage other admins or change
    the `role` field — mirrors firestore.rules' isDev()-only branches."""

    message = "Bu amal faqat dasturchi uchun."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_dev_superuser)


class IsStudent(BasePermission):
    message = "Bu bo'lim faqat tasdiqlangan o'quvchilar uchun."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_student and user.approved)


class IsTeacher(BasePermission):
    """Someone who runs classes: an approved staff member who isn't the
    read-only Kuzatuvchi (admins/boshliq count — they may teach too)."""

    message = "Bu amal faqat o'qituvchi uchun."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff_member and not user.is_observer)


class IsOversight(BasePermission):
    """Cross-teacher visibility (admin, boshliq, dev, Kuzatuvchi). Unsafe
    methods additionally require is_admin, so Kuzatuvchi stays read-only."""

    message = "Bu bo'lim ma'muriyat uchun."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_oversight):
            return False
        if request.method not in SAFE_METHODS:
            return user.is_admin
        return True


class IsOwnerTeacherOrAdminReadOnly(BasePermission):
    """Object-level: journal/timetable rows are writable only by their
    owning teacher; admins get read-only cross-teacher access."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        owner = getattr(obj, 'teacher', None)
        if owner is not None and owner == user:
            return True
        if request.method in SAFE_METHODS:
            return bool(user.is_oversight)
        return False
