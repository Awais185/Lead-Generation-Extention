let isRunning = false;
// UPDATED SEARCH QUERIES
const SEARCH_QUERIES = [
    "looking for a web developer", 
    "need a website", 
    "shopify developer", 
    "AI automation developer", 
    "n8n automation", 
    "need SEO expert",
    "AI engineer",
    "machine learning engineer"
];
const POSTS_PER_QUERY = 40; 

function createVirtualCursor() {
  let cursor = document.getElementById('li-virtual-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'li-virtual-cursor';
    cursor.style.cssText = `position: fixed; width: 24px; height: 24px; border: 3px solid #0a66c2; background: rgba(10, 102, 194, 0.4); border-radius: 50%; pointer-events: none; z-index: 999999; transition: all 0.8s ease-in-out; transform: translate(-50%, -50%); box-shadow: 0 0 15px rgba(0,0,0,0.5);`;
    document.body.appendChild(cursor);
  }
}
function moveCursorTo(x, y) {
  createVirtualCursor();
  const cursor = document.getElementById('li-virtual-cursor');
  cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
}
function showNotification(message, isError = false) {
  const notif = document.createElement('div');
  notif.textContent = message;
  notif.style.cssText = `position: fixed; top: 20px; right: 20px; background: ${isError ? '#e41e3f' : '#0a66c2'}; color: white; padding: 10px 20px; border-radius: 8px; z-index: 999999; font-weight: bold;`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
}
function addStat(key) {
  chrome.storage.local.get([key], (data) => {
    let current = data[key] || 0;
    chrome.storage.local.set({ [key]: current + 1 });
  });
}

function hasAlreadyCommented(postText) {
    const markers = ["I specialize in", "Let's connect via DM", "Send me a DM", "I am an expert in", "I can help", "Awais Ali Raza"];
    const lower = postText.toLowerCase();
    return markers.some(m => lower.includes(m.toLowerCase()));
}

function isRelevantText(text) {
    const keywords = ['hire', 'hiring', 'looking for', 'need a', 'need an', 'developer', 'designer', 'shopify', 'website', 'web', 'seo', 'automation', 'react', 'python', 'frontend', 'backend', 'full stack', 'ai engineer', 'machine learning'];
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k));
}

async function updateStatus(dbId, status) {
    try {
        await fetch('http://localhost:8000/api/update-linkedin-status/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ db_id: dbId, status: status })
        });
    } catch(e) { console.log("Status update failed", e); }
}

