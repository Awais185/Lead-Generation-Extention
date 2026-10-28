from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from openai import OpenAI
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from difflib import SequenceMatcher
import re

from .models import DailyStats, GeneratedComment, JoinedGroup, WelcomeTemplate, LinkedInComment


def get_or_create_daily_stats_for_date(day):
    try:
        return DailyStats.objects.get(date=day), False
    except DailyStats.DoesNotExist:
        pass

    for _ in range(25):
        try:
            with transaction.atomic():
                stats = DailyStats.objects.create(date=day)
                return stats, True
        except IntegrityError:
            try:
                return DailyStats.objects.get(date=day), False
            except DailyStats.DoesNotExist:
                continue

    return DailyStats.objects.get(date=day), False


def normalize_post_text(value):
    if not value:
        return ''
    text = str(value).strip().lower()
    text = re.sub(r'[^\w\s\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def is_similar_post(a, b):
    a_norm = normalize_post_text(a)
    b_norm = normalize_post_text(b)
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm or a_norm in b_norm or b_norm in a_norm:
        return True
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
- AI & Automation (AI bots, n8n workflows, web automation, scraping, ML, GHL automations)
- Design & Marketing (UI/UX design, SEO, Digital Marketing, WordPress website, brand)

CRITICAL RULES:
1. BUYING INTENT REQUIRED: You must ONLY comment if the author is explicitly looking to hire, needs help, or is asking for recommendations for a service (e.g., "We are hiring", "Need a website", "Looking for a developer", "Can anyone recommend a Shopify expert?"). 
2. NO GENERAL TALK: SKIP the post if it is just general talk, sharing news, discussing trends, asking for career advice, or showing off a completed project. (e.g., "Web development is changing", "Just finished my new website", "How do I learn Python?").
3. SELLERS: SKIP if the author is explicitly selling their own services (e.g., "I am a freelancer, hire me", "I build websites, DM me") or if it's an agency promoting their own services.
4. LANGUAGE: Write the comment in the same language as the post: English for English posts, Arabic for Arabic posts.
5. FORMAT: Keep it VERY SHORT, confident, and max 2 lines / 20 words.

IF THEY ARE A CLIENT (Have Buying Intent):
- State clearly that you specialize in their exact need.
- End with a strong CTA: "Send me a DM", "Let's connect", or "راسلني في الرسائل".

Examples:
- Post: "📢 WE ARE HIRING: WORDPRESS DEVELOPER..." -> I specialize in WordPress and SEO development and can help your team. Let's connect via DM!
- Post: "أحتاج مطور ويب لمشروع startup" -> أختص في بناء مواقع وتطبيقات الويب للشركات الناشئة. راسلني في الرسائل لنناقش متطلباتك.
- Post: "Can anyone recommend a good Shopify developer?" -> I specialize in Shopify store setup and optimization. Let's connect via DM!
- Post: "I am a web developer. Hire me for your projects." -> SKIP (Seller)
- Post: "Top 10 Web Development trends in 2024." -> SKIP (General Talk)
- Post: "So proud of my team for launching our new AI tool!" -> SKIP (General Talk / No buying intent)
"""

class GenerateCommentView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text:
            return Response({'error': 'post_text required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response = client.chat.completions.create(
                model="@cf/meta/llama-3.1-8b-instruct-fast",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Post: {post_text}"},
                ],
                max_tokens=60,
                temperature=0.3,
            )
            comment = (response.choices[0].message.content or '').strip()

            if not comment:
                return Response({'action': 'skip', 'comment': None})

            normalized = comment.lower().strip()
            if normalized == 'skip' or normalized.startswith('skip'):
                return Response({'action': 'skip', 'comment': None})

            db_record = GeneratedComment.objects.create(post_text=post_text, ai_comment=comment, status='PENDING')
            return Response({'action': 'comment', 'comment': comment, 'db_id': db_record.id})
        except Exception as e:
            print(f"Error: {e}")
            return Response({'action': 'skip', 'error': str(e)}, status=status.HTTP_200_OK)


class GenerateLinkedInCommentView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text:
            return Response({'error': 'post_text required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response = client.chat.completions.create(
                model="@cf/meta/llama-3.1-8b-instruct-fast",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Post: {post_text}"},
                ],
                max_tokens=60,
                temperature=0.3,
            )
            comment = (response.choices[0].message.content or '').strip()

            if not comment:
                LinkedInComment.objects.create(post_text=post_text, status='SKIPPED', ai_comment='SKIPPED')
                return Response({'action': 'skip', 'comment': None})

            normalized = comment.lower().strip()
            if normalized == 'skip' or normalized.startswith('skip'):
                LinkedInComment.objects.create(post_text=post_text, status='SKIPPED', ai_comment='SKIPPED')
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
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
        if not post_text:
            return Response({'exists': False})

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
            template = WelcomeTemplate.objects.create(
                message_text="Hi there! Thank you for following. We offer Web Dev, Shopify, and AI services with a special discount for you!"
            )
        return Response({'welcome_text': template.message_text})


class GetTodayStatsView(APIView):
    def get(self, request):
        # FIX: Use localdate() instead of now().date() to match your local timezone
        today = timezone.localdate() 
        
        try:
            stats, _ = DailyStats.objects.get_or_create(date=today)
        except IntegrityError:
            stats = DailyStats.objects.get(date=today)

        # FB Stats (This will now correctly count today's leads)
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
        stats, _ = get_or_create_daily_stats_for_date(today)

        if platform == 'li':
            DailyStats.objects.filter(date=today).update(li_scanned=F('li_scanned') + 1)
        else:
            DailyStats.objects.filter(date=today).update(fb_scanned=F('fb_scanned') + 1)

        return Response({'success': True})


class CheckLinkedInPostView(APIView):
    def post(self, request):
        post_text = request.data.get('post_text', '')
        if not post_text:
            return Response({'exists': False})

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