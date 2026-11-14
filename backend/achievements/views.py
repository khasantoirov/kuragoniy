"""Reyting va nishonlar (/api/achievements/, pupils: /api/student/badges/)."""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsStudent

from .badges import is_teacher, leaderboard, progress


class IsStaffMember(BasePermission):
    message = "Hisobingiz hali tasdiqlanmagan."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff_member)


class BadgesView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        if not is_teacher(request.user):
            raise PermissionDenied("Nishonlar o'qituvchilar uchun.")
        return Response(progress(request.user))


class LeaderboardView(APIView):
    """A month's teacher activity points; ?month=YYYY-MM (default: this one)."""

    permission_classes = [IsStaffMember]

    def get(self, request):
        user = request.user
        if not (is_teacher(user) or user.is_oversight):
            raise PermissionDenied("Reyting o'qituvchilar uchun.")
        return Response(leaderboard(request.query_params.get('month')))


class StudentBadgesView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return Response(progress(request.user))
