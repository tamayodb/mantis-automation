// dashboard.js - Renders HTML tables that replicate the Excel Defect Dashboard

// ─────────────────────────────────────────────
// TABLE 1: Per Ticket Type Dashboard
// ─────────────────────────────────────────────
function renderTypeDashboard(tickets) {
  const { statuses, rows } = buildTypeDashboardData(tickets);

  // Total columns = 1 (label) + statuses + 1 (grand total)
  const totalCols = statuses.length + 2;

  let html = `
  <table class="pivot-table" id="table-type-dashboard">
    <thead>
      <tr>
        <th class="header-group" colspan="${totalCols}">Per Ticket Type Dashboard</th>
      </tr>
      <tr>
        <th class="col-label">Type/Severity/Status</th>
        ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
        <th class="col-total">Grand Total</th>
      </tr>
    </thead>
    <tbody>`;

  // Group rows: orange type_total row FIRST, then severity breakdown underneath
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

      // Then severity breakdown rows — NOT bold
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

  // Total columns = 2 (label + assigned to) + statuses + 1 (grand total)
  const totalCols = statuses.length + 3;

  // Pre-group rows: type_total first, then severity_header + assignee rows under it
  const groups = [];
  let currentGroup = null;

  rows.forEach(row => {
    if (row.kind === 'type_header') {
      currentGroup = { typeRow: row, children: [] };
      groups.push(currentGroup);
    } else if (row.kind === 'grand_total') {
      groups.push({ grandTotal: row });
    } else {
      if (currentGroup) currentGroup.children.push(row);
    }
  });

  let html = `
  <table class="pivot-table" id="table-assignee-dashboard">
    <thead>
      <tr>
        <th class="header-group" colspan="${totalCols}">Per Severity and Assigned to Dashboard</th>
      </tr>
      <tr>
        <th class="col-label">Row Labels</th>
        <th class="col-label-sub">Assigned To</th>
        ${statuses.map(s => `<th class="col-status">${capitalize(s)}</th>`).join('')}
        <th class="col-total">Grand Total</th>
      </tr>
    </thead>
    <tbody>`;

  groups.forEach(group => {
    if (group.grandTotal) {
      const row = group.grandTotal;
      const cells = statuses.map(s => {
        const v = row.counts[s] || 0;
        return `<td class="cell-grand">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-grand-total">
        <td class="cell-grand-label" colspan="2">Grand Total</td>
        ${cells}
        <td class="cell-grand">${row.rowTotal}</td>
      </tr>`;

    } else {
      // Orange type total row FIRST (same behaviour as Table 1)
      const typeRow = group.typeRow;
      const typeCells = statuses.map(s => {
        const v = (typeRow.counts && typeRow.counts[s]) || 0;
        return `<td class="cell-subtotal">${v > 0 ? v : ''}</td>`;
      }).join('');
      html += `<tr class="row-type-total">
        <td class="cell-type-total" colspan="2">${typeRow.type}</td>
        ${typeCells}
        <td class="cell-subtotal-total">${typeRow.rowTotal > 0 ? typeRow.rowTotal : ''}</td>
      </tr>`;

      // Then severity headers and assignee rows — severity NOT bold
      group.children.forEach(row => {
        if (row.kind === 'severity_header') {
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
          const email = row.assignee || '';
          const isEmail = email.includes('@');
          const assigneeCell = isEmail
            ? `<a href="mailto:${email}" class="cell-assignee-link">${shortName}</a>`
            : shortName;
          html += `<tr class="row-assignee">
            <td class="cell-empty"></td>
            <td class="cell-assignee" title="${email}">${assigneeCell}</td>
            ${cells}
            <td class="cell-total">${row.rowTotal > 0 ? row.rowTotal : ''}</td>
          </tr>`;
        }
      });
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
  // Clone and apply inline styles mirroring injectDashboardStyles() in popup.js.
  const clone = table.cloneNode(true);

  // Shared style tokens
  const base   = 'font-family:Calibri,Arial,sans-serif;font-size:11px;padding:3px 8px;border:1px solid #000000;';
  const navy   = 'background-color:#002060;color:#FFFFFF;font-weight:bold;';  // #002060 per spec
  const orange = 'background-color:#E87722;color:#FFFFFF;font-weight:bold;';
  const white  = 'background-color:#FFFFFF;color:#000000;';
  const center = 'text-align:center;';
  const left   = 'text-align:left;';

  clone.querySelectorAll('tr').forEach(tr => {
    tr.querySelectorAll('td, th').forEach(cell => {
      const cls = cell.className;

      // ── Single-cell spanning header row: "Per Ticket Type Dashboard" title ──
      if (cls.includes('header-group') || cls.includes('header-main')) {
        cell.style.cssText = 'color:#FFFFFF;font-size:12px;padding:5px 8px;' + center + navy;

      // ── Column header row: col-label, col-label-sub, col-status, col-total ──
      } else if (
        cls.includes('col-label') ||
        cls.includes('col-label-sub') ||
        cls.includes('col-status') ||
        cls.includes('col-total')
      ) {
        cell.style.cssText = base + center;
          if (cls.includes('col-label') || cls.includes('col-label-sub')) {
            cell.style.textAlign = 'left';
            cell.style.backgroundColor = '#5B9BD5';
          }
      // ── Orange type-total row ──
      //   cell-type-total      → label (left)
      //   cell-subtotal        → status counts (center)
      //   cell-subtotal-total  → row grand total (center)
      } else if (cls.includes('cell-type-total')) {
        cell.style.cssText = base + orange + left;
      } else if (cls.includes('cell-subtotal-total') || cls.includes('cell-subtotal')) {
        cell.style.cssText = base + orange + center;

      // ── Grand total row (navy) ──
      } else if (cls.includes('cell-grand-label')) {
        cell.style.cssText = base + navy + left;
      } else if (cls.includes('cell-grand')) {
        cell.style.cssText = base + navy + center;

      // ── Severity label cells — NOT bold ──
      } else if (cls.includes('cell-severity-h') || cls.includes('cell-severity')) {
        cell.style.cssText = base + white + left + 'font-weight:normal;';

      // ── Data value / row-total cells ──
      } else if (cls.includes('cell-value') || cls.includes('cell-total')) {
        cell.style.cssText = base + white + center + 'font-weight:normal;';

      // ── Assignee cell: render as Outlook mailto hyperlink ──
      } else if (cls.includes('cell-assignee')) {
        cell.style.cssText = base + white + left + 'font-weight:normal;';
        // Convert any plain-text email inside to a mailto anchor
        const a = cell.querySelector('a.cell-assignee-link');
        if (a) {
          a.style.cssText = 'color:#0563C1;text-decoration:underline;font-family:Calibri,Arial,sans-serif;font-size:11px;';
        } else if (cell.textContent.includes('@')) {
          const email = cell.getAttribute('title') || cell.textContent.trim();
          const display = cell.textContent.trim();
          cell.innerHTML = `<a href="mailto:${email}" style="color:#0563C1;text-decoration:underline;font-family:Calibri,Arial,sans-serif;font-size:11px;">${display}</a>`;
        }

      // ── Empty spacer cells ──
      } else {
        cell.style.cssText = base + white;
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