"""STEAM chamadonlar (/api/kits/).

  ''                       — the catalogue; POST (admin) a new kit
  <id>/                    — a kit: contents, instructions, lessons it serves
  <id>/items/              — PUT (admin): its whole contents
  <id>/fill/               — POST (admin): add what chosen lessons need
  lessons/<id>/            — a lesson: what it needs, the kits that serve it
  schools/<id>/            — a school's kits; POST/DELETE (admin)
  requests/                — "chamadon so'rash": one's own; ?all=1 for admins
  requests/<id>/           — PATCH: the administration answers / the asker cancels
"""

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.security import log_event
from common.subjects import STEAM, window
from lessons.models import Lesson
from lessons.visibility import visible_lessons
from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .coverage import cover, equipment_key, kit_contents, lesson_needs, prices, viewer_school_ids
from .models import Kit, KitItem, KitRequest, SchoolKit


class IsStaffMember(BasePermission):
    message = "Hisobingiz hali tasdiqlanmagan."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff_member)


def _admin(request):
    if not request.user.is_admin:
        raise PermissionDenied('Bu amal faqat administrator uchun.')


def _admins():
    return list(User.objects.filter(is_active=True).filter(
        Q(is_dev_superuser=True) | Q(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ])))


def _visible_lessons(user, request=None):
    # the open quarters and the window's fan (lessons/visibility.py)
    return visible_lessons(Lesson.objects.all(), user, window(request))


def _my_schools(user) -> list[dict]:
    from schools.models import School

    return [{'id': s.id, 'name': s.name} for s in School.objects.filter(id__in=viewer_school_ids(user)).order_by('name')]


def _owned(kit_ids, school_ids) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for sk in SchoolKit.objects.filter(kit_id__in=list(kit_ids), school_id__in=list(school_ids)).select_related('school'):
        out.setdefault(sk.kit_id, []).append({'id': sk.school_id, 'name': sk.school.name, 'quantity': sk.quantity})
    return out


class KitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Kit
        fields = ['id', 'name', 'code', 'description', 'instructions', 'instructions_url', 'cover_url', 'is_active',
                  'order', 'updated_at']
        read_only_fields = ['updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Chamadon nomini kiriting.')
        return value


class KitsView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        user = request.user
        kits = list(Kit.objects.all() if user.is_admin else Kit.objects.filter(is_active=True))
        contents = kit_contents([k.id for k in kits])
        lessons = {lesson.id for lesson in _visible_lessons(user, request).only('id')}
        needs = {lid: n for lid, n in lesson_needs(lessons).items() if n}
        cat = prices({key for c in contents.values() for key in c})
        owned = _owned([k.id for k in kits], viewer_school_ids(user))
        out = []
        for k in kits:
            c = contents.get(k.id, {})
            full = sum(1 for n in needs.values() if cover(n, c)['percent'] == 100)
            priced = [(cat[key]['price'], qty) for key, qty in c.items() if cat.get(key, {}).get('price') is not None]
            out.append({
                **KitSerializer(k).data,
                'item_count': len(c), 'pieces': sum(c.values()), 'lessons_full': full,
                'price': sum(p * q for p, q in priced) if priced else None, 'priced_items': len(priced),
                'owned': owned.get(k.id, []),
            })
        return Response(out)

    def post(self, request):
        _admin(request)
        s = KitSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        kit = s.save()
        log_event('kit_added', actor=request.user, request=request, detail=kit.name)
        return Response(KitSerializer(kit).data, status=status.HTTP_201_CREATED)


