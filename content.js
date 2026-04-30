// content.js - Injected into every page; detects Mantis and handles CSV export

(function () {
  'use strict';

  function isMantisPage() {
    const url = window.location.href;
    const title = document.title.toLowerCase();
    return (
      url.includes('view_all_bug_page') ||
      url.includes('view_all_set') ||
      url.includes('mantis') ||
      title.includes('mantis') ||
      title.includes('view issues') ||
      !!document.querySelector('a[href*="csv_export"]') ||
      !!document.querySelector('#view_all_bug_page') ||
      !!document.querySelector('.buglist')
    );
  }

  function getProjectInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    let projectId = urlParams.get('project_id');

    if (!projectId) {
      const input = document.querySelector('input[name="project_id"], select[name="project_id"]');
      if (input) projectId = input.value;
    }

    // Try to get project name from page
    const projectSelect = document.querySelector('select[name="project_id"] option[selected], #project_id option[selected]');
    const projectName = projectSelect ? projectSelect.textContent.trim() : null;

    return { projectId, projectName };
  }

  function findCSVExportUrl() {
    // 1. First, try to find the actual "CSV Export" link on the page
    const links = Array.from(document.querySelectorAll('a'));
    const csvLink = links.find(a => 
      a.href && a.href.includes('csv_export.php')
    );

    if (csvLink) return csvLink.href;

    // 2. Fallback: Build the URL based on the folder you are currently in
    const currentUrl = new URL(window.location.href);
    
    // Get the folder path (e.g., "/mantisbt/")
    const pathParts = currentUrl.pathname.split('/');
    pathParts.pop(); // Remove "view_all_bug_page.php"
    const directoryPath = pathParts.join('/');

    // Combine: Origin (http://homantis1.smretailinc.com) + Directory (/mantisbt)
    const baseUrl = currentUrl.origin + directoryPath + '/csv_export.php';
    const csvUrl = new URL(baseUrl);

    // 3. Attach your current filters (project_id, etc.)
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.forEach((val, key) => {
      if (key !== 'action') csvUrl.searchParams.set(key, val);
    });

    return csvUrl.toString();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'CHECK_PAGE') {
      const info = getProjectInfo();
      sendResponse({
        isMantisPage: isMantisPage(),
        url: window.location.href,
        projectId: info.projectId,
        projectName: info.projectName
      });
      return true;
    }

    if (msg.action === 'TRIGGER_EXPORT') {
      const csvUrl = findCSVExportUrl();
      console.log('[Mantis] CSV Export URL:', csvUrl);

      fetch(csvUrl, { 
        method: 'GET',
        credentials: 'include', // Sends your login cookies
        headers: {
          'Accept': 'text/csv'
        }
      })
      .then(async res => {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          // If we see HTML, the session is likely stale or URL is wrong
          throw new Error('Mantis returned a web page instead of data. Try clicking the "CSV Export" link manually on the page once to "wake up" the session.');
        }
        return res.text();
      })
      .then(csvText => {
        const lineCount = csvText.trim().split('\n').length;
        const charCount = csvText.length;
        console.log(`[Mantis] CSV fetched: ${charCount} chars, ${lineCount} lines (${lineCount - 1} tickets)`);

        // For large CSVs, chunk the data to avoid message size limits
        const maxChunkSize = 1000000; // ~1MB chunks
        if (csvText.length > maxChunkSize) {
          console.log(`[Mantis] Large CSV detected (${charCount} chars). Sending in chunks...`);
          sendChunkedCSV(csvText);
        } else {
          chrome.runtime.sendMessage({ 
            action: 'CSV_READY', 
            csvData: csvText,
            lineCount: lineCount - 1
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.error('[Mantis] sendMessage error:', chrome.runtime.lastError);
            }
          });
        }
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error('[Mantis] Fetch error:', err);
        chrome.runtime.sendMessage({ action: 'CSV_ERROR', message: err.message });
        sendResponse({ success: false, error: err.message });
      });

      return true;
    }

    function sendChunkedCSV(csvText) {
      // Split CSV preserving header in each chunk
      const lines = csvText.split('\n');
      const header = lines[0];
      const dataLines = lines.slice(1);
      const maxLinesPerChunk = 500;
      let chunkIndex = 0;

      function sendNextChunk() {
        if (chunkIndex * maxLinesPerChunk >= dataLines.length) {
          // All chunks sent, signal completion
          chrome.runtime.sendMessage({ 
            action: 'CSV_CHUNKS_DONE',
            totalLines: dataLines.length
          });
          return;
        }

        const start = chunkIndex * maxLinesPerChunk;
        const end = Math.min(start + maxLinesPerChunk, dataLines.length);
        const chunk = [header, ...dataLines.slice(start, end)].join('\n');
        
        chrome.runtime.sendMessage({ 
          action: 'CSV_CHUNK',
          chunkIndex: chunkIndex,
          chunk: chunk,
          isLast: end >= dataLines.length
        }, (res) => {
          if (chrome.runtime.lastError) {
            console.error(`[Mantis] Chunk ${chunkIndex} error:`, chrome.runtime.lastError);
          } else {
            console.log(`[Mantis] Chunk ${chunkIndex} sent (lines ${start}-${end})`);
            chunkIndex++;
            sendNextChunk();
          }
        });
      }

      sendNextChunk();
    }
  });
})();
