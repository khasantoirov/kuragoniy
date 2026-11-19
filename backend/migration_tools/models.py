from django.db import models


class ImportedRow(models.Model):
    """One row copied in from another platform's database (import_af):
    where it came from and what it became here. A second run of the import
    skips whatever is already listed, so it never makes duplicates."""

    source = models.CharField(max_length=20)       # 'af' — amaliyfizika.uz
    table = models.CharField(max_length=60)        # the source table
    source_id = models.CharField(max_length=64)
    target_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['source', 'table', 'source_id'], name='imported_row_once')]

    def __str__(self):
        return f'{self.source}:{self.table}:{self.source_id} → {self.target_id}'