def _kit_detail(request, kit: Kit) -> dict:
    user = request.user
    c = kit_contents([kit.id]).get(kit.id, {})
    items = list(kit.items.all())
    cat = prices([i.key for i in items])
    lessons = {lesson.id: lesson for lesson in _visible_lessons(user, request)}
    rows = []
    for lid, n in lesson_needs(lessons.keys()).items():
        if not n:
            continue
        res = cover(n, c)
        if res['percent'] > 0:
            lesson = lessons[lid]
            rows.append({'id': lid, 'title': lesson.title, 'grade': lesson.grade, 'chorak': lesson.chorak,
                         'hafta': lesson.hafta, 'percent': res['percent'], 'missing': len(res['missing'])})
    rows.sort(key=lambda r: (-r['percent'], str(r['grade']), r['chorak'], r['hafta']))
    data = {
        **KitSerializer(kit).data,
        'items': [{'id': i.id, 'key': i.key, 'name': i.name, 'quantity': i.quantity, **cat.get(i.key, {'price': None, 'image': None})}
                  for i in items],
        'lessons': rows,
        'owned': _owned([kit.id], viewer_school_ids(user)).get(kit.id, []),
        'my_schools': _my_schools(user),
    }
    if user.is_admin:
        data['grades'] = [{'value': v, 'label': lbl} for v, lbl in Lesson.Grade.choices]
    if user.is_oversight:
        data['schools'] = [{'id': sk.school_id, 'name': sk.school.name, 'quantity': sk.quantity, 'received_on': sk.received_on}
                           for sk in kit.schools.select_related('school')]
    return data


class KitView(APIView):
    permission_classes = [IsStaffMember]

    def _kit(self, request, pk):
        qs = Kit.objects.all() if request.user.is_admin else Kit.objects.filter(is_active=True)
        return get_object_or_404(qs, pk=pk)

    def get(self, request, pk):
        return Response(_kit_detail(request, self._kit(request, pk)))

    def patch(self, request, pk):
        _admin(request)
        kit = self._kit(request, pk)
        s = KitSerializer(kit, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(_kit_detail(request, kit))

    def delete(self, request, pk):
        _admin(request)
        kit = self._kit(request, pk)
        log_event('kit_deleted', actor=request.user, request=request, detail=kit.name)
        kit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _clean_items(raw) -> list[tuple[str, str, int]]:
    if not isinstance(raw, list) or len(raw) > 300:
        raise ValidationError({'items': "Jihozlar ro'yxati noto'g'ri."})
    out: dict[str, tuple[str, str, int]] = {}
    for row in raw:
        name = str((row or {}).get('name') or '').strip()[:255]
        key = equipment_key(name)
        if not key:
            continue
        try:
            qty = max(1, min(1000, int(row.get('quantity') or 1)))
        except (TypeError, ValueError):
            raise ValidationError({'items': f"«{name}» soni noto'g'ri."})
        prev = out.get(key)
        out[key] = (key, name, qty if prev is None else prev[2] + qty)
    return list(out.values())


class KitItemsView(APIView):
    """PUT {items: [{name, quantity}]} — the kit's whole contents."""

    permission_classes = [IsStaffMember]

    def put(self, request, pk):
        _admin(request)
        kit = get_object_or_404(Kit, pk=pk)
        items = _clean_items(request.data.get('items'))
        with transaction.atomic():
            kit.items.all().delete()
            KitItem.objects.bulk_create([KitItem(kit=kit, key=k, name=n, quantity=q, order=i)
                                         for i, (k, n, q) in enumerate(items)])
            kit.save(update_fields=['updated_at'])
        return Response(_kit_detail(request, kit))


class KitFillView(APIView):
    """POST {lessons: [ids]} or {grade, chorak} — adds what those lessons
    need (each piece as many as the most demanding lesson), keeping what the
    kit already holds when it is more."""

    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        _admin(request)
        kit = get_object_or_404(Kit, pk=pk)
        qs = Lesson.objects.all()
        ids = request.data.get('lessons')
        if ids:
            qs = qs.filter(id__in=[i for i in ids if str(i).isdigit()])
        elif request.data.get('grade'):
            qs = qs.filter(grade=request.data['grade'])
            if request.data.get('chorak'):
                qs = qs.filter(chorak=request.data['chorak'])
        else:
            raise ValidationError({'detail': "Darslarni yoki sinfni tanlang."})
        merged: dict[str, dict] = {}
        for n in lesson_needs(qs.values_list('id', flat=True)).values():
            for key, need in n.items():
                row = merged.setdefault(key, {'name': need['name'], 'quantity': 0})
                row['quantity'] = max(row['quantity'], need['quantity'])
        current = {i.key: i for i in kit.items.all()}
        added = 0
        with transaction.atomic():
            order = len(current)
            for key, need in merged.items():
                item = current.get(key)
                if item is None:
                    KitItem.objects.create(kit=kit, key=key, name=need['name'], quantity=need['quantity'], order=order)
                    order += 1
                    added += 1
                elif item.quantity < need['quantity']:
                    item.quantity = need['quantity']
                    item.save(update_fields=['quantity'])
            kit.save(update_fields=['updated_at'])
        return Response({**_kit_detail(request, kit), 'added': added})


class LessonKitsView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, lesson_id):
        user = request.user
        lesson = get_object_or_404(_visible_lessons(user, request), pk=lesson_id)
        needs = lesson_needs([lesson.id]).get(lesson.id, {})
        kits = list(Kit.objects.filter(is_active=True))
        contents = kit_contents([k.id for k in kits])
        schools = viewer_school_ids(user)
        owned = _owned([k.id for k in kits], schools)
        rows = []
        for k in kits:
            res = cover(needs, contents.get(k.id, {}))
            if res['percent'] > 0:
                rows.append({'id': k.id, 'name': k.name, 'code': k.code, 'instructions_url': k.instructions_url,
                             **res, 'owned': owned.get(k.id, [])})
        rows.sort(key=lambda r: (-r['percent'], len(r['missing']), r['name']))
        return Response({
            'needs': sorted(needs.values(), key=lambda n: n['name'].lower()),
            'kits': rows,
            'my_schools': _my_schools(user),
        })


