"""
Permission classes replicating the role/approval logic that used to live
in firestore.rules (see repo root firestore.rules for the original):

  isDev()      -> user.is_dev_superuser
  isAdmin()    -> isDev() || role == 'admin'
  isApproved() -> isDev() || approved == true || role == 'admin'
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsApproved(BasePermission):
    message = "Hisobingiz hali tasdiqlanmagan."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_approved_effective)


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


class IsOwnerTeacherOrAdminReadOnly(BasePermission):
    """Object-level: journal/timetable rows are writable only by their
    owning teacher; admins get read-only cross-teacher access."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        owner = getattr(obj, 'teacher', None)
        if owner is not None and owner == user:
            return True
        if request.method in SAFE_METHODS:
            return bool(user.is_admin)
        return False
