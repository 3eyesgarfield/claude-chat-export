# Claude Transcript Tools

A set of tools for saving, viewing, and exporting Claude Code conversation history on Windows.

## Features

- **Auto-save before `/compact`** — A PreCompact hook automatically saves the full conversation before Claude compresses it
- **View conversations** — Browse all past conversations in a cmd window
- **Export to Markdown** — Export all conversations as readable `.md` files, merging pre- and post-compact history into one complete file

## Requirements

- [Claude Code](https://claude.ai/code)
- [Node.js](https://nodejs.org)

## Setup

### First machine

Run `Claude-Setup.bat`. It will:

1. Copy the scripts to `%USERPROFILE%\.claude\scripts\`
2. Add the `PreCompact` hook to `%USERPROFILE%\.claude\settings.json`
3. Create the `%USERPROFILE%\claude-transcripts\` folder

### Other machines

Copy all files in this repo to the target machine, then run `Claude-Setup.bat`.

## Usage

| File | Action |
|------|--------|
| `View Conversations.bat` | Browse all conversations interactively |
| `Export to MD.bat` | Export all conversations to `Claude-Conversations\` as `.md` files |

## How it works

```
Normal conversation
      ↓
  /compact triggered
      ↓  PreCompact hook fires → saves full .jsonl to ~/claude-transcripts/
  Conversation continues
      ↓
  Run "Export to MD.bat"
      ↓  Merges pre-compact snapshot + post-compact messages
         into one complete .md file per conversation
```

### Files

| Script | Description |
|--------|-------------|
| `save-transcript.js` | PreCompact hook — copies current session file before compaction |
| `view-transcript.js` | Interactive viewer — scans all conversations and displays them in cmd |
| `export-to-md.js` | Exports conversations to markdown, merging split sessions |

## Notes

- Exported `.md` files are saved next to the `.bat` file in a `Claude-Conversations\` subfolder
- Already-exported files are skipped unless the source has changed
- Conversations that were compacted will show `Note: Pre- and post-compact messages merged` in the header
