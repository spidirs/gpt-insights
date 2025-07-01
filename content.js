// ChatGPT Path Content Script
console.log('ChatGPT Path loaded');

// Function to extract conversation ID from URL
function getConversationId() {
  const urlPatterns = [
    /\/c\/([^/]+)/,
    /\/chat\/([^/]+)/,
    /\/conversation\/([^/]+)/
  ];

  for (const pattern of urlPatterns) {
    const match = location.pathname.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Function to extract all data from conversation object
function extractAllData(obj) {
  const data = {
    queries: new Set(),
    thoughts: [],
    products: [],
    toolCalls: [],
    sources: new Set(),
    citations: []
  };

  extractDataRecursively(obj, data);

  return {
    queries: Array.from(data.queries),
    thoughts: data.thoughts,
    products: data.products,
    toolCalls: data.toolCalls,
    sources: Array.from(data.sources),
    citations: data.citations
  };
}

function extractDataRecursively(obj, data) {
  if (typeof obj !== 'object' || obj === null) return;

  if (Array.isArray(obj)) {
    obj.forEach(item => extractDataRecursively(item, data));
    return;
  }

  if (obj.metadata && Array.isArray(obj.metadata.search_queries)) {
    obj.metadata.search_queries.forEach(sq => {
      if (sq.q) data.queries.add(sq.q);
    });
  }

  if (obj.content && obj.content.content_type === 'thoughts') {
    if (Array.isArray(obj.content.thoughts)) {
      obj.content.thoughts.forEach(thought => {
        if (thought.summary || thought.content) {
          data.thoughts.push({
            summary: thought.summary || '',
            content: thought.content || '',
            timestamp: obj.create_time || null
          });
        }
      });
    }
  }

  if ((obj.recipient === 'web.run' || obj.recipient === 'web') && obj.content && obj.content.text) {
    try {
      const parsedContent = JSON.parse(obj.content.text);

      if (parsedContent.search_query && Array.isArray(parsedContent.search_query)) {
        parsedContent.search_query.forEach(sq => {
          if (sq.q) data.queries.add(sq.q);
        });
      }

      data.toolCalls.push({
        type: parsedContent.product_query ? 'product_lookup' : 'search',
        content: parsedContent,
        recipient: obj.recipient || 'unknown',
        timestamp: obj.create_time || null
      });
    } catch (e) {
      // Skip invalid JSON
    }
  }

  if (obj.metadata && obj.metadata.citations) {
    if (Array.isArray(obj.metadata.citations)) {
      obj.metadata.citations.forEach(citation => {
        data.citations.push(citation);
      });
    }
  }

  if (obj.metadata && obj.metadata.search_result_groups) {
    if (Array.isArray(obj.metadata.search_result_groups)) {
      obj.metadata.search_result_groups.forEach(group => {
        if (group.entries && Array.isArray(group.entries)) {
          group.entries.forEach(entry => {
            if (entry.url && entry.title) {
              data.sources.add(JSON.stringify({
                url: entry.url,
                title: entry.title,
                snippet: entry.snippet || '',
                domain: group.domain || '',
                attribution: entry.attribution || ''
              }));
            }
          });
        }
      });
    }
  }

  for (const key in obj) {
    if (typeof obj[key] === 'object' || typeof obj[key] === 'string') {
      extractDataRecursively(obj[key], data);
    }
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Export data as CSV
function exportAllDataAsCSV(extractedData) {
  const rows = [];
  rows.push(['Type', 'Content']);

  extractedData.queries.forEach(q => rows.push(['Query', q]));
  extractedData.thoughts.forEach(t => rows.push(['Thought', t.summary || t.content]));
  extractedData.products.forEach(p => rows.push(['Product', p.selections]));
  extractedData.toolCalls.forEach(tc => rows.push(['Tool Call', tc.type + ' - ' + tc.recipient]));
  extractedData.sources.forEach(s => {
    const source = JSON.parse(s);
    rows.push(['Source', source.title + ' - ' + source.url]);
  });
  extractedData.citations.forEach(c => rows.push(['Citation', JSON.stringify(c)]));

  const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chatgpt-insights.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Data exported to CSV!');
}

// Sidebar rendering
function showDataSidebar(extractedData) {
  const existingSidebar = document.getElementById('chatgpt-query-sidebar');
  if (existingSidebar) existingSidebar.remove();

  const sidebar = document.createElement('div');
  sidebar.id = 'chatgpt-query-sidebar';

  sidebar.innerHTML = `
    <div class="sidebar-header">      
        <img src="${chrome.runtime.getURL('logo.png')}" alt="ChatGPT Insights" class="header-logo" />
      <button class="close-btn" id="sidebar-close-btn" title="Close sidebar">✕</button>
    </div>

    <div class="sidebar-content">
      ${buildSection('📋 Search Queries', extractedData.queries, buildQueryItem)}
      ${buildSection('💭 Internal Thoughts', extractedData.thoughts, buildThoughtItem)}
      ${buildSection('🛍️ Products', extractedData.products, buildProductItem)}
      ${buildSection('🔧 Tool Calls', extractedData.toolCalls, buildToolItem)}
      ${buildSection('📚 RAG Sources', Array.from(extractedData.sources).map(s => JSON.parse(s)), buildSourceItem)}
      ${buildSection('🔖 Citations', extractedData.citations, buildCitationItem)}
    </div>

    <div class="sidebar-footer">
      <button class="export-btn" id="sidebar-export-btn">📊 Export to CSV</button>
    </div>
  `;

  document.body.appendChild(sidebar);

  document.getElementById('sidebar-close-btn').addEventListener('click', () => sidebar.remove());
  document.getElementById('sidebar-export-btn').addEventListener('click', () => exportAllDataAsCSV(extractedData));
}

function buildSection(title, items, itemBuilder) {
  if (!items || items.length === 0) return '';
  return `
    <div class="section">
      <h3>${title} (${items.length})</h3>
      <div>${items.map((item, i) => itemBuilder(item, i)).join('')}</div>
    </div>
  `;
}

function buildQueryItem(query, i) {
  return `
    <div class="query-item">
      <div class="query-number">Query ${i + 1}</div>
      <div class="query-text">${escapeHtml(query)}</div>
    </div>
  `;
}

function buildThoughtItem(thought, i) {
  return `
    <div class="thought-item">
      <div class="thought-number">Thought ${i + 1}</div>
      ${thought.summary ? `<div class="thought-summary">${escapeHtml(thought.summary)}</div>` : ''}
      <div class="thought-content">${escapeHtml(thought.content)}</div>
    </div>
  `;
}

function buildProductItem(product, i) {
  return `
    <div class="product-item">
      <div class="product-number">Product ${i + 1}</div>
      <div class="product-selections">${escapeHtml(product.selections || '')}</div>
    </div>
  `;
}

function buildToolItem(tool, i) {
  return `
    <div class="tool-item">
      <div class="tool-number">Tool ${i + 1}</div>
      <div class="tool-type">${escapeHtml(tool.type)}</div>
      <div class="tool-recipient">${escapeHtml(tool.recipient)}</div>
      <div class="tool-content"><pre>${escapeHtml(JSON.stringify(tool.content, null, 2))}</pre></div>
    </div>
  `;
}

function buildSourceItem(source, i) {
  return `
    <div class="source-item">
      <div class="source-number">Source ${i + 1}</div>
      <div class="source-title"><a href="${source.url}" target="_blank">${escapeHtml(source.title)}</a></div>
      ${source.snippet ? `<div class="source-snippet">${escapeHtml(source.snippet)}</div>` : ''}
    </div>
  `;
}

function buildCitationItem(citation, i) {
  return `
    <div class="citation-item">
      <div class="citation-number">Citation ${i + 1}</div>
      <div class="citation-content"><pre>${escapeHtml(JSON.stringify(citation, null, 2))}</pre></div>
    </div>
  `;
}

// Runtime message listener for popup → content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "runExtractor") {
    console.log('Received runExtractor message from popup');
    extractChatGPTQueries().then(() => sendResponse({ status: 'done' }))
    .catch((err) => {
      console.error('Extractor failed:', err);
      sendResponse({ status: 'error', error: err.toString() });
    });
    return true;
  }
});

// Main extractor function
async function extractChatGPTQueries() {
  try {
    const cid = getConversationId();
    if (!cid) {
      alert('Open a ChatGPT conversation first.');
      return;
    }

    console.log('Extracting queries for conversation:', cid);

    const sess = await fetch(location.origin + '/api/auth/session').then(r => r.json());
    if (!sess.accessToken) {
      alert('Please make sure you are logged in to ChatGPT.');
      return;
    }

    console.log('Got access token. Fetching conversation...');

    const res = await fetch(location.origin + '/backend-api/conversation/' + cid, {
      headers: {
        'Authorization': `Bearer ${sess.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.error('Error fetching conversation data:', res.status, await res.text());
      alert('Could not fetch conversation data. Make sure you are logged in to ChatGPT and try again.');
      return;
    }

    const data = await res.json();
    console.log('Fetched conversation data:', data);

    const extractedData = extractAllData(data);
    console.log('Extracted data:', extractedData);
    showDataSidebar(extractedData);

  } catch (e) {
    console.error('Error extracting queries:', e);
    alert('An unexpected error occurred during extraction.');
  }
}
