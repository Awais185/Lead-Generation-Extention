chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.set({ 
        bot_state: 'SCANNING', groups_joined: 0, 
        feat_leads: true, feat_groups: true, feat_linkedin: true 
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "type_comment") {
    const tabId = sender.tab.id;
    
    // NO TAB SWITCHING. Just attach and type.
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      const x = request.x;
      const y = request.y;

      // 1. Physically click (Press + Release) on the text box
      chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", { 
          type: "mousePressed", x: x, y: y, button: "left", clickCount: 1 
      }, () => {
          chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", { 
              type: "mouseReleased", x: x, y: y, button: "left", clickCount: 1 
          }, () => {
              
              // 2. Wait 1 second for the editor to focus
              setTimeout(() => {
                  
                  // 3. Use Input.insertText (Reliable for React/Quill editors)
                  chrome.debugger.sendCommand({ tabId: tabId }, "Input.insertText", {
                      text: request.text
                  }, (res) => {
                      if (chrome.runtime.lastError) {
                          sendResponse({ success: false, error: chrome.runtime.lastError.message });
                          chrome.debugger.detach({ tabId: tabId }, () => {});
                          return;
                      }

                      // 4. Detach debugger
                      setTimeout(() => {
                          chrome.debugger.detach({ tabId: tabId }, () => {
                              sendResponse({ success: true });
                          });
                      }, 1000);
                  });
              }, 1500);
          });
      });
    });
    return true; 
  }
});