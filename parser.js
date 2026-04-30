// parser.js
// Columns from Mantis Extract: Id, Project, Reporter, Summary, Description,
// Steps to Reproduce, Notes, Status, Type, Assigned To, Priority, Severity,
// Category, Date Submitted, Cycle, Origin, Reopened

function parseCSV(csvText) {
  if (!csvText || csvText.trim() === '') return [];

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1)
    .map(line => {
      const values = parseCSVLine(line);
      const ticket = {};
      headers.forEach((h, i) => {
        ticket[h] = (values[i] || '').trim().replace(/^"|"$/g, '');
      });
      return ticket;
    })
    .filter(t => t['Id'] && t['Id'].trim() !== '');
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Normalize status to lowercase for consistent bucketing
function normalizeStatus(raw) {
  return (raw || '').toLowerCase().trim();
}

// Get all unique statuses from tickets (always include these 4 in order)
const STANDARD_STATUSES = ['assigned', 'feedback', 'resolved', 'closed'];

function getStatuses(tickets) {
  const found = new Set(tickets.map(t => normalizeStatus(t['Status'])).filter(Boolean));
  const ordered = STANDARD_STATUSES.filter(s => found.has(s));
  // Add any extra statuses not in the standard list
  found.forEach(s => { if (!STANDARD_STATUSES.includes(s)) ordered.push(s); });
  return ordered;
}

// ─────────────────────────────────────────────
// DASHBOARD 1: Per Ticket Type Dashboard
// Replicates left pivot table in Excel:
//   Row: Type > Severity
//   Col: Status (assigned, feedback, resolved, closed) + Grand Total
//   Val: Count
// ─────────────────────────────────────────────
function buildTypeDashboardData(tickets) {
  const statuses = getStatuses(tickets);

  // Build nested structure: { type: { severity: { status: count } } }
  const tree = {};

  tickets.forEach(t => {
    const type = (t['Type'] || 'Unknown').trim();
    const severity = normalizeStatus(t['Severity']) || 'unknown';
    const status = normalizeStatus(t['Status']);

    if (!tree[type]) tree[type] = {};
    if (!tree[type][severity]) tree[type][severity] = {};
    tree[type][severity][status] = (tree[type][severity][status] || 0) + 1;
  });

  // Sort types alphabetically
  const types = Object.keys(tree).sort();

  // Build rows array for rendering
  const rows = [];
  const grandTotals = {};

  types.forEach(type => {
    const severities = Object.keys(tree[type]).sort();
    const typeTotals = {};

    // Individual severity rows
    severities.forEach(severity => {
      const severityRow = { type, severity, counts: {}, rowTotal: 0 };
      statuses.forEach(s => {
        const c = tree[type][severity][s] || 0;
        severityRow.counts[s] = c;
        severityRow.rowTotal += c;
        typeTotals[s] = (typeTotals[s] || 0) + c;
        grandTotals[s] = (grandTotals[s] || 0) + c;
      });
      rows.push({ kind: 'severity', type, severity, ...severityRow });
    });

    // Type subtotal row
    let typeTotal = 0;
    statuses.forEach(s => { typeTotal += typeTotals[s] || 0; });
    rows.push({ kind: 'type_total', type, counts: typeTotals, rowTotal: typeTotal });
  });

  // Grand total row
  let grandTotal = 0;
  statuses.forEach(s => { grandTotal += grandTotals[s] || 0; });
  rows.push({ kind: 'grand_total', counts: grandTotals, rowTotal: grandTotal });

  return { statuses, rows };
}

// ─────────────────────────────────────────────
// DASHBOARD 2: Per Severity and Assigned To Dashboard
// Replicates right pivot table in Excel:
//   Row: Type > Severity > Assigned To
//   Col: Status + Grand Total
//   Val: Count
// ─────────────────────────────────────────────
function buildAssigneeDashboardData(tickets) {
  const statuses = getStatuses(tickets);

  // Build nested: { type: { severity: { assignee: { status: count } } } }
  const tree = {};

  tickets.forEach(t => {
    const type = (t['Type'] || 'Unknown').trim();
    const severity = normalizeStatus(t['Severity']) || 'unknown';
    const assignee = (t['Assigned To'] || 'Unassigned').trim();
    const status = normalizeStatus(t['Status']);

    if (!tree[type]) tree[type] = {};
    if (!tree[type][severity]) tree[type][severity] = {};
    if (!tree[type][severity][assignee]) tree[type][severity][assignee] = {};
    tree[type][severity][assignee][status] = (tree[type][severity][assignee][status] || 0) + 1;
  });

  const types = Object.keys(tree).sort();
  const rows = [];
  const grandTotals = {};

  types.forEach(type => {
    const severities = Object.keys(tree[type]).sort();
    const typeTotals = {};

    // Type header row (no counts, just label like Excel)
    rows.push({ kind: 'type_header', type });

    severities.forEach(severity => {
      const assignees = Object.keys(tree[type][severity]).sort();
      const severityTotals = {};

      // Severity header row
      rows.push({ kind: 'severity_header', type, severity });

      assignees.forEach(assignee => {
        const assigneeRow = { counts: {}, rowTotal: 0 };
        statuses.forEach(s => {
          const c = tree[type][severity][assignee][s] || 0;
          assigneeRow.counts[s] = c;
          assigneeRow.rowTotal += c;
          severityTotals[s] = (severityTotals[s] || 0) + c;
          typeTotals[s] = (typeTotals[s] || 0) + c;
          grandTotals[s] = (grandTotals[s] || 0) + c;
        });
        rows.push({ kind: 'assignee', type, severity, assignee, ...assigneeRow });
      });
    });
  });

  // Grand total
  let grandTotal = 0;
  statuses.forEach(s => { grandTotal += grandTotals[s] || 0; });
  rows.push({ kind: 'grand_total', counts: grandTotals, rowTotal: grandTotal });

  return { statuses, rows };
}
