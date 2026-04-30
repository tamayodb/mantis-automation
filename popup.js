document.addEventListener('DOMContentLoaded', async () => {

  // ── Inject dashboard CSS that matches the Excel screenshot design ──
  injectDashboardStyles();

  const btnExport     = document.getElementById('btn-export');
  const exportStatus  = document.getElementById('export-status');
  const notMantis     = document.getElementById('not-mantis');
  const dashboardArea = document.getElementById('dashboard-area');
  const emptyState    = document.getElementById('empty-state');
  const copyBar       = document.getElementById('copy-bar');
  const lastUpdated   = document.getElementById('last-updated');
  const ticketCount   = document.getElementById('ticket-count');
  const projectName   = document.getElementById('project-name');
  const debugPanel    = document.getElementById('debug-panel');
  const debugContent  = document.getElementById('debug-content');
  const btnDebug      = document.getElementById('btn-debug');
  const btnSample     = document.getElementById('btn-sample');

  let currentTickets  = [];

  let activeTab = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    chrome.tabs.sendMessage(tab.id, { action: 'CHECK_PAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        btnExport.disabled = false;
        return;
      }
      if (response && response.isMantisPage) {
        btnExport.disabled = false;
        notMantis.classList.add('hidden');
        if (response.projectName) projectName.textContent = response.projectName;
      } else {
        btnExport.disabled = true;
        notMantis.classList.remove('hidden');
      }
    });
  } catch (e) {
    btnExport.disabled = false;
  }

  chrome.storage.local.get(['lastCSV', 'lastUpdated', 'lastRawSnippet', 'ticketCount'], (data) => {
    const rawCount = data.ticketCount || (data.lastCSV ? data.lastCSV.trim().split('\n').length - 1 : 0);
    console.log(`[Popup] Loaded from storage: ${rawCount} tickets expected`);

    if (data.lastCSV && data.lastCSV.trim() !== '') {
      const parsed = parseCSV(data.lastCSV);
      console.log(`[Popup] Parsed: ${parsed.length} tickets`);

      if (parsed.length === 0 && rawCount > 0) {
        console.warn(`[Popup] ⚠️ DATA LOSS: Expected ${rawCount} tickets but parsed 0!`);
      }

      renderAll(data.lastCSV);
      if (data.lastUpdated) {
        lastUpdated.textContent = 'Last updated: ' + formatDate(data.lastUpdated);
      }
    } else {
      showEmpty();
    }
  });

  btnExport.addEventListener('click', () => {
    if (!activeTab) return;
    setExportLoading(true);
    console.log('[Popup] Export button clicked');

    chrome.tabs.sendMessage(activeTab.id, { action: 'TRIGGER_EXPORT' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        console.error('[Popup] Cannot connect to page:', chrome.runtime.lastError);
        setExportError('Cannot connect to page. Refresh the Mantis page and try again.');
        return;
      }
      if (response && response.success === false) {
        console.error('[Popup] Export failed:', response.error);
        setExportError(response.error || 'Export failed.');
      }
    });

    // Check storage after a delay
    setTimeout(() => {
      chrome.storage.local.get(['lastCSV', 'ticketCount'], (data) => {
        const rawCount = data.ticketCount || (data.lastCSV ? data.lastCSV.trim().split('\n').length - 1 : 0);
        console.log(`[Popup] After export - CSV size: ${data.lastCSV ? data.lastCSV.length : 0} chars, raw lines: ${rawCount}`);

        if (data.lastCSV) {
          const tickets = parseCSV(data.lastCSV);
          console.log(`[Popup] Parsed tickets: ${tickets.length}`);

          if (tickets.length > 0) {
            setExportLoading(false);
            renderAll(data.lastCSV);
            setExportStatus(`✅ Loaded ${tickets.length} tickets!`, 'success');
          } else if (rawCount > 0) {
            setExportLoading(false);
            setExportStatus(`⚠️ CSV received (${rawCount} lines) but parsing failed. See Debug panel.`, 'warn');
            chrome.storage.local.get(['lastCSV'], (d) => showDiagnosis(d.lastCSV));
          }
        }
      });
    }, 2000);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastCSV && changes.lastCSV.newValue) {
      setExportLoading(false);
      const csv = changes.lastCSV.newValue;
      const tickets = parseCSV(csv);

      if (tickets.length === 0) {
        showDiagnosis(csv);
        setExportStatus('⚠️ Data received but could not parse tickets. See diagnosis below.', 'warn');
      } else {
        renderAll(csv);
        setExportStatus('✅ Dashboard updated!', 'success');
        lastUpdated.textContent = 'Last updated: ' + formatDate(new Date().toISOString());
      }
    }
    if (changes.csvError && changes.csvError.newValue) {
      setExportLoading(false);
      setExportError(changes.csvError.newValue);
    }
  });

  document.getElementById('btn-copy-both').addEventListener('click', function () {
    copyBothDashboards(this);
  });
  document.getElementById('btn-copy-type').addEventListener('click', function () {
    copyDashboardToClipboard('table-type-dashboard', this);
  });
  document.getElementById('btn-copy-assignee').addEventListener('click', function () {
    copyDashboardToClipboard('table-assignee-dashboard', this);
  });

  btnDebug.addEventListener('click', () => {
    chrome.storage.local.get(['lastCSV', 'ticketCount'], (data) => {
      if (!data.lastCSV) {
        debugContent.textContent = 'Nothing stored yet. Click Export first.';
      } else {
        const rawCount = data.ticketCount || data.lastCSV.trim().split('\n').length - 1;
        const parsed = parseCSV(data.lastCSV);
        const lost = rawCount - parsed.length;
        const lossPercent = rawCount > 0 ? Math.round((lost / rawCount) * 100) : 0;

        console.log('[Popup] Debug - Raw lines:', rawCount, 'Parsed tickets:', parsed.length, 'Lost:', lost);

        let stats = `<div class="diag-stats">
          <strong>CSV Statistics:</strong><br/>
          CSV Size: ${data.lastCSV.length} characters<br/>
          Raw data lines: ${rawCount}<br/>
          Successfully parsed: ${parsed.length} tickets<br/>`;

        if (lost > 0) {
          stats += `<strong style="color:#C30000">Data Loss: ${lost} lines (${lossPercent}%)</strong><br/>
          Likely cause: Fields with embedded newlines (Description, Steps to Reproduce)<br/>
          Fix: Check Mantis export has all columns quoted properly<br/>`;
        } else {
          stats += `<strong style="color:#107C10">No data loss detected!</strong><br/>`;
        }

        stats += `</div>`;

        if (parsed.length > 0) {
          const sample = parsed[0];
          stats += `<div class="diag-sample" style="margin-top:8px">
            <strong>Sample ticket:</strong><br/>
            ID: ${sample.Id} | Type: ${sample.Type} | Status: ${sample.Status}
          </div>`;
        }

        debugContent.innerHTML = stats + '<hr style="margin:8px 0">' +
          `<div style="margin-top:8px">
            <button id="btn-download-csv" class="btn-secondary" style="margin-right:8px;padding:6px 10px;font-size:10px;">⬇️ Download CSV</button>
          </div>
          <details style="margin-top:8px">
            <summary style="cursor:pointer;font-size:10px;color:#555">▶ Show raw first 300 characters</summary>
            <pre style="font-size:9px;margin-top:4px;white-space:pre-wrap;word-break:break-all">${data.lastCSV.substring(0, 300).replace(/</g, '&lt;')}</pre>
          </details>`;

        setTimeout(() => {
          const dlBtn = document.getElementById('btn-download-csv');
          if (dlBtn) {
            dlBtn.addEventListener('click', () => {
              const blob = new Blob([data.lastCSV], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'mantis-export-' + new Date().toISOString().slice(0, 10) + '.csv';
              a.click();
              URL.revokeObjectURL(url);
            });
          }
        }, 10);

        if (lost > 0) {
          showDiagnosis(data.lastCSV);
        }
      }
      debugPanel.classList.toggle('hidden');
    });
  });


  // ── RENDER ───────────────────────────────────────────────────────
  function renderAll(csvText) {
    currentTickets = parseCSV(csvText);

    if (!currentTickets.length) {
      showEmpty();
      return;
    }

    ticketCount.textContent = currentTickets.length + ' ticket' + (currentTickets.length !== 1 ? 's' : '');

    document.getElementById('panel-type').innerHTML     = renderTypeDashboard(currentTickets);
    document.getElementById('panel-assignee').innerHTML = renderAssigneeDashboard(currentTickets);

    emptyState.classList.add('hidden');
    debugPanel.classList.add('hidden');
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
    if (type !== 'warn') setTimeout(() => { exportStatus.textContent = ''; }, 4000);
  }

  function setExportError(msg) {
    setExportLoading(false);
    setExportStatus('❌ ' + msg, 'error');
  }

  function formatDate(isoStr) {
    return new Date(isoStr).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function copyBothDashboards(btnEl) {
    const t1 = document.getElementById('table-type-dashboard');
    const t2 = document.getElementById('table-assignee-dashboard');
    if (!t1 && !t2) return;

    const title1 = '<p style="font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:12px;margin:0 0 4px 0;">Per Ticket Type Dashboard</p>';
    const title2 = '<p style="font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:12px;margin:16px 0 4px 0;">Per Severity and Assigned to Dashboard</p>';
    const html1  = t1 ? buildOutlookHTML(t1) : '';
    const html2  = t2 ? buildOutlookHTML(t2) : '';
    const combined = `<div style="font-family:Calibri,Arial,sans-serif;">${title1}${html1}${title2}${html2}</div>`;

    try {
      const blob     = new Blob([combined], { type: 'text/html' });
      const clipItem = new ClipboardItem({ 'text/html': blob });
      navigator.clipboard.write([clipItem]).then(() => {
        const orig = btnEl.textContent;
        btnEl.textContent = '✅ Copied!';
        btnEl.classList.add('copied');
        setTimeout(() => { btnEl.textContent = orig; btnEl.classList.remove('copied'); }, 3000);
      });
    } catch (e) {
      setExportStatus('❌ Copy failed: ' + e.message, 'error');
    }
  }

  // ── INJECT DASHBOARD TABLE STYLES ────────────────────────────────
  function injectDashboardStyles() {
    if (document.getElementById('dashboard-injected-styles')) return;
    const style = document.createElement('style');
    style.id = 'dashboard-injected-styles';
    style.textContent = `
      /* ── Dashboard title ── */
      .dashboard-title {
        background-color: #5b9bd5;
        color: #FFFFFF;
        font-family: Calibri, Arial, sans-serif;
        font-size: 12px;
        font-weight: bold;
        text-align: center;
        padding: 5px 8px;
        border: 1px solid #000000;
        border-bottom: none;
      }

      /* ── Table base ── */
      .pivot-table {
        border-collapse: collapse;
        font-family: Calibri, Arial, sans-serif;
        font-size: 11px;
        width: 100%;
        table-layout: auto;
      }

      /* ── Header row: dark navy ── */
      .pivot-table thead tr th {
        background-color: #5b9bd5;
        color: #FFFFFF;
        font-weight: bold;
        padding: 4px 8px;
        border: 1px solid #000000;
        text-align: center;
        white-space: nowrap;
      }
      .pivot-table thead tr th.col-label,
      .pivot-table thead tr th.col-label-sub {
        text-align: left;
      }

      /* ── Orange type header rows (Issue, Query, Defect…) ── */
      .row-type-total td.cell-type-label {
        background-color: #E87722;
        color: #FFFFFF;
        font-weight: bold;
        padding: 3px 8px;
        border: 1px solid #000000;
        text-align: left;
      }
      .row-type-total td.cell-type-count,
      .row-type-total td.cell-type-grand {
        background-color: #E87722;
        color: #FFFFFF;
        font-weight: bold;
        padding: 3px 8px;
        border: 1px solid #000000;
        text-align: center;
      }

      /* ── Severity rows (major, minor, block) ── */
      .row-severity td,
      .row-severity-header td {
        background-color: #FFFFFF;
        padding: 3px 8px;
        border: 1px solid #000000;
      }
      .cell-severity,
      .cell-severity-h {
        text-align: left;
        color: #000000;
      }
      .cell-value,
      .cell-total {
        text-align: center;
        color: #000000;
      }

      /* ── Assignee rows ── */
      .row-assignee td {
        background-color: #FFFFFF;
        padding: 3px 8px;
        border: 1px solid #000000;
      }
      .cell-assignee {
        color: #0563C1;
        text-decoration: underline;
        cursor: default;
        text-align: left;
        font-size: 10px;
      }
      .cell-empty {
        background-color: #FFFFFF;
      }

      /* ── Grand Total row: dark navy ── */
      .row-grand-total td.cell-grand-label,
      .row-grand-total td.cell-grand {
        background-color: #5b9bd5;
        color: #FFFFFF;
        font-weight: bold;
        padding: 3px 8px;
        border: 1px solid #000000;
        text-align: center;
      }
      .row-grand-total td.cell-grand-label {
        text-align: left;
      }

      /* ── Zebra stripe for severity rows ── */
      .row-severity:nth-child(even) td {
        background-color: #F5F9FC;
      }

      /* ── Spacing between tables ── */
      #panel-assignee {
        margin-top: 16px;
      }
    `;
    document.head.appendChild(style);
  }
});