async function runLinkedInAutomation() {
  if (isRunning) return;

  const data = await new Promise(resolve => chrome.storage.local.get(['feat_linkedin', 'li_scanned_in_session', 'li_query_queue'], resolve));
  if (data.feat_linkedin === false) return;

  isRunning = true;
  let scannedInSession = data.li_scanned_in_session || 0;
  let queryQueue = data.li_query_queue;

  if (!queryQueue || queryQueue.length === 0) {
      queryQueue = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);
      await chrome.storage.local.set({ li_query_queue: queryQueue });
  }

  const currentQuery = queryQueue[0];

  if (scannedInSession >= POSTS_PER_QUERY) {
      queryQueue.shift(); 
      await chrome.storage.local.set({ li_query_queue: queryQueue, li_scanned_in_session: 0 });
      window.location.reload();
      return;
  }

  if (!window.location.href.includes('search/results/content')) {
      showNotification(`🔍 Searching: "${currentQuery}"`);
      window.location.href = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(currentQuery)}&datePosted=%22past-24h%22`;
      isRunning = false;
      return; 
  }

  showNotification(`⏳ Scanning: "${currentQuery}"...`);
  await new Promise(r => setTimeout(r, 5000)); 

  const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
  let targetBtn = null, targetPost = null;

  for (let btn of allButtons) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (aria === 'comment' || aria.includes('comment on')) {
          let post = btn.closest('.feed-shared-update-v2') || btn.closest('article');
          if (!post) {
              let parent = btn.parentElement;
              for (let i = 0; i < 10; i++) {
                  if (!parent) break;
                  if (parent.innerText.length > 150) { post = parent; break; }
                  parent = parent.parentElement;
              }
          }

          if (post && !post.dataset.linkedinProcessed) {
              const text = post.innerText;
              if (!hasAlreadyCommented(text) && isRelevantText(text)) {
                  targetBtn = btn;
                  targetPost = post;
                  break;
              } else {
                  post.dataset.linkedinProcessed = 'true';
              }
          }
      }
  }

  if (!targetBtn || !targetPost) {
    showNotification('🔄 Scrolling for new posts...');
    window.scrollBy({ top: 1000, behavior: 'smooth' });
    await new Promise((r) => setTimeout(r, 3000));
    isRunning = false;
    setTimeout(runLinkedInAutomation, 1000); 
    return;
  }

  targetPost.dataset.linkedinProcessed = 'true';
  scannedInSession++;
  await chrome.storage.local.set({ li_scanned_in_session: scannedInSession });
  addStat('li_scanned');

  // --- NEW: Increment DB Count for LI ---
  fetch('http://localhost:8000/api/increment-scanned/', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'li' })
  }).catch(()=>{});

  targetPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 800));
  const postRect = targetPost.getBoundingClientRect();
  moveCursorTo(postRect.left + 100, postRect.top + 100);
  await new Promise(r => setTimeout(r, 800));

  try {
    const checkRes = await fetch('http://localhost:8000/api/check-linkedin-post/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_text: targetPost.innerText })
    }).catch(()=>null);
    
    if (checkRes && checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.exists) {
            showNotification("⏭️ Skipping: Already in DB.", true);
            isRunning = false; 
            setTimeout(runLinkedInAutomation, 500); 
            return;
        }
    }

    const aiRes = await fetch('http://localhost:8000/api/generate-linkedin-comment/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_text: targetPost.innerText })
    });
    const aiData = await aiRes.json();

    if (aiData.action !== 'comment' || !aiData.comment) {
        isRunning = false; 
        setTimeout(runLinkedInAutomation, 500); 
        return;
    }

    if (document.activeElement) document.activeElement.blur();
    
    const existingBoxes = new Set(Array.from(document.querySelectorAll('.ql-editor, div[contenteditable="true"]')));

    const btnRect = targetBtn.getBoundingClientRect();
    moveCursorTo(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
    await new Promise(r => setTimeout(r, 800));
    targetBtn.click();

    showNotification("⏳ Waiting for input box...");
    
    let box = null;
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        let inlineBoxes = Array.from(targetPost.querySelectorAll('.ql-editor, div[contenteditable="true"]'));
        for (let el of inlineBoxes) {
            if (!existingBoxes.has(el) && el.getBoundingClientRect().height > 0) {
                box = el; break;
            }
        }
        if (box) break;
    }
    
    if (!box) {
        showNotification("❌ Box did not open.", true);
        updateStatus(aiData.db_id, 'FAILED');
        isRunning = false; setTimeout(runLinkedInAutomation, 500); return;
    }

    box.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    const boxRect = box.getBoundingClientRect();
    moveCursorTo(boxRect.left + boxRect.width / 2, boxRect.top + boxRect.height / 2);
    await new Promise(r => setTimeout(r, 500));

    showNotification("⌨️ Typing Reply...");
    const typeResult = await Promise.race([
        new Promise((resolve) => {
            chrome.runtime.sendMessage({ 
                action: "type_comment", 
                text: aiData.comment, 
                x: Math.round(boxRect.left + boxRect.width / 2), 
                y: Math.round(boxRect.top + boxRect.height / 2) 
            }, (res) => resolve(res));
        }),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Timeout' }), 20000))
    ]);
    
    await new Promise(r => setTimeout(r, 1500));

    let textInBox = box.innerText || box.textContent || "";
    if (textInBox.trim().length < 5) {
        showNotification("⚠️ Debugger failed, using JS fallback...", true);
        box.focus();
        document.execCommand('insertText', false, aiData.comment);
        await new Promise(r => setTimeout(r, 1000));
        textInBox = box.innerText || box.textContent || "";
    }

    if (textInBox.trim().length < 5) {
        showNotification("❌ Text could not be typed.", true);
        updateStatus(aiData.db_id, 'FAILED');
        isRunning = false; setTimeout(runLinkedInAutomation, 1000); return;
    }

    showNotification("⏳ Submitting...");
    let submitBtn = null;

    for (let attempt = 0; attempt < 6; attempt++) {
        const container = box.closest('form') || box.closest('.comments-comment-box') || targetPost;
        const buttons = Array.from(container.querySelectorAll('button'));
        
        for (let b of buttons) {
            if (b === targetBtn) continue;
            const txt = (b.innerText || '').toLowerCase().trim();
            if (txt === 'comment' || txt === 'post') {
                const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                    submitBtn = b; break;
                }
            }
        }
        if (submitBtn) break;
        await new Promise(r => setTimeout(r, 1000)); 
    }

    if (submitBtn) {
        const bRect = submitBtn.getBoundingClientRect();
        moveCursorTo(bRect.left + bRect.width / 2, bRect.top + bRect.height / 2);
        await new Promise(r => setTimeout(r, 800));
        
        submitBtn.click(); 
        submitBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        submitBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        
        showNotification("✅ Comment Posted! Waiting 30s...");
        await new Promise(r => setTimeout(r, 3000)); 
        updateStatus(aiData.db_id, 'POSTED');
        await new Promise(r => setTimeout(r, 30000)); 
    } else {
        showNotification("⚠️ Submit button not found.", true);
        updateStatus(aiData.db_id, 'FAILED');
    }

  } catch (e) { 
      console.error("Error:", e); 
  }

  isRunning = false;
  setTimeout(runLinkedInAutomation, 1000);
}

setTimeout(runLinkedInAutomation, 2000);