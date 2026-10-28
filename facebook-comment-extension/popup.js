async function loadTodayStats() {
    try {
        const response = await fetch('http://localhost:8000/api/today-stats/');
        const data = await response.json();

        document.getElementById('fb_scanned').textContent = data.fb_scanned || 0;
        document.getElementById('fb_leads').textContent = data.fb_leads || 0;
        document.getElementById('fb_posted').textContent = data.fb_posted || 0;
        document.getElementById('fb_failed').textContent = data.fb_failed || 0;
        document.getElementById('groups_joined').textContent = data.groups_joined || 0;

        document.getElementById('li_scanned').textContent = data.li_scanned || 0;
        document.getElementById('li_leads').textContent = data.li_leads || 0;
        document.getElementById('li_posted').textContent = data.li_posted || 0;
        document.getElementById('li_failed').textContent = data.li_failed || 0;
    } catch (e) {
        chrome.storage.local.get(['fb_scanned', 'fb_posted', 'fb_failed', 'fb_leads', 'li_scanned', 'li_posted', 'li_failed', 'li_leads', 'groups_joined'], (data) => {
            document.getElementById('fb_scanned').textContent = data.fb_scanned || 0;
            document.getElementById('fb_leads').textContent = data.fb_leads || 0;
            document.getElementById('fb_posted').textContent = data.fb_posted || 0;
            document.getElementById('fb_failed').textContent = data.fb_failed || 0;
            document.getElementById('groups_joined').textContent = data.groups_joined || 0;
            document.getElementById('li_scanned').textContent = data.li_scanned || 0;
            document.getElementById('li_leads').textContent = data.li_leads || 0;
            document.getElementById('li_posted').textContent = data.li_posted || 0;
            document.getElementById('li_failed').textContent = data.li_failed || 0;
        });
    }
}

function loadToggles() {
  chrome.storage.local.get(['feat_leads', 'feat_groups', 'feat_linkedin'], (data) => {
    document.getElementById('toggle_leads').checked = data.feat_leads !== false;
    document.getElementById('toggle_groups').checked = data.feat_groups !== false;
    document.getElementById('toggle_linkedin').checked = data.feat_linkedin !== false;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadToggles();
  loadTodayStats(); // Load from Django instantly
  setInterval(loadTodayStats, 3000); // Update every 3 seconds

  // Toggle Listeners
  document.getElementById('toggle_leads').addEventListener('change', (e) => chrome.storage.local.set({ feat_leads: e.target.checked }));
  document.getElementById('toggle_linkedin').addEventListener('change', (e) => chrome.storage.local.set({ feat_linkedin: e.target.checked }));
  document.getElementById('toggle_groups').addEventListener('change', (e) => {
    chrome.storage.local.set({ feat_groups: e.target.checked });
    if (!e.target.checked) {
        chrome.storage.local.get(['feat_leads'], (data) => {
            if (data.feat_leads !== false) {
                chrome.storage.local.set({ bot_state: 'SCANNING' });
                chrome.tabs.query({ url: "*://*.facebook.com/*" }, (tabs) => {
                    if (tabs.length > 0) chrome.tabs.update(tabs[0].id, { url: "https://www.facebook.com/groups/feed/" });
                });
            }
        });
    }
  });
});