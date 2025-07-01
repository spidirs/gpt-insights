// Popup script for ChatGPT Query Extractor (Firefox MV2-safe)

document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extractBtn');
  const status = document.getElementById('status');

  function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';

    if (type === 'success') {
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
    }
  }

  function hideStatus() {
    status.style.display = 'none';
  }

  extractBtn.addEventListener('click', function() {
    extractBtn.disabled = true;
    extractBtn.textContent = '⏳ Extracting...';
    hideStatus();

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const tab = tabs[0];

      if (!tab.url.includes('chat.openai.com') && !tab.url.includes('chatgpt.com')) {
        showStatus('Please open a ChatGPT conversation first', 'error');
        extractBtn.disabled = false;
        extractBtn.textContent = 'Run Query Extractor';
        return;
      }

      if (!tab.url.includes('/c/')) {
        showStatus('Please open a specific ChatGPT conversation and wait for it to load completely', 'error');
        extractBtn.disabled = false;
        extractBtn.textContent = 'Run Query Extractor';
        return;
      }

      showStatus('Sending extraction request...', 'info');

      chrome.tabs.sendMessage(tab.id, { action: "runExtractor" }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Messaging error:', chrome.runtime.lastError);
          showStatus('Error extracting queries. Please try again.', 'error');
        } else if (response && response.status === 'done') {
          showStatus('Extraction completed!', 'success');
          window.close();
        } else {
          showStatus('No queries found or extraction failed.', 'info');
        }

        extractBtn.disabled = false;
        extractBtn.textContent = 'Run Query Extractor';
      });
    });
  });
});
