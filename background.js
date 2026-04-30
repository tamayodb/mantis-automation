// background.js - Service Worker

// Handle chunked CSV uploads
let csvChunks = [];
let csvExpectedLines = 0;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CSV_READY') {
    const lineCount = msg.lineCount || msg.csvData.trim().split('\n').length - 1;
    console.log(`[BG] CSV_READY: ${msg.csvData.length} chars, ${lineCount} tickets`);
    
    chrome.storage.local.set({
      lastCSV: msg.csvData,
      lastUpdated: new Date().toISOString(),
      ticketCount: lineCount
    }, () => {
      console.log(`[BG] CSV stored successfully (${lineCount} tickets)`);
    });
  }

  if (msg.action === 'CSV_CHUNK') {
    csvChunks[msg.chunkIndex] = msg.chunk;
    console.log(`[BG] Chunk ${msg.chunkIndex} received (${msg.chunk.length} chars)`);
    
    if (msg.isLast) {
      console.log(`[BG] All chunks received. Assembling...`);
      assembleChunks();
    }
  }

  if (msg.action === 'CSV_CHUNKS_DONE') {
    csvExpectedLines = msg.totalLines;
    console.log(`[BG] Expected ${msg.totalLines} total data lines`);
  }

  if (msg.action === 'CSV_ERROR') {
    console.error(`[BG] CSV Error: ${msg.message}`);
    chrome.storage.local.set({ 
      csvError: msg.message,
      csvErrorTime: new Date().toISOString()
    });
  }

  sendResponse({ ok: true });
});

function assembleChunks() {
  if (csvChunks.length === 0) {
    console.error('[BG] No chunks to assemble');
    return;
  }

  // Extract header from first chunk
  const firstLines = csvChunks[0].split('\n');
  const header = firstLines[0];
  
  // Combine all data lines, removing duplicate headers from subsequent chunks
  const allLines = [header];
  csvChunks.forEach((chunk, idx) => {
    const lines = chunk.split('\n');
    if (idx > 0) {
      // Skip header on non-first chunks
      lines.slice(1).forEach(line => {
        if (line.trim()) allLines.push(line);
      });
    } else {
      // First chunk: skip header (already added)
      lines.slice(1).forEach(line => {
        if (line.trim()) allLines.push(line);
      });
    }
  });

  const fullCSV = allLines.join('\n');
  const lineCount = allLines.length - 1;

  console.log(`[BG] Assembled CSV: ${fullCSV.length} chars, ${lineCount} lines`);

  chrome.storage.local.set({
    lastCSV: fullCSV,
    lastUpdated: new Date().toISOString(),
    ticketCount: lineCount
  }, () => {
    console.log(`[BG] Chunked CSV stored successfully (${lineCount} tickets)`);
    csvChunks = [];
  });
}

