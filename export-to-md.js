#!/usr/bin/env node
// Export all Claude conversations to individual markdown files.
// Merges pre-compact snapshots (~/claude-transcripts/) with post-compact
// continuations (~/.claude/projects/) into a single complete md per session.

if (process.platform === 'win32') {
  try { process.stdout.reconfigure({ encoding: 'utf8' }); } catch {}
}

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const SAVED_DIR = path.join(HOME, 'claude-transcripts');
const OUT_DIR = process.argv[2] || path.join(HOME, 'Desktop', 'Claude对话记录');

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c && c.type === 'text').map(c => c.text).join('');
  }
  return '';
}

function cleanText(text) {
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

function formatDate(ts) {
  if (!ts) return 'Unknown';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function safeFilename(str) {
  return str
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

// ── Scan files ────────────────────────────────────────────────────────────────

// Returns map: sessionId (full UUID) → full path in projects/
function scanProjectFiles() {
  const map = new Map(); // sessionId → filePath
  if (!fs.existsSync(PROJECTS_DIR)) return map;
  for (const proj of fs.readdirSync(PROJECTS_DIR)) {
    const projPath = path.join(PROJECTS_DIR, proj);
    try {
      if (!fs.statSync(projPath).isDirectory()) continue;
      for (const file of fs.readdirSync(projPath)) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.replace('.jsonl', '');
        // Only UUID-style filenames (session files)
        if (!/^[0-9a-f-]{36}$/.test(sessionId)) continue;
        map.set(sessionId, path.join(projPath, file));
      }
    } catch {}
  }
  return map;
}

// Returns map: sessionIdPrefix (8 chars) → array of { filePath, savedAt (Date) }
// sorted oldest→newest (for multiple compactions of same session)
function scanSavedFiles() {
  const map = new Map();
  if (!fs.existsSync(SAVED_DIR)) return map;
  for (const file of fs.readdirSync(SAVED_DIR)) {
    if (!file.endsWith('.jsonl')) continue;
    // Expected format: 2026-03-27_14-30-00_abc12345.jsonl
    const m = file.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_([0-9a-f]{8})\.jsonl$/);
    if (!m) continue;
    const savedAt = new Date(m[1].replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2'));
    const prefix = m[2];
    if (!map.has(prefix)) map.set(prefix, []);
    map.get(prefix).push({ filePath: path.join(SAVED_DIR, file), savedAt });
  }
  // Sort each group oldest first
  for (const arr of map.values()) arr.sort((a, b) => a.savedAt - b.savedAt);
  return map;
}

// ── Merge logic ───────────────────────────────────────────────────────────────

// Given an ordered list of snapshot files + a live projects file,
// produce a merged message array covering the full conversation.
function mergeMessages(snapshots, liveFile) {
  if (snapshots.length === 0) {
    return { messages: parseMessages(liveFile), hadMerge: false };
  }

  // Collect all snapshot messages in order, deduplicating by (role+ts+text)
  let allMsgs = [];
  const seen = new Set();
  for (const { filePath } of snapshots) {
    for (const m of parseMessages(filePath)) {
      const key = `${m.role}|${m.ts}|${m.text.slice(0, 80)}`;
      if (!seen.has(key)) { seen.add(key); allMsgs.push(m); }
    }
  }

  if (!liveFile) return { messages: allMsgs, hadMerge: false };

  // Find the last timestamp in our snapshots
  const lastSnapTs = allMsgs.filter(m => m.ts).at(-1)?.ts;

  // From live file, take only messages newer than the last snapshot message
  const liveMsgs = parseMessages(liveFile);
  let newMsgs;
  if (lastSnapTs) {
    newMsgs = liveMsgs.filter(m => m.ts && m.ts > lastSnapTs);
  } else {
    // No timestamps to compare — fall back to dedup only
    newMsgs = liveMsgs.filter(m => {
      const key = `${m.role}|${m.ts}|${m.text.slice(0, 80)}`;
      return !seen.has(key);
    });
  }

  const hadMerge = newMsgs.length > 0;
  if (hadMerge) {
    allMsgs = allMsgs.concat(newMsgs);
  }

  return { messages: allMsgs, hadMerge };
}

// ── Markdown generation ───────────────────────────────────────────────────────

function toMarkdown(msgs, hadMerge) {
  const firstTs = msgs.find(m => m.ts)?.ts;
  const lastTs = [...msgs].reverse().find(m => m.ts)?.ts;
  const firstUser = msgs.find(m => m.role === 'user');

  let md = `# ${firstUser ? firstUser.text.split('\n')[0].slice(0, 60) : 'Claude Conversation'}\n\n`;
  md += `- **Start:** ${formatDate(firstTs)}\n`;
  md += `- **End:** ${formatDate(lastTs)}\n`;
  md += `- **Messages:** ${msgs.length}\n`;
  if (hadMerge) md += `- **Note:** Pre- and post-compact messages merged\n`;
  md += '\n---\n\n';

  for (const msg of msgs) {
    const label = msg.role === 'user' ? '## You' : '## Claude';
    const ts = msg.ts ? `  \`${formatDate(msg.ts)}\`` : '';
    md += `${label}${ts}\n\n${msg.text}\n\n---\n\n`;
  }

  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const projectFiles = scanProjectFiles();   // sessionId → filePath
const savedFiles   = scanSavedFiles();     // prefix8  → [{filePath, savedAt}]

// Build sessions: key = sessionId (full UUID from projects) or prefix (saved-only)
const sessions = new Map();

for (const [sessionId, liveFile] of projectFiles) {
  sessions.set(sessionId, { liveFile, snapshots: [] });
}

for (const [prefix, snaps] of savedFiles) {
  // Match to a full session ID that starts with this prefix
  const fullId = [...projectFiles.keys()].find(id => id.startsWith(prefix));
  if (fullId) {
    sessions.get(fullId).snapshots = snaps;
  } else {
    // No matching live file — saved-only session (project deleted/moved)
    sessions.set('saved:' + prefix, { liveFile: null, snapshots: snaps });
  }
}

let exported = 0, skipped = 0;

for (const [sessionId, { liveFile, snapshots }] of sessions) {
  const { messages, hadMerge } = mergeMessages(snapshots, liveFile);
  if (messages.length === 0) { skipped++; continue; }

  const firstTs = messages.find(m => m.ts)?.ts;
  const firstUser = messages.find(m => m.role === 'user');
  const datePrefix = firstTs ? new Date(firstTs).toISOString().slice(0, 10) : 'unknown';
  const preview = firstUser ? safeFilename(firstUser.text.split('\n')[0]) : 'conversation';
  const filename = `${datePrefix}_${preview}.md`;
  const outPath = path.join(OUT_DIR, filename);

  // Skip if output is up to date (compare against newest source file)
  if (fs.existsSync(outPath)) {
    const outMtime = fs.statSync(outPath).mtimeMs;
    const srcMtimes = [
      liveFile && fs.existsSync(liveFile) ? fs.statSync(liveFile).mtimeMs : 0,
      ...snapshots.map(s => fs.existsSync(s.filePath) ? fs.statSync(s.filePath).mtimeMs : 0),
    ];
    if (outMtime >= Math.max(...srcMtimes)) { skipped++; continue; }
  }

  fs.writeFileSync(outPath, toMarkdown(messages, hadMerge), 'utf8');
  const tag = hadMerge ? ' [merged]' : '';
  console.log(`Exported: ${filename}${tag}`);
  exported++;
}

console.log(`\nDone. Exported: ${exported}, Skipped (unchanged): ${skipped}`);
console.log('Output folder: ' + OUT_DIR);
