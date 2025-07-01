// Background script for ChatGPT Path extension (Firefox MV2 safe)

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);

  if (request.action === 'getConversationData') {
    handleConversationDataRequest(request.conversationId, sender.tab.id)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error('Error in background script:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep the message channel open for async
  }

  if (request.action === 'ping') {
    sendResponse({ status: 'ok', message: 'Background script is alive.' });
  }
});

// Handle conversation data request
async function handleConversationDataRequest(conversationId, tabId) {
  try {
    console.log('Background script: Getting conversation data for ID:', conversationId);
    console.log('Background script: Tab ID:', tabId);

    const accessToken = await getAccessTokenFromTab(tabId);
    if (!accessToken) {
      throw new Error('No access token found');
    }

    console.log('Background script: Got access token, fetching conversation...');

    const endpoints = [
      `https://chat.openai.com/backend-api/conversation/${conversationId}`,
      `https://chat.openai.com/backend-api/conversations/${conversationId}`,
      `https://chat.openai.com/backend-api/conversation/${conversationId}/messages`
    ];

    for (let i = 0; i < endpoints.length; i++) {
      const apiUrl = endpoints[i];
      console.log(`Background script: Trying endpoint ${i + 1}/${endpoints.length}:`, apiUrl);

      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
          }
        });

        console.log(`Background script: Endpoint ${i + 1} response status:`, response.status);

        if (response.ok) {
          const data = await response.json();
          console.log(`Background script: Success with endpoint ${i + 1}`);
          return data;
        } else {
          const errorText = await response.text();
          console.log(`Background script: Endpoint ${i + 1} failed:`, response.status, errorText);
        }
      } catch (error) {
        console.log(`Background script: Endpoint ${i + 1} error:`, error.message);
      }
    }

    throw new Error('All API endpoints failed');
  } catch (error) {
    console.error('Background script: Error getting conversation data:', error);
    throw error;
  }
}

// Get access token from content page context (Firefox MV2 workaround for missing chrome.scripting)
async function getAccessTokenFromTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.executeScript(tabId, {
      code: `
        (async function() {
          try {
            const response = await fetch(location.origin + '/api/auth/session');
            const session = await response.json();
            session.accessToken || null;
          } catch (e) {
            console.error('Access token fetch error:', e);
            null;
          }
        })();
      `
    }, function(results) {
      if (chrome.runtime.lastError) {
        console.error('Script injection error:', chrome.runtime.lastError);
        resolve(null);
      } else if (results && results[0]) {
        resolve(results[0]);
      } else {
        resolve(null);
      }
    });
  });
}
