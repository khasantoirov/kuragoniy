"""Ustozlar lentasi (/api/feed/).

  ''                 — the posts, newest first (?before=<id> for the next page); POST a new one
  <id>/              — PATCH (author: text; admin: pin/hide), DELETE (author or admin)
  <id>/like/         — POST toggles one's like
  <id>/comments/     — GET all, POST one
  comments/<id>/     — DELETE (its author or an admin)

Teachers and the administration read and write; the Kuzatuvchi reads.
"""

from datetime import timedelta
from urllib.parse import urlparse

from django.db.models import Count, Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from common.protected_media import protected_url
from common.subjects import main_subject, window
from common.uploads import delete_file_field, validate_upload
from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .models import Comment, Post, PostLike

PAGE = 20
DAILY_POSTS = 20
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp')
IMAGE_MAX_MB = 3  # the browser shrinks it first; this only stops a raw photo


class CanReadFeed(BasePermission):
    message = "Lenta o'qituvchilar uchun."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.is_staff_member) or u.is_school_admin:
            return False
        if u.is_observer and request.method not in SAFE_METHODS:
            self.message = "Kuzatuvchi faqat ko'ra oladi."
            return False
        return True


def _text(raw, limit, field, label) -> str:
    text = str(raw or '').strip()
    if not text:
        raise ValidationError({field: f'{label} yozing.'})
    return text[:limit]


def _url(raw) -> str:
    url = str(raw or '').strip()
    if not url:
        return ''
    if urlparse(url).scheme not in ('http', 'https'):
        raise ValidationError({'link_url': "Havola http:// yoki https:// bilan boshlansin."})
    return url[:500]


def _row(p: Post, user) -> dict:
    """One post as the page shows it — `p` comes from _annotated()."""
    return {
        'id': p.id, 'kind': p.kind, 'body': p.body, 'link_url': p.link_url, 'is_pinned': p.is_pinned,
        'image': protected_url(p.image) if p.image else None,
        'hidden': p.hidden, 'created_at': p.created_at, 'edited_at': p.edited_at,
        'author': {'id': p.author_id, 'name': p.author.name, 'photo': p.author.photo.url if p.author.photo else None},
        'likes': p.n_likes, 'liked': p.i_liked, 'comments': p.n_comments,
        'mine': p.author_id == user.id,
    }


def _annotated(user):
    return Post.objects.select_related('author').annotate(
        n_likes=Count('likes', distinct=True), n_comments=Count('comments', distinct=True),
        i_liked=Exists(PostLike.objects.filter(post=OuterRef('pk'), user=user)),
    )


def _windowed(qs, request):
    """The posts of the fan window this request is in (all with no window)."""
    fan = window(request)
    return qs.filter(fan=fan) if fan else qs


class FeedView(APIView):
    permission_classes = [CanReadFeed]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        user = request.user
        # explicit order: an aggregate query drops the model's own ordering;
        # newest first by id, which is also what ?before= pages by
        qs = _windowed(_annotated(user), request).order_by('-is_pinned', '-id')
        if not user.is_admin:
            qs = qs.filter(hidden=False)
        before = request.query_params.get('before')
        if before and str(before).isdigit():
            # pinned posts come on the first page only
            qs = qs.filter(id__lt=int(before), is_pinned=False)
        rows = list(qs[:PAGE + 1])
        more = len(rows) > PAGE
        rows = rows[:PAGE]
        last_plain = next((p.id for p in reversed(rows) if not p.is_pinned), None)
        return Response({'posts': [_row(p, user) for p in rows], 'next': last_plain if more else None})

    def post(self, request):
        user = request.user
        if Post.objects.filter(author=user, kind=Post.Kind.POST,
                               created_at__gte=timezone.now() - timedelta(days=1)).count() >= DAILY_POSTS:
            raise ValidationError({'detail': "Bir kunda ko'pi bilan 20 ta post yozish mumkin."})
        image = request.FILES.get('image')
        if image:
            validate_upload(image, IMAGE_EXTENSIONS, IMAGE_MAX_MB)
        # a picture may go without words; words are needed otherwise
        body = str(request.data.get('body') or '').strip()[:3000] if image else             _text(request.data.get('body'), 3000, 'body', 'Post matnini')
        p = Post.objects.create(author=user, body=body, link_url=_url(request.data.get('link_url')), image=image,
                                fan=window(request) or main_subject(user))
        return Response(_row(_annotated(user).get(pk=p.pk), user), status=status.HTTP_201_CREATED)


