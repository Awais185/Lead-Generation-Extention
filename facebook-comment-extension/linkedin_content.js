let isRunning = false;
const SEARCH_QUERIES = ["looking for a web developer", "need a website", "shopify developer", "AI automation developer", "n8n automation", "need SEO expert", "AI engineer", "machine learning engineer"];
const POSTS_PER_QUERY = 20; 

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
    let current = Number(data[key]) || 0;
    chrome.storage.local.set({ [key]: current + 1 });
  });
}

function hasAlreadyCommented(postText) {
    const markers = ["I specialize in", "Let's connect via DM", "Send me a DM", "I am an expert in", "I can help", "Awais Ali Raza"];
    const lower = postText.toLowerCase();
    return markers.some(m => lower.includes(m.toLowerCase()));
}

function isRelevantText(text) {
    const keywords = ['hire', 'hiring', 'looking for', 'need a', 'need an', 'developer', 'designer', 'shopify', 'website', 'web', 'seo', 'automation', 'react', 'python', 'frontend', 'backend', 'full stack', 'ai engineer', 'machine learning', 'ghl'];
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

    // Keep local counters in sync with backend
    if (status === 'POSTED') addStat('li_posted');
    else if (status === 'FAILED') addStat('li_failed');
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

  // FIXED: Check if we are on the search page AND if the URL actually matches the currentQuery
  const expectedKeyword = encodeURIComponent(currentQuery);
  if (!window.location.href.includes('search/results/content') || !window.location.href.includes(expectedKeyword)) {
      showNotification(`🔍 Searching: "${currentQuery}"`);
      window.location.href = `https://www.linkedin.com/search/results/content/?keywords=${expectedKeyword}&datePosted=%22past-24h%22`;
      isRunning = false;
      return; 
  }

  showNotification(`⏳ Scanning: "${currentQuery}"...`);
  await new Promise(r => setTimeout(r, 5000)); 

  const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
  let targetBtn = null, targetPost = null;

  for (let btn of allButtons) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      if ((aria === 'comment' || aria.includes('comment on')) && !aria.includes('menu')) {
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

  fetch('http://localhost:8000/api/increment-scanned/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
            isRunning = false; setTimeout(runLinkedInAutomation, 500); return;
        }
    }

    const aiRes = await fetch('http://localhost:8000/api/generate-linkedin-comment/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_text: targetPost.innerText })
    });
    const aiData = await aiRes.json();

    if (aiData.action !== 'comment' || !aiData.comment) {
        isRunning = false; setTimeout(runLinkedInAutomation, 500); return;
    }

    addStat('li_leads_found');   // AI approved → this is a real lead

    if (document.activeElement) document.activeElement.blur();

    // SNAPSHOT: Record how many editors exist BEFORE we click
    const existingEditorCount = document.querySelectorAll('.ql-editor, div[contenteditable="true"]').length;

    const btnRect = targetBtn.getBoundingClientRect();
    moveCursorTo(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
    await new Promise(r => setTimeout(r, 800));
    
    // Physically click the comment icon
    targetBtn.click();
    targetBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    targetBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    showNotification("⏳ Waiting for input box...");
    
    // ROBUST BOX FINDING: Wait for a NEW editor to appear
    let box = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        let allEditors = Array.from(document.querySelectorAll('.ql-editor, div[contenteditable="true"]'));
        
        // If a new editor appeared, grab it
        if (allEditors.length > existingEditorCount) {
            box = allEditors[allEditors.length - 1]; 
            break;
        }
        
        // Fallback: Look strictly inside the post
        let inlineBoxes = Array.from(targetPost.querySelectorAll('.ql-editor, div[contenteditable="true"]'));
        let visibleInline = inlineBoxes.filter(el => el.getBoundingClientRect().height > 0);
        if (visibleInline.length > 0) {
            box = visibleInline[0]; 
            break;
        }
    }
    
    if (!box) {
        showNotification("❌ Box did not open.", true);
        updateStatus(aiData.db_id, 'FAILED');
        isRunning = false; setTimeout(runLinkedInAutomation, 500); return;
    }

    // Force focus and click the box
    box.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 500));
    box.focus();
    box.click();
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    box.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));

    const boxRect = box.getBoundingClientRect();
    moveCursorTo(boxRect.left + boxRect.width / 2, boxRect.top + boxRect.height / 2);
    await new Promise(r => setTimeout(r, 500));

    showNotification("⌨️ Typing Reply...");
    
    // Send to background with skipEnter: true
    const typeResult = await Promise.race([
        new Promise((resolve) => {
            chrome.runtime.sendMessage({ 
                action: "type_comment", 
                text: aiData.comment, 
                skipEnter: true, 
                x: Math.round(boxRect.left + boxRect.width / 2), 
                y: Math.round(boxRect.top + boxRect.height / 2) 
            }, (res) => resolve(res));
        }),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'Timeout' }), 20000))
    ]);
    
    await new Promise(r => setTimeout(r, 1500));

    let textInBox = box.innerText || box.textContent || "";
    
    // Fallback if debugger failed
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
    const boxRectNow = box.getBoundingClientRect();
    
    // AGGRESSIVE SUBMIT BUTTON FINDING
    for (let attempt = 0; attempt < 6; attempt++) {
        const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        let minDistance = Infinity;

        for (let b of allBtns) {
            if (b === targetBtn) continue;
            
            const txt = (b.innerText || '').toLowerCase().trim();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            
            // Ignore menus
            if (txt.includes('menu') || aria.includes('menu') || txt.includes('more') || txt.includes('repost') || txt.includes('send')) continue;
            
            // Look for the exact submit button
            if (txt === 'comment' || txt === 'post' || aria.includes('post comment')) {
                const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
                
                if (!isDisabled) {
                    const rect = b.getBoundingClientRect();
                    if (rect.height > 0 && rect.width > 0) {
                        const distance = Math.abs(rect.top - boxRectNow.top) + Math.abs(rect.left - boxRectNow.left);
                        // Ensure it's within a reasonable distance
                        if (distance < minDistance && distance < 600) {
                            minDistance = distance;
                            submitBtn = b;
                        }
                    }
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
        
        await new Promise(r => setTimeout(r, 2500)); 
        let currentText = box.innerText || box.textContent || "";
        
        if (currentText.trim().length < 3) {
            showNotification("✅ Comment Posted! Waiting 30s...");
            updateStatus(aiData.db_id, 'POSTED');
            await new Promise(r => setTimeout(r, 30000)); 
        } else {
            showNotification("⚠️ Button clicked but text is still there.", true);
            updateStatus(aiData.db_id, 'FAILED');
        }
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