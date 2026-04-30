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
        <th class="header-main" colspan="1"></th>
        <th class="header-group" colspan="${statuses.length + 1}">Column Labels</th>
      </tr>
      <tr>
        <th class="col-label">Type/Severity/Status</th>
        ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
        <th class="col-total">Grand Total</th>
      </tr>
    </thead>
    <tbody>`;

  // Group rows so the orange type_total row renders FIRST,
  // followed by its severity breakdown rows underneath.
  const groups = [];
  let currentGroup = null;

  rows.forEach(row => {
    if (row.kind === 'type_total') {
      currentGroup = { total: row, severities: [] };
      groups.push(currentGroup);
    } else if (row.kind === 'severity') {
      if (currentGroup) currentGroup.severities.push(row);
    } else if (row.kind === 'grand_total') {
      groups.push({ grandTotal: row });
    }
  });

  groups.forEach(group => {
    if (group.grandTotal) {
      // Grand Total row — dark navy
      const row = group.grandTotal;
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-grand">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-grand-total">
        <td class="cell-grand-label">Grand Total</td>
        ${cells}
        <td class="cell-grand">${row.rowTotal}</td>
      </tr>`;

    } else {
      // Orange type total row FIRST
      const total = group.total;
      const totalCells = statuses.map(s => {
        const v = total.counts[s] || 0;
        return `<td class="cell-subtotal">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-type-total">
        <td class="cell-type-total">${total.type}</td>
        ${totalCells}
        <td class="cell-subtotal-total">${total.rowTotal > 0 ? total.rowTotal : ''}</td>
      </tr>`;

      // Then severity breakdown rows (major, minor, block…)
      group.severities.forEach(row => {
        const cells = statuses.map(s => {
          const v = row.counts[s] || 0;
          return `<td class="cell-value">${v > 0 ? v : ''}</td>`;
        }).join('');
        html += `<tr class="row-severity">
          <td class="cell-severity">&nbsp;&nbsp;&nbsp;${capitalize(row.severity)}</td>
          ${cells}
          <td class="cell-total">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
        </tr>`;
      });
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
        <th class="header-main" colspan="2"></th>
        <th class="header-group" colspan="${statuses.length + 1}">Column Labels</th>
      </tr>
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
      html += `<tr class="row-type-label">
        <td class="cell-type" colspan="2">${row.type}</td>
        ${statuses.map(() => '<td></td>').join('')}
        <td></td>
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
  // Clone table and apply inline styles that exactly mirror
  // the CSS injected by injectDashboardStyles() in popup.js.
  const clone = table.cloneNode(true);
  const rows = clone.querySelectorAll('tr');

  // Base font shared by every cell
  const base = 'font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #BFBFBF;';
  const navy = 'background-color:#1F4E79;color:#FFFFFF;font-weight:bold;';
  const orange = 'background-color:#E87722;color:#FFFFFF;font-weight:bold;';
  const center = 'text-align:center;';

  rows.forEach(tr => {
    tr.querySelectorAll('td, th').forEach(cell => {
      const cls = cell.className;

      // ── thead: header-group, col-label, col-label-sub, col-status, col-total ──
      if (
        cls.includes('header-group') ||
        cls.includes('header-main') ||
        cls.includes('col-label') ||
        cls.includes('col-label-sub') ||
        cls.includes('col-status') ||
        cls.includes('col-total')
      ) {
        cell.style.cssText = base + navy + center;
        if (cls.includes('col-label') || cls.includes('col-label-sub')) {
          cell.style.textAlign = 'left';
        }

      // ── Orange type-total row ──
      // cell-type-total  →  label cell (left-aligned)
      // cell-subtotal    →  count cells (centered)
      // cell-subtotal-total → grand cell of the row (centered)
      } else if (cls.includes('cell-type-total')) {
        cell.style.cssText = base + orange + 'text-align:left;';
      } else if (cls.includes('cell-subtotal-total') || cls.includes('cell-subtotal')) {
        cell.style.cssText = base + orange + center;

      // ── Orange type-label row (assignee table: cell-type) ──
      } else if (cls.includes('cell-type')) {
        cell.style.cssText = base + orange + 'text-align:left;';

      // ── Grand total row ──
      } else if (cls.includes('cell-grand-label')) {
        cell.style.cssText = base + navy + 'text-align:left;';
      } else if (cls.includes('cell-grand')) {
        cell.style.cssText = base + navy + center;

      // ── Severity label cells ──
      } else if (cls.includes('cell-severity-h') || cls.includes('cell-severity')) {
        cell.style.cssText = base + 'background-color:#FFFFFF;color:#000000;text-align:left;';

      // ── Data value / row-total cells ──
      } else if (cls.includes('cell-value') || cls.includes('cell-total')) {
        cell.style.cssText = base + 'background-color:#FFFFFF;color:#000000;' + center;

      // ── Assignee email cells ──
      } else if (cls.includes('cell-assignee')) {
        cell.style.cssText = base + 'background-color:#FFFFFF;color:#0563C1;text-decoration:underline;text-align:left;';

      // ── Everything else (empty spacer cells, etc.) ──
      } else {
        cell.style.cssText = base + 'background-color:#FFFFFF;';
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