import re
import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from lessons.fixtures.steam_lessons_data import LESSONS
from lessons.models import Experiment, Lesson

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "fixtures"
IMAGES_DIR = FIXTURES_DIR / "steam_images"


def split_materials(text: str) -> list[str]:
    """Splits a "Kerakli jihozlar" sentence into individual tags on ", ",
    but never inside parentheses — "rezistorlar (220Ω, 1kΩ, 10kΩ)" stays one
    item instead of exploding into three at its internal commas."""
    text = text.strip().rstrip(".")
    if not text:
        return []
    parts: list[str] = []
    depth = 0
    current = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
            current += ch
        elif ch == ")":
            depth = max(0, depth - 1)
            current += ch
        elif ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
            # skip the space that normally follows a splitting comma
            if i + 1 < len(text) and text[i + 1] == " ":
                i += 1
        else:
            current += ch
        i += 1
    if current.strip():
        parts.append(current.strip())
    return [p for p in parts if p]


class Command(BaseCommand):
    help = (
        "One-time content load: the 4 STEAM/robotics curriculum PDFs "
        "(1-2, 3-4, 5-6, 7 grade bands x 16 lessons, chorak 1) into "
        "real Lesson/Experiment rows. Safe to re-run — skips any "
        "(grade, chorak, hafta) that already has a lesson."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print the plan, write nothing.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created = 0
        skipped = 0

        for row in LESSONS:
            exists = Lesson.objects.filter(grade=row["grade"], chorak=1, hafta=row["hafta"]).exists()
            if exists:
                skipped += 1
                self.stdout.write(f"  skip  {row['grade']:>5}  hafta {row['hafta']:>2}  {row['title']} (already exists)")
                continue

            desc = row["desc"]
            question = row.get("question")
            if question:
                desc = f"{desc}\n\n💡 Muammoli STEAM savoli: {question}"

            image_name = row.get("image")
            image_url = ""
            if image_name:
                src = IMAGES_DIR / row["grade"] / image_name
                if not src.exists():
                    self.stderr.write(self.style.WARNING(f"  missing image file: {src}"))
                else:
                    image_url = f"/media/lesson-images/{row['grade']}/{image_name}"

            self.stdout.write(f"  add   {row['grade']:>5}  hafta {row['hafta']:>2}  {row['title']}")

            if dry_run:
                created += 1
                continue

            with transaction.atomic():
                lesson = Lesson.objects.create(
                    title=row["title"],
                    grade=row["grade"],
                    chorak=1,
                    hafta=row["hafta"],
                    goal=row["goal"],
                )
                if image_name and image_url:
                    dest_dir = Path(settings.MEDIA_ROOT) / "lesson-images" / row["grade"]
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(IMAGES_DIR / row["grade"] / image_name, dest_dir / image_name)

                Experiment.objects.create(
                    lesson=lesson,
                    order=0,
                    name=row["title"],
                    desc=desc,
                    materials=split_materials(row["materials"]),
                    concepts=row["concepts"],
                    image=image_url,
                )
            created += 1

        verb = "would create" if dry_run else "created"
        self.stdout.write(self.style.SUCCESS(f"\n{verb}: {created} lesson(s), skipped (already existed): {skipped}"))