class PostView(APIView):
    permission_classes = [CanReadFeed]

    def patch(self, request, pk):
        user = request.user
        p = get_object_or_404(Post, pk=pk)
        if user.is_admin:
            for f in ('is_pinned', 'hidden'):
                if f in request.data:
                    setattr(p, f, bool(request.data[f]))
        if 'body' in request.data or 'link_url' in request.data:
            if p.author_id != user.id or p.kind != Post.Kind.POST:
                raise PermissionDenied("Faqat o'z postingizni tahrirlay olasiz.")
            if 'body' in request.data:
                p.body = _text(request.data.get('body'), 3000, 'body', 'Post matnini')
            if 'link_url' in request.data:
                p.link_url = _url(request.data.get('link_url'))
            p.edited_at = timezone.now()
        elif not user.is_admin:
            raise PermissionDenied("Bu amal faqat administrator uchun.")
        p.save()
        return Response(_row(_annotated(user).get(pk=p.pk), user))

    def delete(self, request, pk):
        p = get_object_or_404(Post, pk=pk)
        if p.author_id != request.user.id and not request.user.is_admin:
            raise PermissionDenied("Faqat o'z postingizni o'chira olasiz.")
        delete_file_field(p, 'image')
        p.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LikeView(APIView):
    permission_classes = [CanReadFeed]

    def post(self, request, pk):
        p = get_object_or_404(_windowed(Post.objects.all(), request), pk=pk, hidden=False)
        like, created = PostLike.objects.get_or_create(post=p, user=request.user)
        if not created:
            like.delete()
        return Response({'liked': created, 'likes': p.likes.count()})


class CommentsView(APIView):
    permission_classes = [CanReadFeed]

    def _post(self, request, pk) -> Post:
        qs = _windowed(Post.objects.select_related('author'), request)
        if not request.user.is_admin:
            qs = qs.filter(hidden=False)
        return get_object_or_404(qs, pk=pk)

    def get(self, request, pk):
        p = self._post(request, pk)
        return Response([{'id': c.id, 'body': c.body, 'created_at': c.created_at, 'mine': c.author_id == request.user.id,
                          'author': {'id': c.author_id, 'name': c.author.name,
                                     'photo': c.author.photo.url if c.author.photo else None}}
                         for c in p.comments.select_related('author')])

    def post(self, request, pk):
        p = self._post(request, pk)
        user = request.user
        c = Comment.objects.create(post=p, author=user, body=_text(request.data.get('body'), 1000, 'body', 'Izoh'))
        if p.author_id != user.id and p.kind == Post.Kind.POST:
            notify(p.author, NotifyKind.LENTA, f"{user.name} postingizga izoh yozdi", c.body[:200], url='/feed')
        return Response({'id': c.id, 'body': c.body, 'created_at': c.created_at, 'mine': True,
                         'author': {'id': user.id, 'name': user.name, 'photo': user.photo.url if user.photo else None}},
                        status=status.HTTP_201_CREATED)


class CommentView(APIView):
    permission_classes = [CanReadFeed]

    def delete(self, request, pk):
        c = get_object_or_404(Comment, pk=pk)
        if c.author_id != request.user.id and not request.user.is_admin:
            raise PermissionDenied("Faqat o'z izohingizni o'chira olasiz.")
        c.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
