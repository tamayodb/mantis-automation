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
  const debugPanel    = document.getElementById('debug-panel');
  const debugContent  = document.getElementById('debug-content');
  const btnDebug      = document.getElementById('btn-debug');
  const btnSample     = document.getElementById('btn-sample');

  let currentTickets  = [];

  // ── 1. Check if we're on a Mantis page ──────────────────────────
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

  // ── 2. Load previously stored data on every popup open ──────────
  // This is the MAIN fix: always re-read storage when popup opens,
  // so we never miss data that arrived before the listener was set up.
  chrome.storage.local.get(['lastCSV', 'lastUpdated', 'lastRawSnippet'], (data) => {
    if (data.lastCSV && data.lastCSV.trim() !== '') {
      renderAll(data.lastCSV);
      if (data.lastUpdated) {
        lastUpdated.textContent = 'Last updated: ' + formatDate(data.lastUpdated);
      }
    } else {
      showEmpty();
    }
  });

  // ── 3. Export button ─────────────────────────────────────────────
  btnExport.addEventListener('click', () => {
    if (!activeTab) return;
    setExportLoading(true);

    chrome.tabs.sendMessage(activeTab.id, { action: 'TRIGGER_EXPORT' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setExportError('Cannot connect to page. Refresh the Mantis page and try again.');
        return;
      }
      if (response && response.success === false) {
        setExportError(response.error || 'Export failed.');
      }
    });

    setTimeout(() => {
      if (btnExport.classList.contains('loading')) {
        // Timeout: try reading storage directly as fallback
        chrome.storage.local.get(['lastCSV'], (data) => {
          if (data.lastCSV) {
            setExportLoading(false);
            renderAll(data.lastCSV);
            setExportStatus('✅ Dashboard updated!', 'success');
          } else {
            setExportError('Timed out. See troubleshooting tips below.');
          }
        });
      }
    }, 12000);
  });

  // ── 4. Storage change listener (catches real-time updates) ───────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastCSV && changes.lastCSV.newValue) {
      setExportLoading(false);
      const csv = changes.lastCSV.newValue;
      const tickets = parseCSV(csv);

      if (tickets.length === 0) {
        // CSV was stored but parsed to nothing — show diagnosis
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

  // ── 6. Debug button — shows raw stored CSV ───────────────────────
  btnDebug.addEventListener('click', () => {
    chrome.storage.local.get(['lastCSV'], (data) => {
      if (!data.lastCSV) {
        debugContent.textContent = 'Nothing stored yet. Click Export first.';
      } else {
        showDiagnosis(data.lastCSV);
      }
      debugPanel.classList.toggle('hidden');
    });
  });

  // ── 7. Load Sample Data button ───────────────────────────────────
  btnSample.addEventListener('click', () => {
    const sampleCSV = getSampleCSV();
    chrome.storage.local.set({ lastCSV: sampleCSV, lastUpdated: new Date().toISOString() }, () => {
      renderAll(sampleCSV);
      setExportStatus('✅ Sample data loaded!', 'success');
      lastUpdated.textContent = 'Last updated: ' + formatDate(new Date().toISOString()) + ' (sample)';
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

  // ── DIAGNOSIS — shown when CSV arrives but can't be parsed ───────
  function showDiagnosis(csv) {
    const first300 = csv.substring(0, 300).replace(/</g, '&lt;');
    const isHTML   = csv.trim().startsWith('<') || csv.toLowerCase().includes('<html');
    const lines    = csv.trim().split('\n');
    const headers  = lines[0] || '(empty)';

    let diagnosis = '';

    if (isHTML) {
      diagnosis = `
        <div class="diag-error">❌ <strong>Got an HTML page instead of CSV.</strong><br/>
        This usually means the export URL is redirecting to a <strong>login page</strong> or an error page.<br/><br/>
        <strong>Fix:</strong> Make sure you are logged in to Mantis and on the <em>View Issues</em> page, then try exporting again.</div>`;
    } else if (lines.length < 2) {
      diagnosis = `<div class="diag-warn">⚠️ CSV is empty or has only 1 line.</div>`;
    } else {
      const hasId   = headers.toLowerCase().includes('id');
      const hasType = headers.toLowerCase().includes('type');
      diagnosis = `
        <div class="diag-warn">⚠️ CSV received but no tickets parsed.<br/>
        <strong>Header row found:</strong><br/>
        <code>${headers.replace(/</g, '&lt;')}</code><br/><br/>
        ${!hasId   ? '❌ Missing column: <strong>Id</strong><br/>' : ''}
        ${!hasType ? '❌ Missing column: <strong>Type</strong> (needed for dashboard grouping)<br/>' : ''}
        <strong>Fix:</strong> Check that your Mantis CSV export includes the <em>Type</em>, <em>Severity</em>, <em>Status</em>, and <em>Assigned To</em> columns.</div>`;
    }

    debugContent.innerHTML = `
      ${diagnosis}
      <details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:10px;color:#555">▶ Show raw first 300 characters</summary>
        <pre style="font-size:9px;margin-top:4px;white-space:pre-wrap;word-break:break-all">${first300}</pre>
      </details>`;

    debugPanel.classList.remove('hidden');
    emptyState.classList.remove('hidden');
    dashboardArea.classList.add('hidden');
    copyBar.classList.add('hidden');
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

  // ── Copy BOTH tables for Outlook ─────────────────────────────────
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
        btnEl.textContent = '✅ Copied! Paste into Outlook.';
        btnEl.classList.add('copied');
        setTimeout(() => { btnEl.textContent = orig; btnEl.classList.remove('copied'); }, 3000);
      });
    } catch (e) {
      setExportStatus('❌ Copy failed: ' + e.message, 'error');
    }
  }
});

