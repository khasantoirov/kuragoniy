from django.urls import path

from . import student_views as v

urlpatterns = [
    path('join-info/', v.JoinInfoView.as_view(), name='student-join-info'),
    path('register/', v.StudentRegisterView.as_view(), name='student-register'),
    path('join/', v.StudentJoinClassView.as_view(), name='student-join'),
    path('dashboard/', v.StudentDashboardView.as_view(), name='student-dashboard'),
    path('lessons/', v.StudentLessonsView.as_view(), name='student-lessons'),
    path('lessons/<int:lesson_id>/', v.StudentLessonDetailView.as_view(), name='student-lesson'),
    path('lessons/<int:lesson_id>/practice/', v.StudentPracticeStartView.as_view(), name='student-practice'),
    path('assignments/', v.StudentAssignmentsView.as_view(), name='student-assignments'),
    path('assignments/<int:assignment_id>/start/', v.StudentAssignmentStartView.as_view(), name='student-assignment-start'),
    path('attempts/<int:attempt_id>/', v.StudentAttemptView.as_view(), name='student-attempt'),
    path('attempts/<int:attempt_id>/submit/', v.StudentAttemptSubmitView.as_view(), name='student-attempt-submit'),
    path('results/', v.StudentResultsView.as_view(), name='student-results'),
    path('leaderboard/', v.StudentLeaderboardView.as_view(), name='student-leaderboard'),
    path('awards/', v.StudentAwardsView.as_view(), name='student-awards'),
]
