// Columns from Mantis Extract: Id, Project, Reporter, Summary, Description,
// Steps to Reproduce, Notes, Status, Type, Assigned To, Priority, Severity,
// Category, Date Submitted, Cycle, Origin, Reopened

function parseCSV(csvText) {
  if (!csvText || csvText.trim() === '') return [];

  const tickets = [];
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    console.warn('[Parser] CSV has less than 2 lines:', lines.length);
    return [];
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  console.log(`[Parser] Headers found: ${headers.join(', ')}`);
  console.log(`[Parser] Expected ${headers.length} columns per row`);

  const csvBody = lines.slice(1).join('\n');
  const records = parseCSVRecords(csvBody, headers.length);

  console.log(`[Parser] Found ${records.length} potential records (may include partial lines)`);

  const errors = [];
  records.forEach((record, idx) => {
    if (record.length === 0) return; 

    const ticket = {};
    let isValid = true;

    if (record.length !== headers.length) {
      errors.push(`Record ${idx}: expected ${headers.length} cols, got ${record.length}`);
      isValid = false;
    }

    headers.forEach((h, i) => {
      ticket[h] = (record[i] || '').trim().replace(/^"|"$/g, '');
    });

    if (ticket['Id'] && ticket['Id'].trim() !== '' && isValid) {
      tickets.push(ticket);
    } else if (!isValid) {
    
      if (errors.length <= 5) {
        console.warn(`[Parser] ${errors[errors.length - 1]} | First col: "${record[0]?.substring(0, 30)}..."`);
      }
    }
  });

  if (errors.length > 5) {
    console.warn(`[Parser] ... and ${errors.length - 5} more errors`);
  }

  console.log(`[Parser] Parsed: ${tickets.length} valid tickets from ${lines.length - 1} data lines`);
  if (records.length !== lines.length - 1) {
    console.warn(`[Parser] ⚠️ Line count mismatch: ${lines.length - 1} raw lines → ${records.length} records (suggests multi-line fields)`);
  }

  return tickets;
}

// Parse CSV respecting quoted fields (including embedded newlines and commas)
function parseCSVRecords(csvBody, expectedColumns) {
  const records = [];
  let currentRecord = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvBody.length; i++) {
    const ch = csvBody[i];

    if (ch === '"') {
      if (inQuotes && csvBody[i + 1] === '"') {
        
        current += '"';
        i++;
      } else {
        
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
     
      currentRecord.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      
      if (current || currentRecord.length > 0) {
        currentRecord.push(current);
        current = '';

        if (currentRecord.length === expectedColumns || currentRecord.some(f => f.trim())) {
          records.push(currentRecord);
          currentRecord = [];
        }
      }
     
      if (ch === '\r' && csvBody[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }

  if (current || currentRecord.length > 0) {
    currentRecord.push(current);
    if (currentRecord.length === expectedColumns || currentRecord.some(f => f.trim())) {
      records.push(currentRecord);
    }
  }

  return records;
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

function normalizeStatus(raw) {
  return (raw || '').toLowerCase().trim();
}

// Get all unique statuses from tickets (always include these 4 in order)
const STANDARD_STATUSES = ['assigned', 'feedback', 'resolved', 'closed'];

function getStatuses(tickets) {
  const STANDARD_STATUSES = ['assigned', 'feedback', 'resolved', 'closed'];
  
  const found = new Set(tickets.map(t => normalizeStatus(t['Status'])).filter(s => s && isNaN(s))); 
  
  const ordered = STANDARD_STATUSES.filter(s => found.has(s));
  found.forEach(s => { 
    if (!STANDARD_STATUSES.includes(s)) ordered.push(s); 
  });
  return ordered;
}

// ─────────────────────────────────────────────
// DASHBOARD 1: Per Ticket Type Dashboard
//   Row: Type > Severity
//   Col: Status (assigned, feedback, resolved, closed) + Grand Total
//   Val: Count
// ─────────────────────────────────────────────
function buildTypeDashboardData(tickets) {
  const statuses = getStatuses(tickets);
  const tree = {};

  tickets.forEach(t => {
    const type = (t['Type'] || 'Unknown').trim();
    const severity = normalizeStatus(t['Severity']) || 'unknown';
    const status = normalizeStatus(t['Status']);

    if (!tree[type]) tree[type] = {};
    if (!tree[type][severity]) tree[type][severity] = {};
    tree[type][severity][status] = (tree[type][severity][status] || 0) + 1;
  });

  const types = Object.keys(tree).sort();

  const rows = [];
  const grandTotals = {};

  types.forEach(type => {
    const severities = Object.keys(tree[type]).sort();
    const typeTotals = {};

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

    let typeTotal = 0;
    statuses.forEach(s => { typeTotal += typeTotals[s] || 0; });
    rows.push({ kind: 'type_total', type, counts: typeTotals, rowTotal: typeTotal });
  });

  let grandTotal = 0;
  statuses.forEach(s => { grandTotal += grandTotals[s] || 0; });
  rows.push({ kind: 'grand_total', counts: grandTotals, rowTotal: grandTotal });

  return { statuses, rows };
}

// ─────────────────────────────────────────────
// DASHBOARD 2: Per Severity and Assigned To Dashboard
//   Row: Type > Severity > Assigned To
//   Col: Status + Grand Total
//   Val: Count
// ─────────────────────────────────────────────
function buildAssigneeDashboardData(tickets) {
  const statuses = getStatuses(tickets);

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

    rows.push({ kind: 'type_header', type });

    severities.forEach(severity => {
      const assignees = Object.keys(tree[type][severity]).sort();
      const severityTotals = {};

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

  let grandTotal = 0;
  statuses.forEach(s => { grandTotal += grandTotals[s] || 0; });
  rows.push({ kind: 'grand_total', counts: grandTotals, rowTotal: grandTotal });

  return { statuses, rows };
}
