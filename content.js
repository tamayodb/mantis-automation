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
    // Method 1: Direct CSV export link
    const links = Array.from(document.querySelectorAll('a'));
    const csvLink = links.find(a =>
      (a.href && a.href.includes('csv_export')) ||
      (a.textContent && a.textContent.trim().toLowerCase() === 'csv export') ||
      (a.textContent && a.textContent.trim().toLowerCase().includes('csv'))
    );
    if (csvLink) return csvLink.href;

    // Method 2: Build URL from current page context
    const currentUrl = new URL(window.location.href);
    const baseUrl = currentUrl.origin;
    const urlParams = new URLSearchParams(window.location.search);

    // Mantis standard CSV export endpoint
    const csvUrl = new URL(baseUrl + '/csv_export.php');

    // Carry over filter params if any
    urlParams.forEach((val, key) => {
      if (!['action'].includes(key)) csvUrl.searchParams.set(key, val);
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

      fetch(csvUrl, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(csvText => {
          chrome.runtime.sendMessage({ action: 'CSV_READY', csvData: csvText });
          sendResponse({ success: true });
        })
        .catch(err => {
          chrome.runtime.sendMessage({ action: 'CSV_ERROR', message: err.message });
          sendResponse({ success: false, error: err.message });
        });

      return true; // keep message channel open for async
    }
  });
})();
