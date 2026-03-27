#!/usr/bin/env node
// PreCompact hook: saves current conversation transcript before compaction

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const sessionId = hookData.session_id;
    if (!sessionId) {
      process.stderr.write('No session_id in hook data\n');
      process.exit(0);
    }

    // Find the project directory for this session
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    let found = null;

    const projects = fs.readdirSync(projectsDir);
    for (const proj of projects) {
      const candidate = path.join(projectsDir, proj, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) {
        found = candidate;
        break;
      }
    }

    if (!found) {
      process.stderr.write(`Could not find transcript for session: ${sessionId}\n`);
      process.exit(0);
    }

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const destDir = path.join(os.homedir(), 'claude-transcripts');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${ts}_${sessionId.slice(0, 8)}.jsonl`);

    fs.copyFileSync(found, dest);
    process.stderr.write(`Transcript saved: ${dest}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`save-transcript error: ${e.message}\n`);
    process.exit(0);
  }
});
