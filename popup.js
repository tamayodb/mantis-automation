// popup.js - Main popup controller

document.addEventListener('DOMContentLoaded', async () => {

  const btnExport     = document.getElementById('btn-export');
  const exportStatus  = document.getElementById('export-status');
  const notMantis     = document.getElementById('not-mantis');
  const dashboardArea = document.getElementById('dashboard-area');
  const emptyState    = document.getElementById('empty-state');
  const copyBar       = document.getElementById('copy-bar');
  const lastUpdated   = document.getElementById('last-updated');
  const ticketCount   = document.getElementById('ticket-count');
  const projectName   = document.getElementById('project-name');

  let currentTickets  = [];

  // ── 1. Check if we're on a Mantis page ──────────────────────────
  let activeTab = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    chrome.tabs.sendMessage(tab.id, { action: 'CHECK_PAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not injected yet — show generic state
        btnExport.disabled = false;
        showEmpty();
        return;
      }

      if (response && response.isMantisPage) {
        btnExport.disabled = false;
        notMantis.classList.add('hidden');
        if (response.projectName) {
          projectName.textContent = response.projectName;
        }
      } else {
        btnExport.disabled = true;
        notMantis.classList.remove('hidden');
      }
    });
  } catch (e) {
    btnExport.disabled = false;
  }

  // ── 2. Load previously stored CSV data ──────────────────────────
  chrome.storage.local.get(['lastCSV', 'lastUpdated'], (data) => {
    if (data.lastCSV && data.lastCSV.trim() !== '') {
      renderAll(data.lastCSV);
      if (data.lastUpdated) {
        const dt = new Date(data.lastUpdated);
        lastUpdated.textContent = 'Last updated: ' + dt.toLocaleString('en-PH', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      }
    } else {
      showEmpty();
    }
  });

  // ── 3. Export button click ───────────────────────────────────────
  btnExport.addEventListener('click', () => {
    if (!activeTab) return;

    setExportLoading(true);

    chrome.tabs.sendMessage(activeTab.id, { action: 'TRIGGER_EXPORT' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setExportError('Could not connect to page. Please refresh the Mantis page and try again.');
        return;
      }
      if (!response.success) {
        setExportError(response.error || 'Export failed.');
      }
      // Success is handled by storage.onChanged below
    });

    // Timeout fallback
    setTimeout(() => {
      if (btnExport.classList.contains('loading')) {
        setExportError('Export timed out. Check that you are on a Mantis View Issues page.');
      }
    }, 15000);
  });

  // ── 4. Listen for new CSV data from background ──────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastCSV) {
      setExportLoading(false);
      renderAll(changes.lastCSV.newValue);
      setExportStatus('✅ Dashboard updated!', 'success');

      const dt = new Date();
      lastUpdated.textContent = 'Last updated: ' + dt.toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
    if (changes.csvError) {
      setExportLoading(false);
      setExportError(changes.csvError.newValue || 'Unknown export error.');
    }
  });

  // ── 5. Copy buttons ──────────────────────────────────────────────
  document.getElementById('btn-copy-both').addEventListener('click', function () {
    copyBothDashboards(this);
  });

  document.getElementById('btn-copy-type').addEventListener('click', function () {
    copyDashboardToClipboard('table-type-dashboard', this);
  });

  document.getElementById('btn-copy-assignee').addEventListener('click', function () {
    copyDashboardToClipboard('table-assignee-dashboard', this);
  });

  // ── RENDER ───────────────────────────────────────────────────────
  function renderAll(csvText) {
    currentTickets = parseCSV(csvText);

    if (!currentTickets.length) {
      showEmpty();
      return;
    }

    // Update ticket count
    ticketCount.textContent = currentTickets.length + ' ticket' + (currentTickets.length !== 1 ? 's' : '');

    // Render both dashboards
    document.getElementById('panel-type').innerHTML = renderTypeDashboard(currentTickets);
    document.getElementById('panel-assignee').innerHTML = renderAssigneeDashboard(currentTickets);

    emptyState.classList.add('hidden');
    dashboardArea.classList.remove('hidden');
    copyBar.classList.remove('hidden');
  }

  function showEmpty() {
    dashboardArea.classList.add('hidden');
    copyBar.classList.add('hidden');
    emptyState.classList.remove('hidden');
  }

  function setExportLoading(loading) {
    if (loading) {
      btnExport.disabled = true;
      btnExport.classList.add('loading');
      btnExport.innerHTML = '<span class="btn-icon spin">⏳</span> Exporting...';
      exportStatus.textContent = '';
    } else {
      btnExport.disabled = false;
      btnExport.classList.remove('loading');
      btnExport.innerHTML = '<span class="btn-icon">📥</span> Export for Defect Management';
    }
  }

  function setExportStatus(msg, type) {
    exportStatus.textContent = msg;
    exportStatus.className = 'export-msg ' + (type || '');
    setTimeout(() => { exportStatus.textContent = ''; }, 3000);
  }

  function setExportError(msg) {
    setExportLoading(false);
    setExportStatus('❌ ' + msg, 'error');
  }

  // Copy BOTH tables as one HTML block for Outlook
  function copyBothDashboards(btnEl) {
    const t1 = document.getElementById('table-type-dashboard');
    const t2 = document.getElementById('table-assignee-dashboard');
    if (!t1 && !t2) return;

    const title1 = '<p style="font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:12px;margin:0 0 4px 0;">Per Ticket Type Dashboard</p>';
    const title2 = '<p style="font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:12px;margin:16px 0 4px 0;">Per Severity and Assigned to Dashboard</p>';

    const html1 = t1 ? buildOutlookHTML(t1) : '';
    const html2 = t2 ? buildOutlookHTML(t2) : '';

    const combined = `<div style="font-family:Calibri,Arial,sans-serif;">${title1}${html1}${title2}${html2}</div>`;

    try {
      const blob = new Blob([combined], { type: 'text/html' });
      const clipItem = new ClipboardItem({ 'text/html': blob });
      navigator.clipboard.write([clipItem]).then(() => {
        const orig = btnEl.textContent;
        btnEl.textContent = '✅ Both dashboards copied! Paste into Outlook.';
        btnEl.classList.add('copied');
        setTimeout(() => {
          btnEl.textContent = orig;
          btnEl.classList.remove('copied');
        }, 3000);
      });
    } catch (e) {
      setExportStatus('❌ Copy failed: ' + e.message, 'error');
    }
  }
});
