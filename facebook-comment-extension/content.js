let isRunning = false;
let postsScannedInSession = 0;
const COOLDOWN_MS = 150 * 1000; // 2.5 minutes

// Initialize last comment time from storage
chrome.storage.local.get(['lastCommentTime'], (r) => {
  window.lastCommentTime = r.lastCommentTime || 0;
});

function canComment() { return (Date.now() - window.lastCommentTime) >= COOLDOWN_MS; }
function recordComment() {
  window.lastCommentTime = Date.now();
  chrome.storage.local.set({ lastCommentTime: window.lastCommentTime });
}

// Updates the Chrome local storage counters
function addStat(key) {
  chrome.storage.local.get([key], (data) => {
    let current = Number(data[key]) || 0;
    chrome.storage.local.set({ [key]: current + 1 });
  });
}

function showNotification(message, isError = false) {
  const notif = document.createElement('div');
  notif.className = 'fb-ext-notification';
  notif.textContent = message;
  const bgColor = isError ? '#e41e3f' : '#1877f2';
  notif.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${bgColor}; color: white; padding: 10px 20px; border-radius: 8px; z-index: 999999; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
}

function createVirtualCursor() {
  let cursor = document.getElementById('fb-virtual-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'fb-virtual-cursor';
    cursor.style.cssText = `position: fixed; width: 24px; height: 24px; border: 3px solid #1877f2; background: rgba(24, 119, 242, 0.4); border-radius: 50%; pointer-events: none; z-index: 999999; transition: all 0.8s ease-in-out; transform: translate(-50%, -50%); box-shadow: 0 0 15px rgba(0,0,0,0.5);`;
    document.body.appendChild(cursor);
  }
}

function moveCursorTo(x, y) {
  createVirtualCursor();
  const cursor = document.getElementById('fb-virtual-cursor');
  cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
}

// ============================================================
// ROBUST 48-HOUR TIMESTAMP CHECKER (English & Arabic)
// ============================================================
function isPostWithin48Hours(post) {
  const dataUtcEl = post.querySelector('[data-utc], [data-timestamp]');
  if (dataUtcEl) {
      const dataUtc = dataUtcEl.getAttribute('data-utc') || dataUtcEl.getAttribute('data-timestamp');
      const timestamp = parseInt(dataUtc, 10);
      if (!isNaN(timestamp)) {
          const postTime = timestamp > 10000000000 ? timestamp : timestamp * 1000;
          const hoursOld = (Date.now() - postTime) / (1000 * 60 * 60);
          return hoursOld <= 48; 
      }
  }

  const timeElements = post.querySelectorAll('abbr, time, a[role="link"] > span, span[id*="jsc"]');
  for (const el of timeElements) {
    let text = (el.innerText || el.getAttribute('aria-label') || "").toLowerCase().trim();
    if (!text) continue;

    const arabicNumbers = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    for (let i = 0; i < 10; i++) {
        text = text.replace(new RegExp(arabicNumbers[i], 'g'), i);
    }

    if (text.includes('just now') || text.includes('yesterday') || text.includes('الآن') || text.includes('أمس') || text.includes('دقيقة') || text.includes('دقائق')) {
        return true;
    }
    
    const match = text.match(/(\d+)\s*(m|min|minute|h|hr|hour|d|day|د|س|ي)/i);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit.includes('m') || unit.includes('h') || unit === 'د' || unit === 'س') return true; 
      if (unit.includes('d') || unit === 'ي') return amount <= 2; 
    }

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    for (let month of months) {
      if (text.includes(month)) {
        return false; 
      }
    }
  }
  return true; 
}

async function extractPostData(post) {
  let finalText = "";
  let el = post.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
  if (!el) {
    const all = post.querySelectorAll('[dir="auto"]');
    for (const c of all) {
      const txt = (c.innerText || "").trim();
      if (txt.length >= 15) { el = c; break; }
    }
  }
  if (el) finalText += el.innerText.trim();
  const img = post.querySelector('img[src^="https://scontent"]');
  if (img && img.alt && img.alt.length > 10) finalText += "\n\n[Image Text/Alt]: " + img.alt.trim();
  return finalText.trim().length > 15 ? finalText : null;
}

