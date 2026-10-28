chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.set({ 
        bot_state: 'SCANNING', groups_joined: 0, 
        feat_leads: true, feat_groups: true, feat_linkedin: true 
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "type_comment") {
    const tabId = sender.tab.id;
    
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      const x = request.x;
      const y = request.y;

      const finishTyping = () => {
          setTimeout(() => {
              chrome.debugger.detach({ tabId: tabId }, () => {
                  sendResponse({ success: true });
              });
          }, 1000);
      };

      // 1. Physically click the text box
      chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", { 
          type: "mousePressed", x: x, y: y, button: "left", clickCount: 1 
      }, () => {
          chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", { 
              type: "mouseReleased", x: x, y: y, button: "left", clickCount: 1 
          }, () => {
              
              setTimeout(() => {
                  const text = request.text;
                  let i = 0;

                  function typeChar() {
                    if (i < text.length) {
                      chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
                        type: "char", text: text[i]
                      }, () => {
                        i++;
                        setTimeout(typeChar, Math.floor(Math.random() * 30) + 30); 
                      });
                    } else {
                      // Check if we should skip pressing Enter (LinkedIn)
                      if (request.skipEnter) {
                          finishTyping();
                      } else {
                          // Facebook: Press Enter to submit
                          setTimeout(() => {
                              chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
                                  type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13
                              }, finishTyping);
                          }, 500);
                      }
                    }
                  }
                  typeChar(); 
              }, 1500);
          });
      });
    });
    return true; 
  }
});