class SchoolKitsView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, school_id):
        from schools.access import can_view_school

        if not can_view_school(request.user, school_id):
            raise PermissionDenied("Bu maktab sizga biriktirilmagan.")
        rows = SchoolKit.objects.filter(school_id=school_id).select_related('kit')
        return Response([{'kit': sk.kit_id, 'name': sk.kit.name, 'code': sk.kit.code, 'quantity': sk.quantity,
                          'received_on': sk.received_on, 'note': sk.note} for sk in rows])

    def post(self, request, school_id):
        """{kit, quantity, received_on, note} — sets the school's count of a kit."""
        from schools.models import School

        _admin(request)
        school = get_object_or_404(School, pk=school_id)
        kit = get_object_or_404(Kit, pk=request.data.get('kit'))
        try:
            qty = max(1, min(500, int(request.data.get('quantity') or 1)))
        except (TypeError, ValueError):
            raise ValidationError({'quantity': "Soni noto'g'ri."})
        received = request.data.get('received_on') or None
        sk, _ = SchoolKit.objects.update_or_create(school=school, kit=kit, defaults={
            'quantity': qty, 'received_on': received, 'note': str(request.data.get('note') or '')[:255]})
        log_event('school_kit_set', actor=request.user, request=request, detail=f'{school.name}: {kit.name} ×{qty}')
        return Response({'ok': True})

    def delete(self, request, school_id):
        _admin(request)
        SchoolKit.objects.filter(school_id=school_id, kit_id=request.query_params.get('kit')).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class KitRequestSerializer(serializers.ModelSerializer):
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True, default='')
    kit_name = serializers.CharField(source='kit.name', read_only=True, default='')
    lesson_title = serializers.CharField(source='lesson.title', read_only=True, default='')
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    handled_by_name = serializers.CharField(source='handled_by.name', read_only=True, default='')

    class Meta:
        model = KitRequest
        fields = ['id', 'requester', 'requester_name', 'school', 'school_name', 'kit', 'kit_name', 'quantity', 'lesson',
                  'lesson_title', 'items', 'note', 'status', 'status_label', 'reply', 'handled_by_name', 'handled_at',
                  'created_at']


