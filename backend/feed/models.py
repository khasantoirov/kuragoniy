"""Ustozlar lentasi — the teachers' own feed: what worked in class, a useful
link, a question to colleagues; likes and comments. The platform adds a
line when someone finishes a course or reaches a silver/gold badge.
A post may carry one picture: shrunk in the browser, capped on the
server, given out only as an expiring link (common/protected_media.py)."""

from django.conf import settings
from django.db import models


class Post(models.Model):
    class Kind(models.TextChoices):
        POST = 'post', 'Post'
        AUTO = 'auto', 'Platforma xabari'

    author = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='feed_posts', on_delete=models.CASCADE)
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.POST)
    body = models.TextField()
    link_url = models.URLField(max_length=500, blank=True)
    image = models.FileField(upload_to='feed-images/', null=True, blank=True)
    # an automatic line is made once per event ("cert:12", "badge:<user>:hisobot:3")
    auto_key = models.CharField(max_length=80, blank=True, db_index=True)
    is_pinned = models.BooleanField(default=False)
    hidden = models.BooleanField(default=False)  # the administration took it down
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-is_pinned', '-created_at']
        indexes = [models.Index(fields=['hidden', '-created_at'])]


class PostLike(models.Model):
    post = models.ForeignKey(Post, related_name='likes', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('post', 'user')


class Comment(models.Model):
    post = models.ForeignKey(Post, related_name='comments', on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', on_delete=models.CASCADE)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
