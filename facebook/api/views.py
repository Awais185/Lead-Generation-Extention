from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from openai import OpenAI
from django.conf import settings
from .models import DailyStats, GeneratedComment, JoinedGroup, WelcomeTemplate, LinkedInComment 
import re
from difflib import SequenceMatcher
from django.utils import timezone
from django.db import IntegrityError
from django.db.models import F

def normalize_post_text(value):
    if not value: return ''
    text = str(value).strip().lower()
    return re.sub(r'[^a-z0-9\s]', '', re.sub(r'\s+', ' ', text)).strip()

def is_similar_post(a, b):
    a_norm = normalize_post_text(a)
    b_norm = normalize_post_text(b)
    if not a_norm or not b_norm: return False
    if a_norm == b_norm or a_norm in b_norm or b_norm in a_norm: return True
    return SequenceMatcher(None, a_norm, b_norm).ratio() >= 0.82

client = OpenAI(
    api_key=settings.CLOUDFLARE_API_TOKEN,
    base_url=f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1"
)

SYSTEM_PROMPT = """You are an expert Digital Agency specializing in tech and marketing services looking for CLIENTS on Facebook and LinkedIn.

YOUR SCOPE:
- Web Development (Frontend, Backend, Full Stack, React, Python, REST API)
- Software (Custom software development, SaaS, MVP building, Software engineer)
- E-commerce (Shopify store setup, Shopify dropshipping, store design)
- AI & Automation (AI bots, n8n workflows, web automation, scraping, ML)
- Design & Marketing (UI/UX design, SEO, Digital Marketing, wordpress website, brand)

CRITICAL RULES:
1. CLIENTS (HIRING): If the post says "We are hiring", "Need a website", "Looking for a developer", "Looking for a WordPress expert", YOU MUST write a comment.
2. SELLERS: ONLY skip if the author is explicitly selling their own services (e.g., "I am a freelancer, hire me", "I build websites, DM me").
3. If it's an agency promoting their own services, SKIP.

IF THEY ARE A CLIENT:
- Write a VERY SHORT, confident comment (MAX 2 LINES / 20 words).
- State clearly that you specialize in their exact need.
- End with a strong Call to Action ("Send me a DM", "Let's connect").

Examples:
- Post: "📢 WE ARE HIRING: WORDPRESS DEVELOPER. We are looking for a skilled..." -> I specialize in WordPress and SEO development and can help your team build great websites. Let's connect via DM!
- Post: "I need a web developer for my startup." -> I specialize in building web applications for startups. Let's connect via DM to discuss your requirements!
- Post: "Looking for someone to set up n8n automations." -> I am an expert in n8n and web automation. Send me a DM and let's discuss your workflow requirements.
- Post: "I am a web developer. Hire me for your projects." -> SKIP
"""

