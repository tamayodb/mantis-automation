// dashboard.js - Renders HTML tables that replicate the Excel Defect Dashboard

// ─────────────────────────────────────────────
// TABLE 1: Per Ticket Type Dashboard
// ─────────────────────────────────────────────
function renderTypeDashboard(tickets) {
  const { statuses, rows } = buildTypeDashboardData(tickets);

  let html = `
  <div class="dashboard-title">Per Ticket Type Dashboard</div>
  <table class="pivot-table" id="table-type-dashboard">
    <thead>
      <tr>
        <th class="col-label">Type/Severity/Status</th>
        ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
        <th class="col-total">Grand Total</th>
      </tr>
    </thead>
    <tbody>`;

  rows.forEach(row => {
    if (row.kind === 'severity') {
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-value">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-severity">
        <td class="cell-severity">&nbsp;&nbsp;&nbsp;${capitalize(row.severity)}</td>
        ${cells}
        <td class="cell-total">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
      </tr>`;

    } else if (row.kind === 'type_total') {
      // Orange header row for each type (Issue, Query, Defect, etc.)
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-type-count">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-type-total">
        <td class="cell-type-label">${row.type}</td>
        ${cells}
        <td class="cell-type-grand">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
      </tr>`;

    } else if (row.kind === 'grand_total') {
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-grand">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-grand-total">
        <td class="cell-grand-label">Grand Total</td>
        ${cells}
        <td class="cell-grand">${row.rowTotal}</td>
      </tr>`;
    }
  });

  html += `</tbody></table>`;
  return html;
}

// ─────────────────────────────────────────────
// TABLE 2: Per Severity and Assigned To Dashboard
// ─────────────────────────────────────────────
function renderAssigneeDashboard(tickets) {
  const { statuses, rows } = buildAssigneeDashboardData(tickets);

  let html = `
  <div class="dashboard-title">Per Severity and Assigned to Dashboard</div>
  <table class="pivot-table" id="table-assignee-dashboard">
    <thead>
      <tr>
        <th class="col-label">Row Labels</th>
        <th class="col-label-sub">Assigned To</th>
        ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
        <th class="col-total">Grand Total</th>
      </tr>
    </thead>
    <tbody>`;

  rows.forEach(row => {
    if (row.kind === 'type_header') {
      // Orange type header row with totals
      const cells = statuses.map(s => {
        const v = (row.counts && row.counts[s]) || 0;
        return `<td class="cell-type-count">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-type-total">
        <td class="cell-type-label" colspan="2">${row.type}</td>
        ${cells}
        <td class="cell-type-grand">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
      </tr>`;

    } else if (row.kind === 'severity_header') {
      html += `<tr class="row-severity-header">
        <td class="cell-severity-h">&nbsp;&nbsp;&nbsp;${capitalize(row.severity)}</td>
        <td></td>
        ${statuses.map(() => '<td></td>').join('')}
        <td></td>
      </tr>`;

    } else if (row.kind === 'assignee') {
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-value">${v > 0 ? v : ''}</td>`;
      }).join('');
      const shortName = shortenEmail(row.assignee);
      html += `<tr class="row-assignee">
        <td class="cell-empty"></td>
        <td class="cell-assignee" title="${row.assignee}">${shortName}</td>
        ${cells}
        <td class="cell-total">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
      </tr>`;

    } else if (row.kind === 'grand_total') {
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-grand">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-grand-total">
        <td class="cell-grand-label" colspan="2">Grand Total</td>
        ${cells}
        <td class="cell-grand">${row.rowTotal}</td>
      </tr>`;
    }
  });

  html += `</tbody></table>`;
  return html;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function shortenEmail(email) {
  if (!email || email === 'Unassigned') return email;
  if (email.length <= 35) return email;
  return email.substring(0, 32) + '...';
}

// ─────────────────────────────────────────────
// COPY TO CLIPBOARD (formatted for Outlook paste)
// ─────────────────────────────────────────────
function copyDashboardToClipboard(tableId, btnEl) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const styledHtml = buildOutlookHTML(table);

  try {
    const blob = new Blob([styledHtml], { type: 'text/html' });
    const clipItem = new ClipboardItem({ 'text/html': blob });
    navigator.clipboard.write([clipItem]).then(() => {
      const orig = btnEl.textContent;
      btnEl.textContent = '✅ Copied!';
      btnEl.classList.add('copied');
      setTimeout(() => {
        btnEl.textContent = orig;
        btnEl.classList.remove('copied');
      }, 2000);
    }).catch(() => fallbackCopy(table, btnEl));
  } catch (e) {
    fallbackCopy(table, btnEl);
  }
}

function buildOutlookHTML(table) {
  const clone = table.cloneNode(true);
  const rows = clone.querySelectorAll('tr');

  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td, th');
    cells.forEach(cell => {
      const cls = cell.className;

      // Column header cells — dark navy, white bold
      if (cls.includes('col-status') || cls.includes('col-total') || cls.includes('col-label')) {
        cell.style.cssText = 'background-color:#1F4E79;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #BFBFBF;text-align:center;';
      }
      // Orange type row — label cell
      else if (cls.includes('cell-type-label')) {
        cell.style.cssText = 'background-color:#E87722;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;';
      }
      // Orange type row — count/grand cells
      else if (cls.includes('cell-type-count') || cls.includes('cell-type-grand')) {
        cell.style.cssText = 'background-color:#E87722;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;text-align:center;';
      }
      // Grand total row — dark navy, white bold
      else if (cls.includes('cell-grand-label') || cls.includes('cell-grand')) {
        cell.style.cssText = 'background-color:#1F4E79;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;text-align:center;';
      }
      // Severity label cells
      else if (cls.includes('cell-severity') || cls.includes('cell-severity-h')) {
        cell.style.cssText = 'background-color:#FFFFFF;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;';
      }
      // Data value cells and row totals
      else if (cls.includes('cell-value') || cls.includes('cell-total')) {
        cell.style.cssText = 'background-color:#FFFFFF;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;text-align:center;';
      }
      // Assignee email cells
      else if (cls.includes('cell-assignee')) {
        cell.style.cssText = 'background-color:#FFFFFF;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;color:#0563C1;text-decoration:underline;';
      }
      else {
        cell.style.cssText = 'background-color:#FFFFFF;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;';
      }
    });
  });

  clone.style.cssText = 'border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11px;';
  return clone.outerHTML;
}

function fallbackCopy(table, btnEl) {
  const range = document.createRange();
  range.selectNode(table);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
  btnEl.textContent = '✅ Copied (text)';
  setTimeout(() => { btnEl.textContent = btnEl.dataset.origText || '📋 Copy'; }, 2000);
}