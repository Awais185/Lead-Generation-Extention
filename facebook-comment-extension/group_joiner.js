const SEARCH_KEYWORDS = [
    "freelancing projects", "web development group", "app development", 
    "software developer", "AI automation projects", "SEO experts", "Shopify dropshipping"
];

// ============================================================
// UI VISUALS
// ============================================================
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

function showNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'fb-ext-notification';
  notif.textContent = message;
  notif.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #1877f2; color: white; padding: 10px 20px; border-radius: 8px; z-index: 999999; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

// ============================================================
// MAIN GROUP JOINER
// ============================================================
async function handleJoinPopup() {
    await new Promise(r => setTimeout(r, 3000));
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return false;

    const inputs = dialog.querySelectorAll('textarea, input[type="text"], div[contenteditable="true"]');
    for (let input of inputs) {
        input.focus();
        const answer = "I am a developer and agency owner looking to connect with clients and share knowledge.";
        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = answer; input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            input.innerText = answer; input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 1000)); 
    }

    const formButtons = dialog.querySelectorAll('div[role="button"], button');
    for (let btn of formButtons) {
        const text = (btn.innerText || "").toLowerCase();
        if (text.includes("submit") || text.includes("join") || text.includes("agree") || text.includes("answer") || text.includes("إرسال") || text.includes("انضمام") || text.includes("موافق")) {
            
            const rect = btn.getBoundingClientRect();
            moveCursorTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
            await new Promise(r => setTimeout(r, 1000)); 
            
            btn.click(); 
            await new Promise(r => setTimeout(r, 3000)); 
            return true;
        }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    return false;
}

function addGroupStat() {
    chrome.storage.local.get(['groups_joined'], (data) => {
        let current = data.groups_joined || 0;
        chrome.storage.local.set({ groups_joined: current + 1 });
    });
}

async function processGroups() {
    let data = await new Promise(resolve => chrome.storage.local.get(['bot_state', 'feat_groups'], resolve));
    
    // If we are not in the joining state, stop
    if (data.bot_state !== 'JOINING_GROUPS') return;

    // If the toggle is OFF, immediately switch to Lead Finder
    if (data.feat_groups === false) {
        showNotification("⏭️ Group Finder is OFF. Switching...");
        await chrome.storage.local.set({ bot_state: 'SCANNING' });
        window.location.href = "https://www.facebook.com/groups/feed/";
        return;
    }

    showNotification("📍 Starting Group Joiner...");
    const startTime = Date.now(); 
    
    // 5-minute timer
    while (Date.now() - startTime < 300000) { 
        // CHECK TOGGLE MID-SESSION: If user turns it off, break the loop instantly
        let currentSettings = await new Promise(resolve => chrome.storage.local.get(['feat_groups'], resolve));
        if (currentSettings.feat_groups === false) {
            showNotification("🛑 Toggle turned OFF. Switching...");
            break;
        }

        let searchInput = document.querySelector('input[aria-label="Search for groups"]') || document.querySelector('input[placeholder="Search for groups"]') || document.querySelector('input[type="search"]');
        if (!searchInput) { await new Promise(r => setTimeout(r, 5000)); continue; }

        const keyword = SEARCH_KEYWORDS[Math.floor(Math.random() * SEARCH_KEYWORDS.length)];
        searchInput.focus(); searchInput.value = keyword;
        searchInput.dispatchEvent(new Event('input', { bubbles: true })); 
        await new Promise(r => setTimeout(r, 3000)); 
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await new Promise(r => setTimeout(r, 8000)); 

        const joinButtons = document.querySelectorAll('div[role="button"]');
        let joinedInThisLoop = 0;

        for (let btn of joinButtons) {
            const text = (btn.innerText || "").toLowerCase();
            if (text === "join group" || text === "join" || text === "انضمام") {
                const groupCard = btn.closest('div[role="article"]');
                if (groupCard) {
                    const linkElement = groupCard.querySelector('a[href*="/groups/"]');
                    const url = linkElement ? linkElement.href : "";

                    if (url) {
                        const check = await fetch('http://localhost:8000/api/check-group/', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ group_url: url }) }).then(r => r.json()).catch(()=>({exists: false}));

                        if (!check.exists) {
                            groupCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                            await new Promise(r => setTimeout(r, 2000)); 
                            
                            const rect = btn.getBoundingClientRect();
                            moveCursorTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
                            showNotification("🎯 Clicking Join...");
                            
                            await new Promise(r => setTimeout(r, 1500)); 

                            btn.click(); 
                            await handleJoinPopup(); 
                            joinedInThisLoop++; 
                            addGroupStat();
                            fetch('http://localhost:8000/api/save-group/', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ group_url: url }) }).catch(()=>{});
                            await new Promise(r => setTimeout(r, 15000)); 
                        }
                    }
                }
            }
            if (joinedInThisLoop >= 20) break;
        }
        window.scrollBy({ top: 1000, behavior: 'smooth' });
        await new Promise(r => setTimeout(r, 5000)); 
    }

    // Timer finished OR toggle was turned off
    showNotification("✅ Group Joiner Finished. Going to Lead Finder...");
    await chrome.storage.local.set({ bot_state: 'SCANNING' });
    window.location.href = "https://www.facebook.com/groups/feed/";
}

setTimeout(processGroups, 3000);