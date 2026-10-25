from django.contrib import admin
from django.utils import timezone
from datetime import timedelta
from .models import GeneratedComment, JoinedGroup, WelcomeTemplate, LinkedInComment

@admin.register(GeneratedComment)
class GeneratedCommentAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'status', 'short_post', 'short_comment')
    list_filter = ('status', 'created_at')
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        seven_days_ago = timezone.now() - timedelta(days=7)
        return qs.filter(created_at__gte=seven_days_ago)

    def short_post(self, obj):
        return obj.post_text[:50] + "..." if len(obj.post_text) > 50 else obj.post_text
    short_post.short_description = "Post Text"

    def short_comment(self, obj):
        if not obj.ai_comment: return "-"
        return obj.ai_comment[:50] + "..." if len(obj.ai_comment) > 50 else obj.ai_comment
    short_comment.short_description = "AI Comment"

@admin.register(JoinedGroup)
class JoinedGroupAdmin(admin.ModelAdmin):
    list_display = ('joined_at', 'group_url')
    


@admin.register(WelcomeTemplate)
class WelcomeTemplateAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'message_text')



@admin.register(LinkedInComment)
class LinkedInCommentAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'status', 'short_post')
    list_filter = ('status', 'created_at')

    def short_post(self, obj):
        return obj.post_text[:50] + "..." if len(obj.post_text) > 50 else obj.post_text