// dashboard.js - Renders HTML tables that replicate the Excel Defect Dashboard

// ─────────────────────────────────────────────
// TABLE 1: Per Ticket Type Dashboard
// ─────────────────────────────────────────────
function renderTypeDashboard(tickets) {
  const { statuses, rows } = buildTypeDashboardData(tickets);

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

  const totalCols = statuses.length + 3;

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
  const clone = table.cloneNode(true);

  // ── Style tokens ──────────────────────────────────────────────────
  const font      = 'font-family:Calibri,Arial,sans-serif;font-size:11px;';
  const border    = 'border:1px solid #000000;';
  const pad       = 'padding:4px 8px;';
  const base      = font + border + pad;

  // Row 1: dark navy title bar
  const S_HEADER  = base + 'background-color:#002060 !important;color:#FFFFFF !important;font-weight:bold;text-align:center;font-size:12px;';

  // Row 2: lighter blue column headers — ALL columns same colour
  const S_COLHEAD = base + 'background-color:#5B9BD5 !important;color:#FFFFFF !important;font-weight:bold;text-align:center;';
  const S_COLHEAD_LEFT = base + 'background-color:#5B9BD5 !important;color:#FFFFFF !important;font-weight:bold;text-align:left;';

  // Orange type rows
  const S_ORANGE_L = base + 'background-color:#E87722 !important;color:#FFFFFF !important;font-weight:bold;text-align:left;';
  const S_ORANGE_C = base + 'background-color:#E87722 !important;color:#FFFFFF !important;font-weight:bold;text-align:center;';

  // Grand total row — dark navy, white
  const S_GRAND_L = base + 'background-color:#002060 !important;color:#FFFFFF !important;font-weight:bold;text-align:left;';
  const S_GRAND_C = base + 'background-color:#002060 !important;color:#FFFFFF !important;font-weight:bold;text-align:center;';

  // Severity breakdown rows — white bg, NOT bold
  const S_SEV_LBL = base + 'background-color:#FFFFFF;color:#000000;font-weight:normal;text-align:left;';
  const S_SEV_VAL = base + 'background-color:#FFFFFF;color:#000000;font-weight:normal;text-align:center;';

  // Assignee cell
  const S_ASSIGNEE = base + 'background-color:#FFFFFF;color:#000000;font-weight:normal;text-align:left;';

  // Empty spacer
  const S_EMPTY   = base + 'background-color:#FFFFFF;color:#000000;';
  // ─────────────────────────────────────────────────────────────────

  clone.querySelectorAll('tr').forEach(tr => {
    tr.querySelectorAll('td, th').forEach(cell => {
      const cls = cell.className || '';

      // Row 1 — title spanning header
      if (cls.includes('header-group') || cls.includes('header-main')) {
        cell.setAttribute('style', S_HEADER);

      // Row 2 — column headers (all same lighter blue)
      } else if (cls.includes('col-label') || cls.includes('col-label-sub')) {
        cell.setAttribute('style', S_COLHEAD_LEFT);
      } else if (cls.includes('col-status') || cls.includes('col-total')) {
        cell.setAttribute('style', S_COLHEAD);

      // Orange type-total row
      } else if (cls.includes('cell-type-total')) {
        cell.setAttribute('style', S_ORANGE_L);
      } else if (cls.includes('cell-subtotal-total') || cls.includes('cell-subtotal')) {
        cell.setAttribute('style', S_ORANGE_C);

      // Grand total row — white text on navy
      } else if (cls.includes('cell-grand-label')) {
        cell.setAttribute('style', S_GRAND_L);
      } else if (cls.includes('cell-grand')) {
        cell.setAttribute('style', S_GRAND_C);

      // Severity label — NOT bold
      } else if (cls.includes('cell-severity-h') || cls.includes('cell-severity')) {
        cell.setAttribute('style', S_SEV_LBL);

      // Data value / row-total cells — NOT bold
      } else if (cls.includes('cell-value') || cls.includes('cell-total')) {
        cell.setAttribute('style', S_SEV_VAL);

      // Assignee cell — mailto hyperlink, NOT bold
      } else if (cls.includes('cell-assignee')) {
        cell.setAttribute('style', S_ASSIGNEE);
        const a = cell.querySelector('a.cell-assignee-link');
        if (a) {
          a.setAttribute('style', 'color:#0563C1;text-decoration:underline;' + font);
        } else if (cell.textContent.includes('@')) {
          const email   = (cell.getAttribute('title') || cell.textContent).trim();
          const display = cell.textContent.trim();
          cell.innerHTML = `<a href="mailto:${email}" style="color:#0563C1;text-decoration:underline;${font}">${display}</a>`;
        }

      // Empty spacers
      } else {
        cell.setAttribute('style', S_EMPTY);
      }
    });
  });

  clone.setAttribute('style', 'border-collapse:collapse;' + font);
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