class KitRequestsView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        qs = KitRequest.objects.select_related('requester', 'school', 'kit', 'lesson', 'handled_by')
        if request.user.is_admin and request.query_params.get('all') == '1':
            st = request.query_params.get('status')
            if st == 'open':
                qs = qs.filter(status__in=[KitRequest.Status.NEW, KitRequest.Status.ACCEPTED])
            elif st:
                qs = qs.filter(status=st)
        else:
            qs = qs.filter(requester=request.user)
        return Response(KitRequestSerializer(qs[:300], many=True).data)

    def post(self, request):
        user = request.user
        if user.is_observer:
            raise PermissionDenied("Kuzatuvchi faqat ko'ra oladi.")
        data = request.data
        kit = get_object_or_404(Kit, pk=data['kit'], is_active=True) if data.get('kit') else None
        items = [{'name': n, 'quantity': q} for _, n, q in _clean_items(data.get('items') or [])]
        if not kit and not items:
            raise ValidationError({'detail': "Chamadonni yoki jihozlarni tanlang."})
        lesson = get_object_or_404(_visible_lessons(user, request), pk=data['lesson']) if data.get('lesson') else None
        mine = viewer_school_ids(user)
        school_id = data.get('school') or (next(iter(mine)) if len(mine) == 1 else None)
        if school_id and not user.is_admin and int(school_id) not in mine:
            raise PermissionDenied("Bu maktab sizga biriktirilmagan.")
        try:
            qty = max(1, min(100, int(data.get('quantity') or 1)))
        except (TypeError, ValueError):
            raise ValidationError({'quantity': "Soni noto'g'ri."})
        r = KitRequest.objects.create(requester=user, school_id=school_id, kit=kit, quantity=qty, lesson=lesson,
                                      items=items, note=str(data.get('note') or '').strip()[:2000])
        what = f"«{kit.name}» ×{qty}" if kit else f"{len(items)} ta jihoz" + (f" («{lesson.title}» uchun)" if lesson else '')
        where = r.school.name if r.school else ''
        notify([a for a in _admins() if a.id != user.id], NotifyKind.CHAMADON, f"Chamadon so'raldi: {user.name}",
               f"{what}{f' · {where}' if where else ''}", url='/lessons?bolim=chamadonlar&sub=sorovlar', fan=STEAM)
        log_event('kit_requested', actor=user, request=request, detail=f'{what} {where}'.strip())
        return Response(KitRequestSerializer(r).data, status=status.HTTP_201_CREATED)


class KitRequestView(APIView):
    """PATCH {status, reply}: the administration accepts, declines or marks
    it delivered (a delivered kit is added to the school's kits); the asker
    may only cancel one nobody has answered."""

    permission_classes = [IsStaffMember]

    def patch(self, request, pk):
        r = get_object_or_404(KitRequest.objects.select_related('requester', 'school', 'kit'), pk=pk)
        user = request.user
        new = request.data.get('status')
        if new == KitRequest.Status.CANCELLED:
            if r.requester_id != user.id:
                raise PermissionDenied("Faqat so'rov egasi bekor qila oladi.")
            if r.status != KitRequest.Status.NEW:
                raise ValidationError({'detail': "Javob berilgan so'rovni bekor qilib bo'lmaydi."})
            r.status = new
            r.save(update_fields=['status'])
            return Response(KitRequestSerializer(r).data)
        _admin(request)
        if new not in (KitRequest.Status.ACCEPTED, KitRequest.Status.DECLINED, KitRequest.Status.DELIVERED):
            raise ValidationError({'status': "Holat noto'g'ri."})
        was = r.status
        r.status = new
        r.reply = str(request.data.get('reply') or '').strip()[:2000]
        r.handled_by, r.handled_at = user, timezone.now()
        r.save()
        if new == KitRequest.Status.DELIVERED and was != new and r.kit_id and r.school_id:
            sk, created = SchoolKit.objects.get_or_create(
                school_id=r.school_id, kit_id=r.kit_id,
                defaults={'quantity': r.quantity, 'received_on': timezone.localdate()})
            if not created:
                sk.quantity += r.quantity
                sk.received_on = timezone.localdate()
                sk.save(update_fields=['quantity', 'received_on'])
        what = f"«{r.kit.name}»" if r.kit else "jihozlar"
        notify(r.requester, NotifyKind.CHAMADON, f"Chamadon so'rovingiz: {r.get_status_display().lower()}",
               f"{what}{f' · {r.school.name}' if r.school else ''}" + (f"\n{r.reply}" if r.reply else ''),
               url='/lessons?bolim=chamadonlar&sub=mening', fan=STEAM)
        log_event('kit_request_answered', actor=user, request=request, detail=f'#{r.id} {what}: {r.get_status_display()}')
        return Response(KitRequestSerializer(r).data)
