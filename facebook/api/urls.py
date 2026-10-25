from django.urls import path
from .views import (
    GenerateCommentView, 
    CheckPostView, 
    GenerateLinkedInCommentView, 
    GetTodayStatsView, 
    IncrementScannedView, 
    UpdateCommentStatusView, 
    CheckGroupView, 
    SaveGroupView, 
    UpdateLinkedInStatusView,
    CheckLinkedInPostView 
)

urlpatterns = [
    path('generate-comment/', GenerateCommentView.as_view(), name='generate_comment'),
    path('check-post/', CheckPostView.as_view(), name='check_post'),
    path('update-status/', UpdateCommentStatusView.as_view(), name='update_status'),
    
    path('check-group/', CheckGroupView.as_view(), name='check_group'),
    path('save-group/', SaveGroupView.as_view(), name='save_group'),
    
    path('generate-linkedin-comment/', GenerateLinkedInCommentView.as_view(), name='generate_linkedin_comment'),
    path('update-linkedin-status/', UpdateLinkedInStatusView.as_view(), name='update_linkedin_status'),
    
    path('today-stats/', GetTodayStatsView.as_view(), name='today_stats'),
    path('increment-scanned/', IncrementScannedView.as_view(), name='increment_scanned'),
    path('check-linkedin-post/', CheckLinkedInPostView.as_view(), name='check_linkedin_post'),

]