// ── SAMPLE DATA (Mantis Extract template) ─────────
function getSampleCSV() {
  return `Id,Project,Reporter,Summary,Description,Steps to Reproduce,Notes,Status,Type,Assigned To,Priority,Severity,Category,Date Submitted,Cycle,Origin,Reopened
63789,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] System permits filing of Field Itineraries with past dates,Description,,Notes,assigned,Defect,rrl@aclt-computing.com,normal,minor,Time and Attendance,2025-06-26,Cycle 1,,
63773,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Deficient maximum acceptable character count,Description,,Notes,resolved,Issue,user@smretail.com,normal,minor,Time and Attendance,2025-06-26,Cycle 1, No Error,
63592,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Time entries from TK device did not reflect,Description,,Notes,feedback,Issue,user@smretail.com,normal,major,Time and Attendance,2025-06-20,Cycle 1, Test Data/Environment,
63599,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Incorrect time entries being recorded,Description,,Notes,closed,Defect,user@smretail.com,normal,minor,Time and Attendance,2025-06-20,Cycle 1, No Error,
63724,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Leave Hours displaying 1.00,Description,,Notes,closed,Defect,user@smretail.com,normal,minor,Time and Attendance,2025-06-25,Cycle 1, Test Data/Environment,
63656,Project MyPrime - WWLI SQA SIT,user@smretail.com,Inaccessible/Not Working Modules in PROD Instance,Description,,Notes,resolved,Query,user@smretail.com,normal,minor,Homepage and Prime Modules,2025-06-23,Cycle 1, No Error,
63703,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Observed discrepancy in Filters,Description,,Notes,closed,Issue,user@smretail.com,normal,minor,Time and Attendance,2025-06-24,Cycle 1, No Error,
63710,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance - Holiday] Calendar size misaligned,Description,,Notes,assigned,Issue,elm@aclt-computing.com,normal,minor,Time and Attendance,2025-06-25,Cycle 1,,
63421,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Homepage] Error encountered when changing company,Description,,Notes,closed,Defect,user@smretail.com,normal,major,Homepage and Prime Modules,2025-06-13,Cycle 1, Test Data/Environment,
63586,Project MyPrime - WWLI SQA SIT,user@smretail.com,[myCenter - Timekeeping] Inconsistent dates being displayed,Description,,Notes,assigned,Issue,elm@aclt-computing.com,normal,minor,MyCenter,2025-06-20,Cycle 1,,
63563,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Values entered are not visible,Description,,Notes,closed,Issue,user@smretail.com,normal,minor,Time and Attendance,2025-06-19,Cycle 1, No Error,
63552,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Time and Attendance] Field Itinerary still labeled as Official Business,Description,,Notes,closed,Defect,user@smretail.com,normal,minor,Time and Attendance,2025-06-19,Cycle 1, No Error,
63516,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] IP Address Location is empty,Description,,Notes,closed,Setup,user@smretail.com,normal,minor,Organizational Data,2025-06-18,Cycle 1, Test Data/Environment,
63412,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] Confusing tab name when opening Branches,Description,,Notes,closed,Issue,user@smretail.com,normal,minor,Organizational Data,2025-06-13,Cycle 1, Test Data/Environment,
63326,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] Server Error in Application,Description,,Notes,closed,Defect,user@smretail.com,normal,major,Organizational Data,2025-06-11,Cycle 1, Code Error/Program Bug,
63350,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] Active/Inactive field not displayed in Branches,Description,,Notes,assigned,Setup,elm@aclt-computing.com,normal,minor,Organizational Data,2025-06-11,Cycle 1,,
63354,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] Unable to add Company,Description,,Notes,closed,Setup,user@smretail.com,normal,minor,Organizational Data,2025-06-11,Cycle 1, No Error,
63344,Project MyPrime - WWLI SQA SIT,user@smretail.com,[Organizational Data] Active/Inactive field not displayed in Company page,Description,,Notes,assigned,Setup,elm@aclt-computing.com,normal,minor,Organizational Data,2025-06-11,Cycle 1,,`;
}
