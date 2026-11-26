"""Yordam markazi (/api/help/).

  faq/                     — the questions and answers (the administration edits)
  tickets/                 — one's own murojaatlar; ?all=1 for the administration
  tickets/<id>/            — the conversation; PATCH {status}
  tickets/<id>/messages/   — a reply

Any staff member may ask — the read-only roles (Kuzatuvchi, a school's
ma'muriyat) included, so the path is in common/authentication.py's
SELF_SERVICE_PREFIXES.
"""

from datetime import timedelta

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.security import log_event
from common.subjects import assigned, main_subject, window
from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .models import Category, FaqItem, Ticket, TicketMessage

DAILY_LIMIT = 10


class IsStaffMember(BasePermission):
    message = "Hisobingiz hali tasdiqlanmagan."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff_member)


def _answers(admin, fan) -> bool:
    """Whether an administrator hears of a fan window's murojaat: one pointed
    to fans hears of theirs only; one with none set, of every window's."""
    mine = assigned(admin)
    return not fan or not mine or fan in mine


def _admins():
    return list(User.objects.filter(is_active=True).filter(
        Q(is_dev_superuser=True) | Q(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ])))


class FaqSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = FaqItem
        fields = ['id', 'category', 'category_label', 'question', 'answer', 'order', 'is_published', 'updated_at']
        read_only_fields = ['updated_at']

    def validate_question(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Savolni yozing.')
        return value

    def validate_answer(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Javobni yozing.')
        return value[:10000]


class FaqView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        qs = FaqItem.objects.all()
        if not request.user.is_admin:
            qs = qs.filter(is_published=True)
        return Response({
            'items': FaqSerializer(qs, many=True).data,
            'categories': [{'value': v, 'label': lbl} for v, lbl in Category.choices],
        })

    def post(self, request):
        if not request.user.is_admin:
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        s = FaqSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(FaqSerializer(s.save()).data, status=status.HTTP_201_CREATED)


class FaqItemView(APIView):
    permission_classes = [IsStaffMember]

    def patch(self, request, pk):
        if not request.user.is_admin:
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        item = get_object_or_404(FaqItem, pk=pk)
        s = FaqSerializer(item, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        return Response(FaqSerializer(s.save()).data)

    def delete(self, request, pk):
        if not request.user.is_admin:
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        get_object_or_404(FaqItem, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True, default='')

    class Meta:
        model = TicketMessage
        fields = ['id', 'author', 'author_name', 'staff', 'body', 'created_at']


class TicketSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    author_role = serializers.CharField(source='author.get_role_display', read_only=True)
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    messages_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Ticket
        fields = ['id', 'author', 'author_name', 'author_role', 'category', 'category_label', 'subject', 'status',
                  'status_label', 'page', 'created_at', 'updated_at', 'solved_at', 'messages_count']


def _own_or_admin(request, pk) -> Ticket:
    t = get_object_or_404(Ticket.objects.select_related('author'), pk=pk)
    if t.author_id != request.user.id and not request.user.is_admin:
        raise PermissionDenied("Bu murojaat sizniki emas.")
    return t


def _detail(t: Ticket) -> dict:
    return {**TicketSerializer(t).data,
            'messages': MessageSerializer(t.messages.select_related('author'), many=True).data}


def _body(raw) -> str:
    body = str(raw or '').strip()
    if not body:
        raise ValidationError({'body': 'Xabarni yozing.'})
    return body[:5000]


class TicketsView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        qs = Ticket.objects.select_related('author').annotate(messages_count=Count('messages'))
        if request.user.is_admin and request.query_params.get('all') == '1':
            # the administration of a fan window answers that window's murojaatlar
            fan = window(request)
            if fan:
                qs = qs.filter(fan=fan)
            st = request.query_params.get('status')
            if st == 'open':
                qs = qs.exclude(status=Ticket.Status.SOLVED)
            elif st:
                qs = qs.filter(status=st)
        else:
            qs = qs.filter(author=request.user)
        return Response(TicketSerializer(qs[:300], many=True).data)

    def post(self, request):
        user = request.user
        if Ticket.objects.filter(author=user, created_at__gte=timezone.now() - timedelta(days=1)).count() >= DAILY_LIMIT:
            raise ValidationError({'detail': "Bir kunda ko'pi bilan 10 ta murojaat yuborish mumkin."})
        subject = str(request.data.get('subject') or '').strip()[:200]
        if not subject:
            raise ValidationError({'subject': 'Mavzuni yozing.'})
        category = request.data.get('category') or Category.UMUMIY
        if category not in Category.values:
            raise ValidationError({'category': "Bo'lim noto'g'ri."})
        body = _body(request.data.get('body'))
        fan = window(request) or main_subject(user)
        t = Ticket.objects.create(author=user, subject=subject, category=category, fan=fan,
                                  page=str(request.data.get('page') or '')[:300])
        TicketMessage.objects.create(ticket=t, author=user, body=body)
        notify([a for a in _admins() if a.id != user.id and _answers(a, fan)], NotifyKind.YORDAM,
               f"Yangi murojaat: {subject}",
               f"{user.name} · {t.get_category_display()}\n{body[:300]}", url=f'/help?bolim=murojaatlar&t={t.id}', fan=fan)
        log_event('help_ticket', actor=user, request=request, detail=f'#{t.id} {subject}')
        return Response(_detail(t), status=status.HTTP_201_CREATED)


class TicketView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        return Response(_detail(_own_or_admin(request, pk)))

    def patch(self, request, pk):
        """{status: "hal"} — either side closes it; "yangi" reopens."""
        t = _own_or_admin(request, pk)
        new = request.data.get('status')
        if new not in (Ticket.Status.SOLVED, Ticket.Status.OPEN):
            raise ValidationError({'status': "Holat noto'g'ri."})
        t.status = new
        t.solved_at = timezone.now() if new == Ticket.Status.SOLVED else None
        t.save(update_fields=['status', 'solved_at', 'updated_at'])
        if new == Ticket.Status.SOLVED and t.author_id != request.user.id:
            notify(t.author, NotifyKind.YORDAM, f"Murojaatingiz hal qilindi: {t.subject}", '', url=f'/help?bolim=mening&t={t.id}', fan=t.fan)
        return Response(_detail(t))


class TicketMessagesView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        t = _own_or_admin(request, pk)
        user = request.user
        body = _body(request.data.get('body'))
        staff = user.id != t.author_id
        TicketMessage.objects.create(ticket=t, author=user, body=body, staff=staff)
        # the administration answered → waits for the author; the author
        # wrote → waits for the administration (a solved one reopens)
        t.status = Ticket.Status.ANSWERED if staff else Ticket.Status.OPEN
        t.solved_at = None
        t.save(update_fields=['status', 'solved_at', 'updated_at'])
        if staff:
            notify(t.author, NotifyKind.YORDAM, f"Murojaatingizga javob: {t.subject}", body[:300],
                   url=f'/help?bolim=mening&t={t.id}', fan=t.fan)
        else:
            replied = set(t.messages.filter(staff=True).values_list('author_id', flat=True))
            to = [a for a in _admins() if a.id != user.id and (a.id in replied if replied else _answers(a, t.fan))]
            notify(to, NotifyKind.YORDAM, f"Murojaatga yangi xabar: {t.subject}", f"{user.name}\n{body[:300]}",
                   url=f'/help?bolim=murojaatlar&t={t.id}', fan=t.fan)
        return Response(_detail(t), status=status.HTTP_201_CREATED)