class GenerateCommentView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text: return Response({'error': 'post_text required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response = client.chat.completions.create(
                model="@cf/meta/llama-3.1-8b-instruct-fast", 
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": f"Post: {post_text}"}],
                max_tokens=60, temperature=0.3
            )
            comment = response.choices[0].message.content.strip()

            if comment == 'SKIP' or "SKIP" in comment[:10]:
                return Response({'action': 'skip', 'comment': None})

            db_record = GeneratedComment.objects.create(post_text=post_text, ai_comment=comment, status='PENDING')
            return Response({'action': 'comment', 'comment': comment, 'db_id': db_record.id})
        except Exception as e:
            print(f"Error: {e}")
            return Response({'action': 'skip', 'error': str(e)}, status=status.HTTP_200_OK)

class GenerateLinkedInCommentView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text: return Response({'error': 'post_text required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response = client.chat.completions.create(
                model="@cf/meta/llama-3.1-8b-instruct-fast", 
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": f"Post: {post_text}"}],
                max_tokens=60, temperature=0.3
            )
            comment = response.choices[0].message.content.strip()

            if comment == 'SKIP' or "SKIP" in comment[:10]:
                LinkedInComment.objects.create(post_text=post_text, status='SKIPPED', ai_comment="SKIPPED")
                return Response({'action': 'skip', 'comment': None})

            db_record = LinkedInComment.objects.create(post_text=post_text, ai_comment=comment, status='PENDING')
            return Response({'action': 'comment', 'comment': comment, 'db_id': db_record.id})
        except Exception as e:
            return Response({'action': 'skip', 'error': str(e)}, status=status.HTTP_200_OK)

class UpdateCommentStatusView(APIView):
    def post(self, request):
        try:
            record = GeneratedComment.objects.get(id=request.data.get('db_id'))
            record.status = request.data.get('status')
            record.save()
            return Response({'success': True})
        except Exception as e: return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
class UpdateLinkedInStatusView(APIView):
    def post(self, request):
        db_id = request.data.get('db_id')
        new_status = request.data.get('status')
        try:
            record = LinkedInComment.objects.get(id=db_id)
            record.status = new_status
            record.save()
            return Response({'success': True})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        
class CheckPostView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text: return Response({'exists': False})
        existing = GeneratedComment.objects.filter(status__in=['POSTED', 'PENDING']).order_by('-created_at')
        for record in existing:
            if record.post_text and is_similar_post(record.post_text, post_text):
                return Response({'exists': True})
        return Response({'exists': False})

class CheckGroupView(APIView):
    def post(self, request):
        return Response({'exists': JoinedGroup.objects.filter(group_url=request.data.get('group_url', '')).exists()})

class SaveGroupView(APIView):
    def post(self, request):
        url = request.data.get('group_url', '')
        if url:
            obj, created = JoinedGroup.objects.get_or_create(group_url=url)
            return Response({'success': True, 'created': created})
        return Response({'success': False}, status=status.HTTP_400_BAD_REQUEST)

class GetWelcomeMessageView(APIView):
    def get(self, request):
        template = WelcomeTemplate.objects.first()
        if not template:
            template = WelcomeTemplate.objects.create(message_text="Hi there! Thank you for following. We offer Web Dev, Shopify, and AI services with a special discount for you!")
        return Response({'welcome_text': template.message_text})

class GetTodayStatsView(APIView):
    def get(self, request):
        today = timezone.now().date()
        
        try:
            stats, _ = DailyStats.objects.get_or_create(date=today)
        except IntegrityError:
            stats = DailyStats.objects.get(date=today)

        # FB Stats
        fb_posted = GeneratedComment.objects.filter(status='POSTED', created_at__date=today).count()
        fb_failed = GeneratedComment.objects.filter(status='FAILED', created_at__date=today).count()
        fb_leads = GeneratedComment.objects.filter(status__in=['POSTED', 'FAILED', 'PENDING'], created_at__date=today).count()

        # LinkedIn Stats
        li_posted = LinkedInComment.objects.filter(status='POSTED', created_at__date=today).count()
        li_failed = LinkedInComment.objects.filter(status='FAILED', created_at__date=today).count()
        li_leads = LinkedInComment.objects.filter(status__in=['POSTED', 'FAILED', 'PENDING'], created_at__date=today).count()

        # Group Stats
        groups_joined = JoinedGroup.objects.filter(joined_at__date=today).count()

        return Response({
            'fb_posted': fb_posted,
            'fb_failed': fb_failed,
            'fb_leads': fb_leads,
            'li_posted': li_posted,
            'li_failed': li_failed,
            'li_leads': li_leads,
            'groups_joined': groups_joined,
            'fb_scanned': stats.fb_scanned,
            'li_scanned': stats.li_scanned
        })

class IncrementScannedView(APIView):
    def post(self, request):
        platform = request.data.get('platform', 'fb')
        today = timezone.now().date()
        
        try:
            stats, _ = DailyStats.objects.get_or_create(date=today)
        except IntegrityError:
            stats = DailyStats.objects.get(date=today)
            
        if platform == 'li':
            # F is now imported at the top
            DailyStats.objects.filter(date=today).update(li_scanned=F('li_scanned') + 1)
        else:
            DailyStats.objects.filter(date=today).update(fb_scanned=F('fb_scanned') + 1)
            
        return Response({'success': True})

class CheckLinkedInPostView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text:
            return Response({'exists': False})

        # Take the first 200 chars to compare. This prevents failing just because 
        # new comments were added to the post after we originally commented.
        short_text = post_text[:200].strip()
        normalized = normalize_post_text(short_text)
        
        if len(normalized) < 12:
            return Response({'exists': False})

        existing = LinkedInComment.objects.filter(status__in=['POSTED', 'PENDING']).order_by('-created_at')
        for record in existing:
            if not record.post_text:
                continue
            
            record_short = record.post_text[:200].strip()
            if is_similar_post(record_short, short_text):
                return Response({'exists': True})

        return Response({'exists': False})