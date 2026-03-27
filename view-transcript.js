#!/usr/bin/env node
// Claude conversation viewer
// Scans all conversations from ~/.claude/projects/ and ~/claude-transcripts/

if (process.platform === 'win32') {
  try { process.stdout.reconfigure({ encoding: 'utf8' }); } catch {}
  try { process.stderr.reconfigure({ encoding: 'utf8' }); } catch {}
}

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const SAVED_DIR = path.join(HOME, 'claude-transcripts');

// Calculate display width accounting for CJK double-width characters
function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x303E) ||
      (code >= 0x3040 && code <= 0x33FF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6)
    ) w += 2; else w += 1;
  }
  return w;
}

function padEnd(str, width) {
  const pad = width - displayWidth(str);
  return str + ' '.repeat(Math.max(0, pad));
}

function padStart(str, width) {
  const pad = width - displayWidth(str);
  return ' '.repeat(Math.max(0, pad)) + str;
}

// Truncate string to fit display width, appending ellipsis if needed
function truncate(str, maxWidth) {
  let w = 0;
  let result = '';
  for (const ch of str) {
    const cw = displayWidth(ch);
    if (w + cw > maxWidth - 1) return result + '…';
    result += ch;
    w += cw;
  }
  return padEnd(result, maxWidth);
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c && c.type === 'text').map(c => c.text).join('');
  }
  return '';
}

// Re-render a markdown table block into aligned plain text
function renderMarkdownTable(tableText) {
  const lines = tableText.trim().split('\n').map(l => l.trim());
  // Parse rows: split by | and trim cells
  const rows = lines
    .filter(l => l.startsWith('|') && !l.match(/^\|[\s\-:]+[\|\-:\s]*$/))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (rows.length === 0) return tableText;

  // Calculate max display width per column
  const colCount = Math.max(...rows.map(r => r.length));
  const colWidths = Array(colCount).fill(0);
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const w = displayWidth(row[i] || '');
      if (w > colWidths[i]) colWidths[i] = w;
    }
  }

  const renderRow = (row) =>
    '| ' + Array(colCount).fill(0).map((_, i) => {
      const cell = row[i] || '';
      return padEnd(cell, colWidths[i]);
    }).join(' | ') + ' |';

  const separator = '+-' + colWidths.map(w => '-'.repeat(w)).join('-+-') + '-+';

  const out = [separator];
  rows.forEach((row, i) => {
    out.push(renderRow(row));
    if (i === 0) out.push(separator); // after header
  });
  out.push(separator);
  return out.join('\n');
}

function cleanText(text) {
  // Render markdown tables before stripping other tags
  text = text.replace(/((?:^\|.+\n?)+)/gm, (match) => renderMarkdownTable(match));
  return text
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<parameter name="[^"]*">[\s\S]*?<\/antml:parameter>/g, '')
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .replace(/^Read the output file to retrieve the result:.*$/gm, '')
    .trim();
}

function parseMessages(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const messages = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const role = obj.message && obj.message.role;
        if (!role || obj.isMeta) continue;
        if (role !== 'user' && role !== 'assistant') continue;
        const text = cleanText(extractText(obj.message.content));
        if (!text) continue;
        messages.push({ role, text, ts: obj.timestamp || null });
      } catch {}
    }
    return messages;
  } catch {
    return [];
  }
}

function scanAllConversations() {
  const results = [];
  const seen = new Set();

  if (fs.existsSync(PROJECTS_DIR)) {
    for (const proj of fs.readdirSync(PROJECTS_DIR)) {
      const projPath = path.join(PROJECTS_DIR, proj);
      try {
        if (!fs.statSync(projPath).isDirectory()) continue;
        for (const file of fs.readdirSync(projPath)) {
          if (!file.endsWith('.jsonl')) continue;
          const filePath = path.join(projPath, file);
          if (seen.has(filePath)) continue;
          seen.add(filePath);
          const msgs = parseMessages(filePath);
          if (msgs.length === 0) continue;
          const firstUserMsg = msgs.find(m => m.role === 'user');
          const firstTs = msgs.find(m => m.ts)?.ts;
          const lastTs = [...msgs].reverse().find(m => m.ts)?.ts;
          results.push({
            filePath, source: 'live', msgCount: msgs.length,
            preview: firstUserMsg ? firstUserMsg.text.replace(/\n/g, ' ') : '',
            firstTs, lastTs,
          });
        }
      } catch {}
    }
  }

  if (fs.existsSync(SAVED_DIR)) {
    for (const file of fs.readdirSync(SAVED_DIR)) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(SAVED_DIR, file);
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      const msgs = parseMessages(filePath);
      if (msgs.length === 0) continue;
      const firstUserMsg = msgs.find(m => m.role === 'user');
      const firstTs = msgs.find(m => m.ts)?.ts;
      const lastTs = [...msgs].reverse().find(m => m.ts)?.ts;
      results.push({
        filePath, source: 'saved', msgCount: msgs.length,
        preview: firstUserMsg ? firstUserMsg.text.replace(/\n/g, ' ') : '',
        firstTs, lastTs,
      });
    }
  }

  results.sort((a, b) => {
    const ta = a.lastTs || a.firstTs || '';
    const tb = b.lastTs || b.firstTs || '';
    return tb.localeCompare(ta);
  });

  return results;
}

function formatDate(ts) {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function printConversation(filePath) {
  const msgs = parseMessages(filePath);
  if (msgs.length === 0) {
    console.log('No readable messages found.');
    return;
  }
  console.log('\n' + '='.repeat(70));
  console.log('File: ' + filePath);
  console.log('Messages: ' + msgs.length);
  console.log('='.repeat(70) + '\n');
  for (const msg of msgs) {
    const label = msg.role === 'user' ? '[You]' : '[Claude]';
    const ts = msg.ts ? '  ' + formatDate(msg.ts) : '';
    console.log(label + ts);
    console.log(msg.text);
    console.log();
  }
}

function printMenu(convs) {
  console.clear();
  console.log('Claude Conversation Viewer');
  console.log('='.repeat(50));
  console.log('');

  convs.forEach((c, i) => {
    const num = String(i + 1).padStart(3);
    const date = formatDate(c.lastTs || c.firstTs);
    const count = c.msgCount + ' msgs';
    const tag = c.source === 'saved' ? ' [saved]' : '';
    const preview = (c.preview || '(empty)').slice(0, 50).replace(/\n/g, ' ');
    console.log(`${num}.  [${date}] ${count}${tag}`);
    console.log(`      ${preview}`);
    console.log('');
  });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const arg = process.argv[2];
  if (arg) {
    printConversation(arg);
    return;
  }

  process.stdout.write('Scanning conversations...\n');
  const convs = scanAllConversations();

  if (convs.length === 0) {
    console.log('No conversations found.');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    printMenu(convs);
    const answer = await ask(rl, `Enter number to view (1-${convs.length}), or press Enter to exit: `);
    const n = parseInt(answer.trim());
    if (!n || n < 1 || n > convs.length) {
      rl.close();
      console.log('Bye.');
      break;
    }
    printConversation(convs[n - 1].filePath);
    await ask(rl, '\nPress Enter to return to menu...');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
