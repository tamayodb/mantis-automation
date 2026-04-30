// ─────────────────────────────────────────────
// TABLE 1: Per Ticket Type Dashboard
// ─────────────────────────────────────────────
function renderTypeDashboard(tickets) {
  const { statuses, rows } = buildTypeDashboardData(tickets);
  
  // Sort rows to match screenshot: Type Total (Orange) -> Severities (White)
  // We group by type and ensure the 'type_total' comes before 'severity' rows
  const sortedRows = sortDashboardRows(rows, 'type');

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

  let prevType = null;
  sortedRows.forEach(row => {
    if (row.kind === 'severity') {
      // If type changed, we don't need to print the type label again because 
      // the 'type_total' row (which comes first now) handles the type label.
      // However, if the data structure relies on 'prevType' to print headers, 
      // we might need to adjust. 
      // Based on screenshots: Orange Row = Type, White Row = Severity.
      
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
      // Render Type Total Row (Orange)
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-subtotal">${v > 0 ? v : ''}</td>`;
      }).join('');
      
      html += `<tr class="row-type-total">
         <td class="cell-type-total">${row.type}</td>
        ${cells}
         <td class="cell-subtotal-total">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
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
// ────────────────────────────────────────────
function renderAssigneeDashboard(tickets) {
  const { statuses, rows } = buildAssigneeDashboardData(tickets);
  
  // Sort rows: Type Header -> Assignees
  const sortedRows = sortDashboardRows(rows, 'type');

  let html = `
  <div class="dashboard-title">Per Severity and Assigned to Dashboard</div>
  <table class="pivot-table" id="table-assignee-dashboard">
  <thead>
  <tr>
    <!-- Simplified Header to match Screenshot 2 -->
    <th class="col-label">Labels</th>
    <th class="col-label-sub">Assigned To</th>
    ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
    <th class="col-total">Grand Total</th>
  </tr>
  </thead>
  <tbody>`;

  sortedRows.forEach(row => {
    if (row.kind === 'type_header' || row.kind === 'type_total') {
      // Type Header Row (Orange)
      // In Screenshot 2, "Issue" spans or sits in Col 1.
      html += `<tr class="row-type-label">
         <td class="cell-type" colspan="2">${row.type}</td>
        ${statuses.map(() => `<td></td>`).join('')}
         <td></td>
       </tr>`;
       
    } else if (row.kind === 'severity_header') {
      // If severity headers exist in data, render them (White)
      // Screenshot 2 doesn't explicitly show them, but title implies it.
      // We render them just in case, styled as white rows.
      html += `<tr class="row-severity-header">
         <td class="cell-severity-h" colspan="2">&nbsp;&nbsp;&nbsp;${capitalize(row.severity)}</td>
        ${statuses.map(() => `<td></td>`).join('')}
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

// Helper to sort rows so Totals/Headers come before details
function sortDashboardRows(rows, groupKey) {
  // Separate grand total
  const grandTotal = rows.find(r => r.kind === 'grand_total');
  const otherRows = rows.filter(r => r.kind !== 'grand_total');
  
  // Group by type
  const groups = {};
  otherRows.forEach(row => {
    const key = row[groupKey] || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  const sorted = [];
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    // Sort: type_total/header first, then others
    group.sort((a, b) => {
      const isTotalA = a.kind.includes('total') || a.kind.includes('header');
      const isTotalB = b.kind.includes('total') || b.kind.includes('header');
      if (isTotalA && !isTotalB) return -1;
      if (!isTotalA && isTotalB) return 1;
      return 0;
    });
    sorted.push(...group);
  });

  if (grandTotal) sorted.push(grandTotal);
  return sorted;
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
// COPY TO CLIPBOARD
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
      const cls = cell.className || '';
      
      // Header Styles (Dark Blue #1F4E79)
      if (cls.includes('header-group') || cls.includes('col-status') || cls.includes('col-total') || cls.includes('col-label') || cls.includes('col-label-sub')) {
        cell.style.cssText = 'background-color:#1F4E79;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #000000;text-align:center;';
      } 
      // Type Total/Header Styles (Orange #ED7D31)
      else if (cls.includes('cell-type-total') || cls.includes('cell-type') && !cls.includes('severity')) {
        cell.style.cssText = 'background-color:#ED7D31;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #000000;';
      } 
      // Grand Total Styles (Dark Blue #1F4E79)
      else if (cls.includes('cell-grand') || cls.includes('cell-grand-label')) {
        cell.style.cssText = 'background-color:#1F4E79;color:#FFFFFF;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #000000;text-align:center;';
      }
      // Severity Header / Assignee Name (White Background, Bold)
      else if (cls.includes('cell-severity') || cls.includes('cell-severity-h') || cls.includes('cell-assignee')) {
         cell.style.cssText = 'background-color:#FFFFFF;color:#000000;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #000000;';
      }
      // Data Values (White Background)
      else {
        cell.style.cssText = 'background-color:#FFFFFF;color:#000000;font-family:Calibri,Arial,sans-serif;font-size:11px;padding:4px 8px;border:1px solid #000000;text-align:center;';
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
  setTimeout(() => { btnEl.textContent = btnEl.dataset.origText || ' Copy'; }, 2000);
}