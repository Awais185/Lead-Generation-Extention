from django.db import models



class GeneratedComment(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('POSTED', 'Posted'),
        ('FAILED', 'Failed'),
        ('SKIPPED', 'Skipped'),
    )
    
    post_text = models.TextField()
    ai_comment = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.status} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"


class JoinedGroup(models.Model):
    group_url = models.URLField(max_length=500, unique=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.group_url

class WelcomeTemplate(models.Model):
    message_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class LinkedInComment(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('POSTED', 'Posted'),
        ('FAILED', 'Failed'),
        ('SKIPPED', 'Skipped'),
    )
    
    post_text = models.TextField()
    ai_comment = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"LinkedIn: {self.status} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"


class DailyStats(models.Model):
    date = models.DateField(auto_now_add=True, unique=True)
    fb_scanned = models.IntegerField(default=0)
    li_scanned = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.date} - FB: {self.fb_scanned}, LI: {self.li_scanned}"