async function typeAndPostComment(commentBox, commentText, dbId) {
  return new Promise(async (resolve) => {
    let success = false;
    try {
      success = await new Promise((innerResolve) => {
        const rect = commentBox.getBoundingClientRect();
        chrome.runtime.sendMessage({ 
            action: "type_comment", 
            text: commentText, 
            x: Math.round(rect.left + rect.width / 2), 
            y: Math.round(rect.top + rect.height / 2) 
        }, (res) => {
          if (chrome.runtime.lastError) { 
              innerResolve(false); 
          } else { 
              innerResolve(res && res.success); 
          }
        });
      });
    } catch (err) { 
        success = false; 
    }
    
    // FIX: Update local memory AND Django Database
    if (success) {
      addStat('fb_posted');
      fetch('http://localhost:8000/api/update-status/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db_id: dbId, status: 'POSTED' }) }).catch(()=>{});
    } else {
      addStat('fb_failed');
      fetch('http://localhost:8000/api/update-status/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db_id: dbId, status: 'FAILED' }) }).catch(()=>{});
    }
    resolve(success);
  });
}

async function fallbackToProfile(post, originalPostText) {
  let authorLink = null;
  for (let link of post.querySelectorAll('a')) {
    const href = link.href || "";
    if (!href.includes('facebook.com')) continue;
    if (href.includes('/groups/') || href.includes('/posts/') || href.includes('/photo/') || href.includes('/watch/') || href.includes('/reel/')) continue;
    
    if (href.includes('profile.php?id=') || href.split('facebook.com/')[1].split('/').length <= 2) {
        if ((link.innerText || "").trim().split(' ').length >= 2 || href.includes('profile.php')) {
            authorLink = href; break; 
        }
    }
  }

  if (!authorLink) return false; 

  await chrome.storage.local.set({ autoFollowNextProfile: true, originalLeadText: originalPostText });
  window.location.href = authorLink;
  return true;
}

// ============================================================
// MAIN AUTOMATION LOOP
// ============================================================
async function runAutomation() {
  if (isRunning) return;
  
  let data = await new Promise(resolve => chrome.storage.local.get(['bot_state', 'feat_leads', 'posts_scanned_in_session', 'feat_groups', 'groups_joined'], resolve));
  
  if (data.posts_scanned_in_session === undefined) {
    data.posts_scanned_in_session = 0;
    chrome.storage.local.set({ posts_scanned_in_session: 0 });
  }

  if (data.feat_leads === false) return;

  if (data.feat_groups !== false && (data.groups_joined || 0) < 20) {
    console.log("Waiting for Group Joiner to finish before scanning...");
    setTimeout(runAutomation, 10000);
    return;
  }

  await chrome.storage.local.set({ bot_state: 'SCANNING' });
  isRunning = true;

  showNotification("⏳ Loading Feed...");
  await new Promise(r => setTimeout(r, 5000));
  window.scrollBy({ top: 500, behavior: 'smooth' });
  await new Promise(r => setTimeout(r, 3000));

  while (true) {
    let currentCountData = await new Promise(resolve => chrome.storage.local.get(['posts_scanned_in_session'], resolve));
    let currentCount = currentCountData.posts_scanned_in_session || 0;

    if (currentCount >= 20) {
      showNotification("✅ 20 NEW posts scanned. Refreshing...");
      await chrome.storage.local.set({ posts_scanned_in_session: 0 });
      await new Promise(r => setTimeout(r, 3000));
      window.location.reload();
      return;
    }

    if (!canComment()) {
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    const posts = document.querySelectorAll('div[role="article"]');
    let foundNewPost = false;

    for (const post of posts) {
      if (post.dataset.processedByExtension) continue;
      post.dataset.processedByExtension = 'true';

      if (!isPostWithin48Hours(post)) { continue; }

      const postText = await extractPostData(post);
      if (!postText) { continue; }

      const localSeen = await new Promise(resolve => chrome.storage.local.get(['seen_posts'], (res) => resolve(res.seen_posts || [])));
      const postFingerprint = postText.substring(0, 50).trim();
      if (localSeen.includes(postFingerprint)) { continue; }

      currentCount++;
      await chrome.storage.local.set({ posts_scanned_in_session: currentCount });
      postsScannedInSession = currentCount;
      addStat('fb_scanned'); 

      fetch('http://localhost:8000/api/increment-scanned/', {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'fb' })
      }).catch(()=>{});

      localSeen.push(postFingerprint);
      chrome.storage.local.set({ seen_posts: localSeen });

      let alreadyDone = { exists: false };
      try {
          const checkResponse = await fetch('http://localhost:8000/api/check-post/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_text: postText }) });
          if (!checkResponse.ok) throw new Error("Server error");
          alreadyDone = await checkResponse.json();
      } catch (err) {
          showNotification("🚨 Django Server is DOWN!", true);
          await new Promise(r => setTimeout(r, 5000));
          continue; 
      }

      if (alreadyDone.exists) { continue; }

      post.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 1000));
      const rect = post.getBoundingClientRect();
      moveCursorTo(rect.left + rect.width / 2, rect.top + 50);
      await new Promise(r => setTimeout(r, 1500)); 

      try {
        const response = await fetch('http://localhost:8000/api/generate-comment/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post_text: postText }) });
        
        if (!response.ok) throw new Error("Backend failed");
        const data = await response.json();

        if (data.action === 'comment' && data.comment) {
          addStat('fb_generated'); 
          
          let commentBox = null;
          for (let attempt = 0; attempt < 3; attempt++) {
              let commentBtn = null;
              for (let btn of post.querySelectorAll('div[role="button"]')) {
                  const text = (btn.innerText || "").toLowerCase();
                  if (text === 'comment' || text === 'تعليق' || text.includes('comment')) { commentBtn = btn; break; }
              }

              if (commentBtn) {
                  const btnRect = commentBtn.getBoundingClientRect();
                  moveCursorTo(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
                  await new Promise(r => setTimeout(r, 1000)); 
                  commentBtn.click(); 
              }

              for (let i = 0; i < 5; i++) {
                 await new Promise(r => setTimeout(r, 1000)); 
                 commentBox = post.querySelector('div[contenteditable="true"][role="textbox"]');
                 if (commentBox) break;
              }
              if (commentBox) break; 
          }
          
          if (commentBox) {
            commentBox.scrollIntoView({ block: "center" });
            await new Promise(r => setTimeout(r, 1000));
            commentBox.focus();
            await typeAndPostComment(commentBox, data.comment, data.db_id);
          } else {
             addStat('fb_failed');
             fetch('http://localhost:8000/api/update-status/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ db_id: data.db_id, status: 'FAILED' }) }).catch(()=>{});
             const navigated = await fallbackToProfile(post, postText);
             if (navigated) return; 
          }
          recordComment();
          foundNewPost = true;
          break; 
        }
      } catch (e) { console.error('Backend error:', e); }
    }

    if (!foundNewPost) {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 3000));
      const isEndOfFeed = document.body.innerText.includes("You're all caught up") || document.body.innerText.includes("لقد رأيت كل التحديثات");
      if (isEndOfFeed) {
          window.location.reload();
          return;
      }
    }
  }
}

async function checkProfileBehavior() {
    const data = await new Promise(resolve => chrome.storage.local.get(['autoFollowNextProfile'], resolve));
    if (!data.autoFollowNextProfile) return;
    
    await new Promise(r => setTimeout(r, 10000));
    for (let btn of document.querySelectorAll('div[role="button"]')) {
        if (btn.innerText && (btn.innerText.includes('Follow') || btn.innerText.includes('متابعة'))) {
            btn.click(); break;
        }
    }
    await chrome.storage.local.set({ autoFollowNextProfile: false });
    setTimeout(runAutomation, 5000);
}

// Keep-alive to prevent Chrome from freezing the tab
setInterval(() => {
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
}, 10000); 

// Start the automation
setTimeout(() => { checkProfileBehavior(); runAutomation(); }, 3000); 