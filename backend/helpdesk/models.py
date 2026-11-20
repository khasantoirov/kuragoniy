"""Yordam markazi — answers to the usual questions, and asking the
administration for help.

  FaqItem       — one question and its answer (the administration edits them)
  Ticket        — a staff member's murojaat: a subject, then a conversation
  TicketMessage — one message of it (the author's or the administration's)
"""

from django.conf import settings
from django.db import models

from common.subjects import CHOICES as SUBJECT_CHOICES


class Category(models.TextChoices):
    UMUMIY = 'umumiy', 'Umumiy'
    KIRISH = 'kirish', 'Kirish va hisob'
    JURNAL = 'jurnal', 'Jurnal'
    JADVAL = 'jadval', 'Jadval va Ustozlar xonasi'
    DARSLAR = 'darslar', 'Darslar va materiallar'
    MALAKA = 'malaka', 'Malaka oshirish'
    TEXNIK = 'texnik', 'Texnik nosozlik'
    TAKLIF = 'taklif', 'Taklif'


class FaqItem(models.Model):
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.UMUMIY)
    question = models.CharField(max_length=300)
    answer = models.TextField()
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'order', 'id']

    def __str__(self):
        return self.question


class Ticket(models.Model):
    class Status(models.TextChoices):
        OPEN = 'yangi', 'Javob kutilmoqda'
        ANSWERED = 'javob', 'Javob berildi'
        SOLVED = 'hal', 'Hal qilindi'

    author = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='help_tickets', on_delete=models.CASCADE)
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.UMUMIY)
    subject = models.CharField(max_length=200)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    # the page they were on when they asked (when the form was opened from one)
    page = models.CharField(max_length=300, blank=True)
    # Fizika or STEAM window (common/subjects.py): it shows in that one only
    fan = models.CharField(max_length=10, choices=SUBJECT_CHOICES, default='steam', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    solved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [models.Index(fields=['status', '-updated_at'])]

    def __str__(self):
        return f'#{self.id} {self.subject}'


class TicketMessage(models.Model):
    ticket = models.ForeignKey(Ticket, related_name='messages', on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', null=True, on_delete=models.SET_NULL)
    # written by the administration (not the ticket's author)
    staff = models.BooleanField(default=False)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
